// CharacterPose.ts
// Procedural weapon-hold + jump pose layer for mixamo-rigged characters.
//
// The GLTF soldier ships with unarmed Idle/Walk/Run clips. This module runs
// AFTER the AnimationMixer update each frame and re-poses a fixed set of
// bones (arms, hands, upper spine, and — while airborne — the legs) so every
// character in the game holds their current weapon correctly:
//
//   * rifle  — two-handed carry: trigger hand on the pistol grip, support
//              hand under the handguard. Weapon raises to a ready position
//              while moving and follows aim pitch.
//   * pistol — one-handed aim with a two-hand support variant while moving.
//   * melee  — bladed weapon carried at the side in the right hand, with a
//              one-shot swing overlay for attacks.
//
// While airborne a jump tuck is blended over the leg bones (the source GLB
// has no jump clip), rising with vertical velocity and settling into a
// landing pose as the character falls.
//
// Math: each overridden bone gets a deterministic WORLD-space orientation
// built from (a) the bind-pose world quaternion captured by
// CharacterModelLoader at load time, (b) a rotation that aims the bone's
// long axis at a desired direction, and (c) a roll around that axis. Local
// quaternions are then derived from the parent's world orientation, so the
// pose stays glued to the animated skeleton underneath (breathing idle,
// walk bob, etc. are preserved).

import * as THREE from 'three';
import { CharacterInstance, findCharacterBone } from './CharacterModelLoader';

export type HoldKind = 'rifle' | 'pistol' | 'melee' | 'none';

export interface PoseContext {
  hold: HoldKind;
  /** horizontal speed in m/s (drives ready-raise + run lean) */
  speed: number;
  /** character is airborne (jumping / falling) */
  airborne: boolean;
  /** vertical velocity in m/s (shapes the jump tuck) */
  vy: number;
  /** aim pitch in radians — positive looks UP */
  aimPitch: number;
  /** total elapsed time (seconds) for subtle idle sway */
  time: number;
  /** 0..1 reload animation crouch hint (optional) */
  reloadHint?: number;
}

// ---------------------------------------------------------------------------
// Tuning tables — all directions are in ROOT space:
//   character faces +Z (game convention: yaw = atan2(vx, vz)), up is +Y,
//   character's right hand is at -X when facing +Z... verified in dev-lab:
//   the Soldier.glb wrapper flip leaves the model facing +Z.
//   dir = where the bone's long axis should point (shoulder->elbow etc.)
//   roll = extra rotation around that axis (radians) for elbow/wrist twist.
// ---------------------------------------------------------------------------

interface BoneDir {
  dir: [number, number, number];
  roll?: number;
}

interface HoldPoseDef {
  rightUpper: BoneDir;
  rightFore: BoneDir;
  rightHand: BoneDir;
  leftUpper: BoneDir;
  leftFore: BoneDir;
  leftHand: BoneDir;
  /** extra forward lean of the upper spine (radians, positive = lean fwd) */
  spineLean?: number;
  /** additional downward muzzle pitch applied to hands (radians) */
  handPitch?: number;
  /** muzzle yaw toward the body's center line (radians, right-handed guns) */
  yaw?: number;
}

// RIFLE — two-handed carry, weapon roughly level.
const POSE_RIFLE: HoldPoseDef = {
  rightUpper: { dir: [-0.05, -0.55, 0.62], roll: 0.15 },
  rightFore:  { dir: [0, 0.30, 0.92], roll: -0.25 },
  rightHand:  { dir: [0, 0.32, 0.94], roll: 0 },
  leftUpper:  { dir: [-0.14, -0.76, 0.48], roll: -0.4 },
  leftFore:   { dir: [-0.24, 0.04, 0.96], roll: 0.5 },
  leftHand:   { dir: [-0.10, 0.12, 0.98], roll: 0 },
  spineLean: 0.06,
  yaw: 0.38,
};

