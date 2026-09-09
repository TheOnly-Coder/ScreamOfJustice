// ViewModelRig.ts — dedicated first-person weapon rendering + spring physics.
//
// Why: the viewmodel used to live in the WORLD scene and chase the camera
// (position.copy + quaternion.slerp every frame, AFTER the camera had already
// moved). That one-frame lag made the gun phase into the camera while running
// forwards / aiming, and float behind while running backwards. It also meant
// ADS zoom (FOV 18-25) magnified the gun until it filled the lens.
//
// Fix, the standard FPS approach:
//  * The weapon lives in its OWN scene with its OWN camera fixed at the
//    origin (FOV 55, near 0.01). The main renderer draws the world first,
//    clears depth, then draws the weapon scene on top. The gun can therefore
//    never clip into the near plane, never intersect world geometry, and is
//    never distorted by ADS zoom. Scoped weapons (zoomFov <= 30) hide the
//    viewmodel in ADS so the world zoom reads as the scope.
//  * Motion is a physically-integrated damped spring (semi-implicit Euler,
//    framerate-independent): movement acceleration, landing impacts, look
//    deltas and recoil inject FORCES; the spring produces believable bob,
//    sway, roll and settle. Because the rig is rigid, the gun can never
//    drift away from the camera — springs only bend it locally.
//  * Melee swings drive the weapon mesh directly (legacy code). While a swing
//    is active the rig parks its group at identity so the swing coordinates
//    stay camera-local; when the swing ends the springs restart from identity
//    and pull the weapon back to the ready pose — a free "recover" animation.

import * as THREE from 'three';
import { WeaponModelKind, isMeleeKind } from './WeaponModelLoader';

export interface ViewModelCtx {
  kind: WeaponModelKind;
  isADS: boolean;
  speed2D: number;
  vel: THREE.Vector3;          // world-space player velocity
  grounded: boolean;
  yaw: number;                 // current view yaw (rad)
  pitch: number;               // current view pitch (rad)
  recoilOffsetZ: number;       // existing game recoil kick (positive = push away)
  recoilRotX: number;          // view kick pitch
  recoilRotY: number;          // view kick yaw
  meleeActive: boolean;        // melee swing drives the mesh itself
  hideInAds: boolean;          // scoped weapons: hide viewmodel when aiming
}

/** Hip / ready pose per weapon kind, in camera-local space (camera looks -Z).
 *  Distances are ~1.25x the old world-camera values to compensate for the
 *  tighter weapon FOV (55 vs 75). */
const HIP_POSE: Record<WeaponModelKind, { pos: [number, number, number]; rot: [number, number, number] }> = {
  rifle:    { pos: [0.17, -0.21, -0.56], rot: [0, 0.02, 0] },
  smg:      { pos: [0.16, -0.2, -0.48],  rot: [0, 0.02, 0] },
  p90:      { pos: [0.16, -0.2, -0.48],  rot: [0, 0.02, 0] },
  sniper:   { pos: [0.16, -0.2, -0.62],  rot: [0, 0.02, 0] },
  shotgun:  { pos: [0.17, -0.21, -0.58], rot: [0, 0.02, 0] },
  lmg:      { pos: [0.17, -0.22, -0.58], rot: [0, 0.02, 0] },
  pistol:   { pos: [0.15, -0.22, -0.5],  rot: [0, 0.012, 0] },
  revolver: { pos: [0.15, -0.22, -0.5],  rot: [0, 0.012, 0] },
  launcher: { pos: [0.17, -0.22, -0.6],  rot: [0, 0.02, 0] },
  katana:   { pos: [0.2, -0.26, -0.42],  rot: [0.15, -0.45, 0.35] },
  knife:    { pos: [0.18, -0.24, -0.44], rot: [0.2, -0.5, 0.4] },
  sword:    { pos: [0.2, -0.26, -0.42],  rot: [0.15, -0.45, 0.35] },
  axe:      { pos: [0.2, -0.26, -0.42],  rot: [0.15, -0.45, 0.35] },
};

/** ADS pose per kind — the sight line is raised to screen center (x=0).
 *  y = -(sight height above the grip). Tuned visually per model. */
const ADS_POSE: Record<WeaponModelKind, { pos: [number, number, number]; rot: [number, number, number] }> = {
  rifle:    { pos: [0, -0.096, -0.46], rot: [0, 0, 0] },
  smg:      { pos: [0, -0.1, -0.42],   rot: [0, 0, 0] },
  p90:      { pos: [0, -0.1, -0.42],   rot: [0, 0, 0] },
  sniper:   { pos: [0, -0.1, -0.5],    rot: [0, 0, 0] },   // unused (hidden in ADS)
  shotgun:  { pos: [0, -0.105, -0.48], rot: [0, 0, 0] },
  lmg:      { pos: [0, -0.11, -0.48],  rot: [0, 0, 0] },
  pistol:   { pos: [0, -0.115, -0.5],  rot: [0, 0, 0] },
  revolver: { pos: [0, -0.12, -0.5],   rot: [0, 0, 0] },
  launcher: { pos: [0, -0.1, -0.5],    rot: [0, 0, 0] },
  katana:   { pos: [0.12, -0.22, -0.44], rot: [0.15, -0.3, 0.2] }, // guard stance
  knife:    { pos: [0.12, -0.2, -0.44],  rot: [0.2, -0.32, 0.22] },
  sword:    { pos: [0.12, -0.22, -0.44], rot: [0.15, -0.3, 0.2] },
  axe:      { pos: [0.12, -0.22, -0.44], rot: [0.15, -0.3, 0.2] },
};

// Spring constants (per-second). Stiffness/damping give a slightly weighty,
// tactical settle — not floaty, not rigid.
const POS_STIFF = 95;
const POS_DAMP = 13.5;
const ROT_STIFF = 80;
const ROT_DAMP = 12.5;

const _accel = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _idQ = new THREE.Quaternion();

export class ViewModelRig {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly group: THREE.Group;   // spring-driven; holds the weapon mesh

  private mesh: THREE.Object3D | null = null; // game.weaponMesh (mainBody)
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private rot = new THREE.Vector3();
  private rotVel = new THREE.Vector3();
  private bobPhase = 0;
  private prevYaw = 0;
  private prevPitch = 0;
  private prevGrounded = true;
  private wasMelee = false;
  private initialized = false;