// PISTOL — compact two-hand ready.
const POSE_PISTOL: HoldPoseDef = {
  rightUpper: { dir: [-0.05, -0.50, 0.75], roll: 0.1 },
  rightFore:  { dir: [-0.02, 0.14, 0.98], roll: -0.1 },
  rightHand:  { dir: [0, 0.18, 0.97], roll: 0 },
  leftUpper:  { dir: [-0.12, -0.80, 0.38], roll: -0.5 },
  leftFore:   { dir: [-0.28, 0.02, 0.94], roll: 0.6 },
  leftHand:   { dir: [-0.16, 0.06, 0.97], roll: 0 },
  spineLean: 0.04,
  yaw: 0.12,
};

// MELEE — blade carried low in the right hand; left arm free.
const POSE_MELEE: HoldPoseDef = {
  rightUpper: { dir: [-0.06, -0.88, 0.22], roll: 0.2 },
  rightFore:  { dir: [-0.04, -0.52, 0.78], roll: -0.2 },
  rightHand:  { dir: [0, -0.30, 0.92], roll: 0 },
  leftUpper:  { dir: [0.04, -0.92, 0.10], roll: -0.3 },
  leftFore:   { dir: [0.10, -0.42, 0.84], roll: 0.4 },
  leftHand:   { dir: [0.04, -0.26, 0.94], roll: 0 },
  spineLean: 0.03,
};

const POSE_NONE: HoldPoseDef = POSE_MELEE;

function poseFor(hold: HoldKind): HoldPoseDef {
  switch (hold) {
    case 'rifle': return POSE_RIFLE;
    case 'pistol': return POSE_PISTOL;
    case 'melee': return POSE_MELEE;
    default: return POSE_NONE;
  }
}

// Legs (jump tuck only — not overridden while grounded).
const JUMP_RISE = {
  upper: { dir: [0, 0.45, 0.85] as [number, number, number], roll: 0 },
  shin: { dir: [0, -0.85, -0.45] as [number, number, number], roll: 0 },
};
const JUMP_FALL = {
  upper: { dir: [0, -0.05, 0.90] as [number, number, number], roll: 0 },
  shin: { dir: [0, -0.95, 0.25] as [number, number, number], roll: 0 },
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

/** World orientation that points a bone's long axis at `dir` with `roll`.
 *  boneWorldRest: bind-pose world quaternion of the bone.
 *  boneAxisLocal: the bone's long axis in LOCAL space (assumed +Y for mixamo
 *  limb bones; verified empirically for hands). */
function aimQuat(
  boneWorldRest: THREE.Quaternion,
  boneAxisLocal: THREE.Vector3,
  dir: THREE.Vector3,
  roll: number,
  out: THREE.Quaternion
): THREE.Quaternion {
  // bind-space direction of the bone axis (root space)
  _v1.copy(boneAxisLocal).applyQuaternion(boneWorldRest).normalize();
  _v2.copy(dir).normalize();
  // minimal rotation binding bind-axis -> desired dir, applied in world space
  _q1.setFromUnitVectors(_v1, _v2);
  out.copy(_q1).multiply(boneWorldRest);
  if (roll) {
    _q2.setFromAxisAngle(_v2, roll);
    out.premultiply(_q2);
  }
  return out;
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** Mixamo hand bones use different local axes than limb bones; the weapon
 *  alignment is tuned in the lab, so hands simply inherit the forearm
 *  orientation with an extra roll around the forearm axis. */
const HAND_AXIS = AXIS_Y;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const tmpTargets: Array<{ name: string; quat: THREE.Quaternion }> = [];
for (let i = 0; i < 12; i++) tmpTargets.push({ name: '', quat: new THREE.Quaternion() });

/** Bone name -> instance pose state cache. */
function smoothedLocal(
  inst: CharacterInstance,
  name: string,
  targetLocal: THREE.Quaternion,
  dt: number,
  snap: boolean
): void {
  const bone = findCharacterBone(inst.root, name);
  if (!bone) return;
  let state = inst.poseState!.get(name);
  if (!state) {
    state = new THREE.Quaternion();
    inst.poseState!.set(name, state);
  }
  if (snap) {
    state.copy(targetLocal);
  } else {
    const k = 1 - Math.exp(-14 * dt);
    state.slerp(targetLocal, k);
  }
  bone.quaternion.copy(state);
}

/**
 * Apply the weapon-hold + jump pose layer for one character instance.
 * Call AFTER `inst.mixer.update(delta)` every frame.
 */
export function applyHoldPose(
  inst: CharacterInstance,
  ctx: PoseContext,
  delta: number
): void {
  if (ctx.hold === 'none' || !inst.restQuats || Object.keys(inst.restQuats).length === 0) return;

  const root = inst.root;
  const def = poseFor(ctx.hold);

  // How "ready" the carry is: standing = weapon low, moving = raised.
  const readiness = THREE.MathUtils.clamp(ctx.speed / 3.2, 0, 1);
  // low-ready droop when idle (radians, positive = muzzle down)
  const droop = (1 - readiness) * (ctx.hold === 'melee' ? 0.10 : 0.30);
  // facing +Z: rotating around +X by a positive angle dips the forward axis
  // toward -Y (muzzle down). Aim pitch positive = looking UP.
  const handPitch = droop - (ctx.aimPitch || 0) * 0.9 + (def.handPitch || 0);
  // muzzle yaw toward the center line — strong when relaxed, near-level when
  // moving so the gun points where the character runs
  const yaw = (def.yaw || 0) * (1 - readiness * 0.75);
  const yawQ = _q3.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).clone();
  const pitchQ = _q3.setFromAxisAngle(AXIS_X_TMP, handPitch).clone().premultiply(yawQ);
  // Spine reacts to pitch + movement (lean forward while running, crouch hint
  // while reloading).
  const runLean = THREE.MathUtils.clamp(ctx.speed / 6, 0, 1) * 0.16;
  const reloadCrouch = (ctx.reloadHint || 0) * 0.22;
  const spineLean = (def.spineLean || 0) + runLean + reloadCrouch - (ctx.aimPitch || 0) * 0.25;

  // Parent world orientations — chain roots hang off shoulders / hips which
  // stay mixer-animated, so query their current world orientation.
  const rightShoulder = findCharacterBone(root, 'RightShoulder');
  const leftShoulder = findCharacterBone(root, 'LeftShoulder');
  const hips = findCharacterBone(root, 'Hips');
  const qwRightShoulder = rightShoulder
    ? rightShoulder.getWorldQuaternion(new THREE.Quaternion())
    : inst.restQuats['RightShoulder'] || new THREE.Quaternion();
  const qwLeftShoulder = leftShoulder
    ? leftShoulder.getWorldQuaternion(new THREE.Quaternion())
    : inst.restQuats['LeftShoulder'] || new THREE.Quaternion();
  const qwHips = hips
    ? hips.getWorldQuaternion(new THREE.Quaternion())
    : inst.restQuats['Hips'] || new THREE.Quaternion();

  // Subtle idle sway so holds don't look frozen.
  const sway = ctx.hold === 'melee' ? 0.012 : 0.02;
  const swayPhase = Math.sin(ctx.time * 1.7) * sway + Math.sin(ctx.time * 0.9) * sway * 0.6;

  const aim = (bd: BoneDir, out: THREE.Quaternion, restName: string, extraRoll = 0) => {
    const rest = inst.restQuats[restName];
    if (!rest) return false;
    _v2.set(bd.dir[0], bd.dir[1], bd.dir[2]).normalize();
    // rotate the direction by the aim pitch around the root X axis
    _v2.applyQuaternion(pitchQ);
    aimQuat(rest, AXIS_Y, _v2, (bd.roll || 0) + extraRoll + swayPhase, out);
    return true;
  };

  const setLocal = (boneName: string, parentWorld: THREE.Quaternion, worldTarget: THREE.Quaternion, snap: boolean) => {
    const local = _q1.copy(parentWorld).invert().multiply(worldTarget);
    smoothedLocal(inst, boneName, local, delta, snap);
  };

  // ---- Right arm chain ----
  const qwRU = new THREE.Quaternion();
  const qwRF = new THREE.Quaternion();
  const qwRH = new THREE.Quaternion();
  if (aim(def.rightUpper, qwRU, 'RightArm')) {
    setLocal('RightArm', qwRightShoulder, qwRU, false);
    if (aim(def.rightFore, qwRF, 'RightForeArm')) {
      setLocal('RightForeArm', qwRU, qwRF, false);
      if (aim(def.rightHand, qwRH, 'RightHand')) {
        setLocal('RightHand', qwRF, qwRH, false);
      }
    }
  }

  // ---- Left arm chain ----
  const qwLU = new THREE.Quaternion();
  const qwLF = new THREE.Quaternion();
  const qwLH = new THREE.Quaternion();
  if (aim(def.leftUpper, qwLU, 'LeftArm')) {
    setLocal('LeftArm', qwLeftShoulder, qwLU, false);
    if (aim(def.leftFore, qwLF, 'LeftForeArm')) {
      setLocal('LeftForeArm', qwLU, qwLF, false);
      if (aim(def.leftHand, qwLH, 'LeftHand')) {
        setLocal('LeftHand', qwLF, qwLH, false);
      }
    }
  }

  // ---- Keep the attached weapon aligned with the hold pose ----
  syncAttachedWeapon(inst, ctx, def, pitchQ, swayPhase);

  // ---- Upper spine (lean + pitch sharing) ----
  const spineRest = inst.restQuats['Spine2'];
  const spineBone = findCharacterBone(root, 'Spine2');
  if (spineRest && spineBone) {
    _v2.set(0, 1, 0);
    _v2.applyQuaternion(pitchQ);
    // facing +Z: positive X-rotation tilts the up-vector forward (+Z) = lean
    const leanQ = _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), spineLean);
    _v2.applyQuaternion(leanQ);
    aimQuat(spineRest, AXIS_Y, _v2, 0, qwRU);
    const parentQ = new THREE.Quaternion();
    const spineParent = spineBone.parent;
    if (spineParent) spineParent.getWorldQuaternion(parentQ);
    setLocal('Spine2', parentQ, qwRU, false);
  }

  // ---- Melee swing overlay ----
  if (inst.meleeSwingTimer && inst.meleeSwingTimer > 0 && ctx.hold === 'melee') {
    applyMeleeSwingOverlay(inst, delta);
  } else if (inst.meleeSwingTimer && inst.meleeSwingTimer > 0) {
    inst.meleeSwingTimer -= delta;
  }

  // ---- Jump / fall leg tuck ----
  if (ctx.airborne) {
    const riseK = THREE.MathUtils.clamp(ctx.vy / 6, -1, 1); // +1 rising, -1 falling
    const blend = (riseK + 1) / 2; // 0 = fall pose, 1 = rise pose
    const lerpDir = (
      a: [number, number, number],
      b: [number, number, number]
    ): [number, number, number] => [
      THREE.MathUtils.lerp(a[0], b[0], blend),
      THREE.MathUtils.lerp(a[1], b[1], blend),
      THREE.MathUtils.lerp(a[2], b[2], blend),
    ];
    const upperDir = lerpDir(JUMP_FALL.upper.dir, JUMP_RISE.upper.dir);
    const shinDir = lerpDir(JUMP_FALL.shin.dir, JUMP_RISE.shin.dir);
    const legFade = THREE.MathUtils.clamp(Math.abs(ctx.vy) / 3, 0.35, 1);

    for (const side of ['Left', 'Right'] as const) {
      const qwUp = new THREE.Quaternion();
      const qwShin = new THREE.Quaternion();
      const upRest = inst.restQuats[`${side}UpLeg`];
      const shinRest = inst.restQuats[`${side}Leg`];
      if (!upRest || !shinRest) continue;

      _v2.set(upperDir[0], upperDir[1], upperDir[2]).normalize();
      // spread legs slightly outward by side so they don't intersect
      _v2.x += side === 'Left' ? -0.12 : 0.12;
      _v2.normalize();
      aimQuat(upRest, AXIS_Y, _v2, 0, qwUp);
      // Blend: slerp from the bone's current local orientation toward the
      // tuck by legFade (keeps a hint of the run cycle while airborne).
      const upBone = findCharacterBone(root, `${side}UpLeg`);
      if (upBone) {
        const parentQ = new THREE.Quaternion();
        if (upBone.parent) upBone.parent.getWorldQuaternion(parentQ);
        const localTuck = parentQ.invert().multiply(qwUp);
        upBone.quaternion.slerp(localTuck, legFade * 0.9);
        // refresh world for shin parenting
        const upWorld = qwUp;
        if (shinRest) {
          _v2.set(shinDir[0], shinDir[1], shinDir[2]).normalize();
          aimQuat(shinRest, AXIS_Y, _v2, 0, qwShin);
          const shinLocal = upWorld.clone().invert().multiply(qwShin);
          const shinBone = findCharacterBone(root, `${side}Leg`);
          if (shinBone) shinBone.quaternion.slerp(shinLocal, legFade * 0.9);
        }
      }
    }
  }
}