  constructor(aspect: number) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.01, 10);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.scene.add(this.camera);

    // Lighting tuned to sit close to the world's look without shadow cost.
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x40372c, 1.35);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(-0.6, 1.2, 0.8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec2ff, 0.9);
    rim.position.set(0.8, -0.3, -0.6);
    this.scene.add(rim);

    this.group = new THREE.Group();
    this.group.name = 'fp_weapon_group';
    this.scene.add(this.group);
  }

  /** Point the rig at the current weapon mesh (called after every rebuild). */
  setCurrentMesh(mesh: THREE.Object3D | null, kind: WeaponModelKind | null): void {
    this.mesh = mesh;
    if (mesh && kind) {
      this.resetSprings(false, kind); // crisp raise on weapon swap
    }
  }

  syncAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Reset spring state (weapon swap = crisp raise; melee end = recover). */
  private resetSprings(toIdentity: boolean, kind: WeaponModelKind | null): void {
    if (toIdentity || !kind) {
      this.pos.set(0, 0, 0);
      this.rot.set(0, 0, 0);
    } else {
      const pose = HIP_POSE[kind] || HIP_POSE.rifle;
      this.pos.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      this.rot.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    }
    this.vel.set(0, 0, 0);
    this.rotVel.set(0, 0, 0);
    this.initialized = true;
  }

  update(dt: number, ctx: ViewModelCtx): void {
    const d = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    const hip = HIP_POSE[ctx.kind] || HIP_POSE.rifle;
    const ads = ADS_POSE[ctx.kind] || ADS_POSE.rifle;

    if (!this.initialized) this.resetSprings(!ctx.meleeActive, ctx.kind);

    // Melee handoff: while swinging, the legacy block drives `mesh` in
    // camera-local coordinates — park the group at identity. When the swing
    // ends, restart the springs from identity so the weapon "recovers" to
    // ready pose physically, and lerp the mesh back to its neutral offset.
    if (ctx.meleeActive) {
      this.group.position.set(0, 0, 0);
      this.group.rotation.set(0, 0, 0);
      this.wasMelee = true;
      this.initialized = true;
      // Keep integrating silently so state stays warm (no visual effect).
      this.integrate(d, ctx, hip, ads, false);
      if (this.group.parent) this.group.updateMatrixWorld(true);
      return;
    }
    if (this.wasMelee) {
      this.wasMelee = false;
      this.resetSprings(true, null);
    }

    this.integrate(d, ctx, hip, ads, true);

    // Ease the weapon mesh's own offset back to neutral (melee leaves it
    // displaced; the GLB fine-offset inside stays untouched).
    if (this.mesh) {
      const k = 1 - Math.exp(-16 * d);
      this.mesh.position.lerp(_zero, k);
      this.mesh.quaternion.slerp(_idQ, k);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.set(this.rot.x, this.rot.y, this.rot.z);

    // Scoped weapons: hide the viewmodel entirely while aiming (world zoom
    // reads as the scope).
    this.group.visible = !(ctx.isADS && ctx.hideInAds);

    this.group.updateMatrixWorld(true);
  }

  private integrate(d: number, ctx: ViewModelCtx, hip: { pos: number[]; rot: number[] }, ads: { pos: number[]; rot: number[] }, apply: boolean): void {
    const target = ctx.isADS ? ads : hip;

    // Movement bob: stride phase driven by speed, damped hard in ADS.
    const bobAmp = (ctx.isADS ? 0.15 : 1) * Math.min(1, ctx.speed2D / 5.2);
    if (ctx.grounded && ctx.speed2D > 0.2) {
      this.bobPhase += d * (5.2 + ctx.speed2D * 1.35);
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.011 * bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.007 * bobAmp;

    const tx = target.pos[0] + bobX;
    const ty = target.pos[1] + bobY;
    const tz = target.pos[2] - ctx.recoilOffsetZ;

    // Player acceleration in camera-local space (yaw-only view frame).
    _accel.set(0, 0, 0);
    let localRight = 0;
    let localFwd = 0;
    if (this.initialized && apply) {
      const sin = Math.sin(ctx.yaw), cos = Math.cos(ctx.yaw);
      const ax = (ctx.vel.x - this.lastVel.x) / d;
      const az = (ctx.vel.z - this.lastVel.z) / d;
      const ay = (ctx.vel.y - this.lastVel.y) / d;
      localRight = ctx.vel.x * cos - ctx.vel.z * sin;
      localFwd = -(ctx.vel.x * sin) - ctx.vel.z * cos;
      _accel.x += (ax * cos - az * sin) * 0.010;
      _accel.z += (-ax * sin - az * cos) * 0.008;
      _accel.y += -Math.abs(ay) * 0.011;
    }
    this.lastVel.copy(ctx.vel);

    // Landing impact: was airborne, now grounded.
    if (apply && ctx.grounded && !this.prevGrounded && this.initialized) {
      this.vel.y -= 0.5;
      this.rotVel.x -= 1.5;
    }
    this.prevGrounded = ctx.grounded;

    // Stance tilt from strafing / forward motion (velocity-driven so touch
    // and custom bindings behave identically).
    const lean = Math.max(-0.05, Math.min(0.05, -localRight * 0.012)) * (ctx.isADS ? 0.35 : 1);
    const fwdPitch = Math.max(-0.03, Math.min(0.03, localFwd * 0.006)) * (ctx.isADS ? 0.3 : 1);

    // Look lag: view deltas drag the weapon opposite, like inertia.
    const yawDelta = this.initialized ? this.shortestAngle(ctx.yaw - this.prevYaw) : 0;
    const pitchDelta = this.initialized ? (ctx.pitch - this.prevPitch) : 0;
    this.prevYaw = ctx.yaw;
    this.prevPitch = ctx.pitch;
    const lagScale = (ctx.isADS ? 0.35 : 1);
    this.rotVel.y -= yawDelta * 5.5 * lagScale;
    this.rotVel.x -= pitchDelta * 5.5 * lagScale;

    // Integrate position spring (semi-implicit Euler, dt-clamped).
    this.vel.x += ((tx - this.pos.x) * POS_STIFF - this.vel.x * POS_DAMP) * d + _accel.x;
    this.vel.y += ((ty - this.pos.y) * POS_STIFF - this.vel.y * POS_DAMP) * d + _accel.y;
    this.vel.z += ((tz - this.pos.z) * POS_STIFF - this.vel.z * POS_DAMP) * d + _accel.z;
    this.pos.x += this.vel.x * d;
    this.pos.y += this.vel.y * d;
    this.pos.z += this.vel.z * d;

    // Integrate rotation spring.
    const trx = target.rot[0] + fwdPitch + ctx.recoilRotX * 0.55;
    const tryr = target.rot[1] + ctx.recoilRotY * 0.55;
    const trz = target.rot[2] + lean;
    this.rotVel.x += ((trx - this.rot.x) * ROT_STIFF - this.rotVel.x * ROT_DAMP) * d;
    this.rotVel.y += ((tryr - this.rot.y) * ROT_STIFF - this.rotVel.y * ROT_DAMP) * d;
    this.rotVel.z += ((trz - this.rot.z) * ROT_STIFF - this.rotVel.z * ROT_DAMP) * d;
    this.rot.x += this.rotVel.x * d;
    this.rot.y += this.rotVel.y * d;
    this.rot.z += this.rotVel.z * d;
  }

  /** Camera-local position of a weapon-space point (muzzle etc.). */
  localToWorld(p: THREE.Vector3): THREE.Vector3 {
    return p.applyMatrix4(this.group.matrixWorld);
  }

  private shortestAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // velocity from the previous integrate() call
  private lastVel = new THREE.Vector3();
}