// Small axis constant kept separate to avoid re-allocations being shared
// with the module-level scratch that aimQuat mutates.
const AXIS_X_TMP = new THREE.Vector3(1, 0, 0);

// ---------------------------------------------------------------------------
// Melee swing overlay
// ---------------------------------------------------------------------------

const SWING_START: HoldPoseDef = {
  ...POSE_MELEE,
  rightUpper: { dir: [0.35, 0.45, 0.65], roll: 0.5 },
  rightFore: { dir: [0.15, 0.30, 0.90], roll: -0.4 },
  rightHand: { dir: [0.10, 0.35, 0.90], roll: 0 },
};
const SWING_END: HoldPoseDef = {
  ...POSE_MELEE,
  rightUpper: { dir: [-0.45, -0.55, 0.55], roll: -0.6 },
  rightFore: { dir: [-0.10, -0.45, 0.85], roll: 0.3 },
  rightHand: { dir: [-0.05, -0.40, 0.88], roll: 0 },
};

/** One-shot 0..1 eased swing that crosses the right arm diagonally. */
function applyMeleeSwingOverlay(inst: CharacterInstance, delta: number): void {
  const dur = inst.meleeSwingDuration || 0.38;
  inst.meleeSwingTimer = Math.max(0, (inst.meleeSwingTimer || 0) - delta);
  const t = 1 - (inst.meleeSwingTimer || 0) / dur; // 0..1 progress
  // ease: fast strike in the middle
  const strike = t < 0.35
    ? (t / 0.35) * 0.25                        // windup (slow)
    : 0.25 + ((t - 0.35) / 0.65) * 0.75;       // strike + follow-through
  const e = THREE.MathUtils.clamp(strike, 0, 1);

  const root = inst.root;
  const rightShoulder = findCharacterBone(root, 'RightShoulder');
  const qwShoulder = rightShoulder
    ? rightShoulder.getWorldQuaternion(new THREE.Quaternion())
    : inst.restQuats['RightShoulder'] || new THREE.Quaternion();

  const mix = (a: BoneDir, b: BoneDir, out: THREE.Quaternion, restName: string) => {
    const rest = inst.restQuats[restName];
    if (!rest) return;
    _v1.set(
      THREE.MathUtils.lerp(a.dir[0], b.dir[0], e),
      THREE.MathUtils.lerp(a.dir[1], b.dir[1], e),
      THREE.MathUtils.lerp(a.dir[2], b.dir[2], e)
    ).normalize();
    aimQuat(rest, AXIS_Y, _v1, THREE.MathUtils.lerp(a.roll || 0, b.roll || 0, e), out);
  };

  const qwRU = new THREE.Quaternion();
  const qwRF = new THREE.Quaternion();
  const qwRH = new THREE.Quaternion();
  mix(POSE_MELEE.rightUpper, SWING_START.rightUpper, qwRU, 'RightArm');
  const snapK = 1 - Math.exp(-30 * delta);
  const ruBone = findCharacterBone(root, 'RightArm');
  if (ruBone) {
    const parentQ = new THREE.Quaternion();
    if (ruBone.parent) ruBone.parent.getWorldQuaternion(parentQ);
    const local = parentQ.invert().multiply(qwRU);
    inst.poseState!.get('RightArm')?.slerp(local, snapK);
    ruBone.quaternion.copy(inst.poseState!.get('RightArm')!);
  }
  mix(SWING_START.rightFore, SWING_END.rightFore, qwRF, 'RightForeArm');
  const rfBone = findCharacterBone(root, 'RightForeArm');
  if (rfBone) {
    const parentWorld = qwRU;
    const local = parentWorld.clone().invert().multiply(qwRF);
    inst.poseState!.get('RightForeArm')?.slerp(local, snapK);
    rfBone.quaternion.copy(inst.poseState!.get('RightForeArm')!);
  }
  mix(SWING_START.rightHand, SWING_END.rightHand, qwRH, 'RightHand');
  const rhBone = findCharacterBone(root, 'RightHand');
  if (rhBone) {
    const parentWorld = qwRF;
    const local = parentWorld.clone().invert().multiply(qwRH);
    inst.poseState!.get('RightHand')?.slerp(local, snapK);
    rhBone.quaternion.copy(inst.poseState!.get('RightHand')!);
  }
}

/**
 * Weapon alignment: the pose layer parented the weapon to the right hand and
 * rewrites its LOCAL transform every frame so the model's muzzle follows the
 * exact aim direction of the hold pose — no hand-bone axis guessing needed.
 *   rifle/pistol: muzzle (-Z of the model) along the right-hand direction.
 *   melee: blade (+Y of the model) along an up-forward carry direction.
 */
function syncAttachedWeapon(
  inst: CharacterInstance,
  ctx: PoseContext,
  def: HoldPoseDef,
  pitchQ: THREE.Quaternion,
  swayPhase: number
): void {
  const att = inst.attachedWeapon;
  if (!att) return;
  const hand = findCharacterBone(inst.root, 'RightHand');
  if (!hand) return;

  const handWorldInv = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const aim = new THREE.Vector3(def.rightHand.dir[0], def.rightHand.dir[1], def.rightHand.dir[2]).normalize();
  aim.applyQuaternion(pitchQ);

  const qWorld = new THREE.Quaternion();
  if (att.hold === 'melee') {
    // Blade along an up-forward diagonal from the grip.
    const blade = new THREE.Vector3(
      Math.sin(swayPhase * 2) * 0.08,
      0.78,
      0.62
    ).normalize();
    blade.applyQuaternion(pitchQ);
    // basis: +Y = blade, +Z = orthogonal forward-ish, +X = Y×Z
    const zRef = new THREE.Vector3(0, 0, 1);
    const x = new THREE.Vector3().crossVectors(blade, zRef).normalize();
    const z = new THREE.Vector3().crossVectors(x, blade).normalize();
    const m = new THREE.Matrix4().makeBasis(x, blade, z);
    qWorld.setFromRotationMatrix(m);
  } else {
    // Gun: muzzle (-Z) along aim, +Y up (levelled). Build a RIGHT-handed
    // basis (X×Y=Z) or the weapon renders with a mirrored, skewed rotation.
    const z = aim.clone().negate(); // weapon +Z = backward from muzzle
    const y = new THREE.Vector3(0, 1, 0).sub(aim.clone().multiplyScalar(aim.y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    qWorld.setFromRotationMatrix(m);
  }
  att.obj.quaternion.copy(handWorldInv.multiply(qWorld));
  // Offsets are in hand-LOCAL space which carries the bind scale (~0.01) —
  // compensate so the grip sits a couple of cm forward of the hand origin
  // in WORLD terms.
  const k = att.handScaleComp || 1;
  att.obj.position.set(0.01 * k, 0.03 * k, 0.02 * k);
}

/**
 * Parent a normalized weapon model to a character's right hand. The hold
 * layer then aligns it every frame (see syncAttachedWeapon).
 */
export function attachWeaponToHand(
  inst: CharacterInstance,
  weapon: THREE.Group,
  hold: HoldKind
): void {
  if (hold === 'none') return;
  const hand = findCharacterBone(inst.root, 'RightHand');
  if (!hand) return;
  weapon.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.raycast = () => {};
  });
  // The bone hierarchy carries the bind scale (~0.01 for the mixamo soldier)
  // — counter-scale so the weapon renders at its normalized real-world size.
  hand.updateWorldMatrix(true, false);
  const e = hand.matrixWorld.elements;
  const handScale = Math.hypot(e[0], e[1], e[2]) || 1;
  const comp = 1 / handScale;
  weapon.scale.setScalar(comp);
  hand.add(weapon);
  inst.attachedWeapon = { obj: weapon, hold, handScaleComp: comp };
}

/** Remove the current weapon model from a character (weapon switch). */
export function detachWeapon(inst: CharacterInstance): void {
  if (inst.attachedWeapon) {
    inst.attachedWeapon.obj.removeFromParent();
    inst.attachedWeapon = null;
  }
}
