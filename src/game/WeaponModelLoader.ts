// WeaponModelLoader.ts
// Loads real 3D weapon models (GLB) from /models/weapons/ and normalizes them
// to a consistent in-game frame:
//
//   * Origin = the GRIP (where the character's hand holds the weapon)
//   * Forward (muzzle direction) = -Z
//   * Up = +Y, Right = +X
//   * Uniform scale so each weapon matches its real-world length
//
// Model credits (all CC0):
//   * Guns (rifle/p90/sniper/shotgun/pistol/revolver) — Quaternius "Animated FPS
//     Guns" pack, https://quaternius.com
//   * Melee (katana/shortsword/sword) — Quaternius "Knight Character" pack
//   * Axe — Quaternius "Medieval Weapons" pack
//   * blaster-e/q/r, grenade — Kenney "Blaster Kit", https://kenney.nl
//
// Loading is asynchronous but the public API is synchronous-friendly:
// `preloadWeaponModels()` starts fetching everything at game init, and
// `buildWeaponModel()` returns a group immediately — either the real model
// (if already loaded) or `null` so the caller can fall back to a procedural
// placeholder which can be swapped later via `swapInWeaponModel()`.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE_URL = ((import.meta as any).env?.BASE_URL) || '/';
const WEAPON_DIR = `${BASE_URL}models/weapons/`;

export type WeaponModelKind =
  | 'rifle'      // assault rifles / DMR
  | 'smg'        // submachine guns
  | 'p90'        // P90-family PDWs (bullpup look)
  | 'sniper'     // bolt/anti-materiel snipers
  | 'shotgun'    // shotguns
  | 'lmg'        // light machine guns
  | 'pistol'     // semi-auto pistols
  | 'revolver'   // revolvers / hand cannons
  | 'launcher'   // rocket launchers
  | 'katana'
  | 'knife'
  | 'sword'
  | 'axe';

/** Normalize spec per kind. gripZ/gripY are fractions of the (rotated)
 *  bounding box: 0 = min edge, 1 = max edge. The grip point is placed at the
 *  local origin; remaining offset keeps the weapon visually centered. */
interface WeaponModelSpec {
  file: string;
  /** Real-world length of the weapon in meters (used for uniform scaling). */
  length: number;
  /** Extra pre-scale rotation (radians) applied around X / Y / Z. */
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** Fraction along the bbox where the grip sits (after rotation). */
  gripX?: number;
  gripY?: number;
  gripZ?: number;
  /** Where the muzzle tip ends up after normalization (local -Z is forward).
   *  Used for muzzle-flash placement / tracer origin. */
  muzzleZ?: number;
  /** Procedural garnish for silhouettes the raw GLB lacks (LMG drum, etc.). */
  addon?: 'drum' | 'bipod' | 'rpgTube';
  /** Child node names to hide (e.g. the decorative scope on Kenney blasters). */
  hideNodes?: string[];
}

const SPECS: Record<WeaponModelKind, WeaponModelSpec> = {
  rifle:    { file: 'rifle.glb',      length: 0.85, gripY: 0.32, gripZ: 0.72, muzzleZ: -0.42 },
  smg:      { file: 'p90.glb',        length: 0.62, gripY: 0.30, gripZ: 0.62, muzzleZ: -0.30 },
  p90:      { file: 'p90.glb',        length: 0.62, gripY: 0.30, gripZ: 0.62, muzzleZ: -0.30 },
  sniper:   { file: 'sniper.glb',     length: 1.15, gripY: 0.33, gripZ: 0.74, muzzleZ: -0.58 },
  shotgun:  { file: 'shotgun.glb',    length: 0.95, gripY: 0.30, gripZ: 0.74, muzzleZ: -0.46 },
  lmg:      { file: 'rifle.glb',      length: 1.00, gripY: 0.32, gripZ: 0.72, muzzleZ: -0.50, addon: 'drum' },
  pistol:   { file: 'pistol.glb',     length: 0.28, gripY: 0.24, gripZ: 0.66, muzzleZ: -0.14 },
  revolver: { file: 'revolver.glb',   length: 0.30, gripY: 0.22, gripZ: 0.64, muzzleZ: -0.16 },
  launcher: { file: 'blaster-e.glb',  length: 1.20, rotY: Math.PI, gripY: 0.42, gripZ: 0.58, muzzleZ: -0.60, addon: 'rpgTube', hideNodes: ['scope'] },
  katana:   { file: 'katana.glb',     length: 1.05, gripY: 0.14, gripZ: 0.88 },
  knife:    { file: 'shortsword.glb', length: 0.45, gripY: 0.13, gripZ: 0.86 },
  sword:    { file: 'sword.glb',      length: 0.85, gripY: 0.13, gripZ: 0.86 },
  axe:      { file: 'axe.glb',        length: 0.75, gripY: 0.16, gripZ: 0.82 },
};

/** Map a game weapon (id + type + name) to a model kind. */
export function weaponKindFor(
  weaponId: string,
  weaponType?: string,
  weaponName?: string
): WeaponModelKind {
  const id = (weaponId || '').toLowerCase();
  const nm = (weaponName || '').toLowerCase();
  const ty = (weaponType || '').toUpperCase();

  // --- Per-weapon overrides (distinct silhouettes) ---
  if (id === 'p90_pdw' || nm.includes('p90')) return 'p90';
  if (id === 'j358_revolver' || id === 'gs50_pistol') return 'revolver';
  if (id === 'deagle_heavy') return 'revolver';
  if (id === 'katana_melee') return 'katana';
  if (id === 'axe_melee') return 'axe';
  if (id === 'tactical_knife') return 'knife';
  if (id === 'rpg7_rocket') return 'launcher';
  if (id === 'crossbow_explosive') return 'sniper';

  // --- By weapon type ---
  switch (ty) {
    case 'AR': return 'rifle';
    case 'SNIPER': return 'sniper';
    case 'LMG': return 'lmg';
    case 'SMG': return 'smg';
    case 'SHOTGUN': return 'shotgun';
    case 'PISTOL': return 'pistol';
    case 'LAUNCHER': return 'launcher';
    case 'KNIFE': return 'knife';
    default: return 'rifle';
  }
}

/** True when the kind is a melee (bladed) weapon. */
export function isMeleeKind(kind: WeaponModelKind): boolean {
  return kind === 'katana' || kind === 'knife' || kind === 'sword' || kind === 'axe';
}

// ---------------------------------------------------------------------------
// Loading & normalization
// ---------------------------------------------------------------------------

const loader = new GLTFLoader();

interface LoadedWeapon {
  /** Normalized template scene — CLONE before attaching. */
  template: THREE.Group;
  muzzleZ: number;
}

/**
 * Bounds computed from the union of per-mesh geometry boxes, discarding
 * outlier nodes. Some Quaternius exports contain stray helper nodes far
 * outside the model (e.g. the revolver's -418 Y node), which would poison a
 * naive Box3.setFromObject() and shrink the whole weapon to invisibility.
 * Stray meshes are additionally hidden so they never render.
 */
function robustSceneBounds(root: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
  root.updateMatrixWorld(true);
  const entries: Array<{ mesh: THREE.Mesh; box: THREE.Box3; maxDim: number }> = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry || o.visible === false) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    const box = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    const s = new THREE.Vector3();
    box.getSize(s);
    entries.push({ mesh: m, box, maxDim: Math.max(s.x, s.y, s.z) });
  });
  if (!entries.length) {
    out.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    return out;
  }
  const sorted = entries.map(e => e.maxDim).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const union = new THREE.Box3();
  let used = 0;
  for (const e of entries) {
    if (e.maxDim <= median * 8 && e.maxDim >= median / 64) {
      union.union(e.box);
      used++;
    } else if (e.maxDim > median * 64) {
      // Stray helper mesh far outside the weapon — never render it.
      e.mesh.visible = false;
    }
  }
  if (!used) entries.forEach(e => union.union(e.box));
  out.copy(union);
  return out;
}

const _cache = new Map<WeaponModelKind, LoadedWeapon>();
const _pending = new Map<WeaponModelKind, Promise<LoadedWeapon | null>>();

let _debug = false;
/** Enable verbose load diagnostics (used by the dev-lab). */
export function setWeaponLoadDebug(on: boolean): void {
  _debug = on;
}

/**
 * Colorize-by-name table for the Quaternius FPS gun pack. The source FBX
 * files ship with named material slots but no textures (the textures only
 * exist inside the original .blend files), so every slot renders as flat
 * 80% gray. These values restore the intended military palette.
 */
const MATERIAL_COLORS: Record<string, { color: number; rough?: number; metal?: number }> = {
  Black:        { color: 0x16181d, rough: 0.55, metal: 0.55 },
  Metal:        { color: 0x6a7280, rough: 0.35, metal: 0.85 },
  DarkerMetal:  { color: 0x2a2e36, rough: 0.45, metal: 0.75 },
  DarkMetal:    { color: 0x23262d, rough: 0.5,  metal: 0.7 },
  Barrels:      { color: 0x3b4049, rough: 0.4,  metal: 0.8 },
  Barrel:       { color: 0x3b4049, rough: 0.4,  metal: 0.8 },
  LightWood:    { color: 0x9a6a3c, rough: 0.75, metal: 0.05 },
  DarkWood:     { color: 0x50331e, rough: 0.8,  metal: 0.05 },
  Wood:         { color: 0x6b4426, rough: 0.78, metal: 0.05 },
  Trigger:      { color: 0x1d2025, rough: 0.6,  metal: 0.5 },
  Magazine:     { color: 0x262b32, rough: 0.55, metal: 0.6 },
  Muzzle:       { color: 0x34383f, rough: 0.4,  metal: 0.8 },
  Green:        { color: 0x4d5c44, rough: 0.7,  metal: 0.2 },
  BulletYellow: { color: 0xd9a441, rough: 0.5,  metal: 0.6 },
  BulletOrange: { color: 0xc96f2e, rough: 0.5,  metal: 0.6 },
  BulletRed:    { color: 0xa83232, rough: 0.5,  metal: 0.5 },
  BulletTip:    { color: 0x8c7339, rough: 0.5,  metal: 0.6 },
  'Material.001': { color: 0x3a4046, rough: 0.6, metal: 0.3 },
  'Material.003': { color: 0x20242a, rough: 0.6, metal: 0.35 },
  'Material.004': { color: 0x4a5158, rough: 0.55, metal: 0.4 },
};

function fixMaterials(root: THREE.Object3D): void {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const apply = (m: any) => {
      let std: THREE.MeshStandardMaterial;
      if (m && m.isMeshStandardMaterial) {
        std = m;
        std.roughness = THREE.MathUtils.clamp(std.roughness ?? 0.6, 0.3, 0.9);
        std.metalness = THREE.MathUtils.clamp(std.metalness ?? 0.3, 0.05, 0.85);
      } else {
        std = new THREE.MeshStandardMaterial({
          color: m && m.color ? m.color.clone() : new THREE.Color(0x9aa3ad),
          map: m && m.map ? m.map : null,
          roughness: 0.55,
          metalness: 0.25,
        });
      }
      // Restore the authored palette for known material slot names.
      const preset = m && m.name ? MATERIAL_COLORS[m.name] : undefined;
      if (preset) {
        std.color = new THREE.Color(preset.color);
        if (preset.rough !== undefined) std.roughness = preset.rough;
        if (preset.metal !== undefined) std.metalness = preset.metal;
      }
      std.side = THREE.FrontSide;
      return std;
    };
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(apply);
    else mesh.material = apply(mesh.material);
  });
}

/** Procedural garnish so distinct weapon classes keep distinct silhouettes. */
function addAddon(kind: WeaponModelKind, group: THREE.Group, spec: WeaponModelSpec): void {
  if (spec.addon === 'drum') {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.6, metalness: 0.5 })
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, -0.06, 0.02);
    drum.castShadow = true;
    group.add(drum);
  } else if (spec.addon === 'rpgTube') {
    // Flared rear + cone tip to read as an RPG tube at a glance.
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a35, roughness: 0.7, metalness: 0.3 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 12), tubeMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.015, spec.muzzleZ ? spec.muzzleZ - 0.05 : -0.62);
    cone.castShadow = true;
    group.add(cone);
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.1, 12), tubeMat);
    flare.rotation.x = Math.PI / 2;
    flare.position.set(0, 0.015, 0.28);
    flare.castShadow = true;
    group.add(flare);
  }
}

async function loadWeaponModel(kind: WeaponModelKind): Promise<LoadedWeapon | null> {
  const spec = SPECS[kind];
  if (!spec) return null;
  try {
    const gltf = await loader.loadAsync(`${WEAPON_DIR}${spec.file}`);
    const scene = gltf.scene;

    // Hide optional decorative child nodes (e.g. scope on the RPG tube).
    if (spec.hideNodes) {
      for (const hn of spec.hideNodes) {
        scene.traverse(o => {
          if (o.name === hn || o.name.startsWith(hn)) o.visible = false;
        });
      }
    }

    // 1. Compute bounds BEFORE transform so we scale relative to raw size.
    const box = robustSceneBounds(scene, new THREE.Box3());
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    if (_debug) {
      // Count real meshes and report suspicious bounds (skinned-mesh pitfalls).
      let meshCount = 0;
      let skinned = 0;
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          meshCount++;
          if ((o as any).isSkinnedMesh) skinned++;
        }
      });
      console.info(
        `[WeaponModelLoader] ${kind} (${spec.file}) raw bounds min=`,
        box.min.toArray().map(v => +v.toFixed(3)),
        'max=',
        box.max.toArray().map(v => +v.toFixed(3)),
        `meshes=${meshCount} skinned=${skinned}`
      );
    }

    // Longest dimension defines the "length axis" of the raw model.
    const wrapper = new THREE.Group();

    // 2. Pre-rotation (e.g. melee blade from +Y to face grip-up).
    if (spec.rotX || spec.rotY || spec.rotZ) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(spec.rotX || 0, spec.rotY || 0, spec.rotZ || 0)
      );
      // Rotate around the bbox center so length stays comparable.
      const pivot = new THREE.Group();
      scene.position.sub(center);
      pivot.add(scene);
      pivot.quaternion.copy(q);
      // recompute pivot-space bounds
      wrapper.add(pivot);
    } else {
      scene.position.sub(center);
      wrapper.add(scene);
    }

    // 3. Uniform scale to target length (longest world axis after rotation).
    const tmpBox = robustSceneBounds(wrapper, new THREE.Box3());
    const tmpSize = new THREE.Vector3();
    tmpBox.getSize(tmpSize);
    const longest = Math.max(tmpSize.x, tmpSize.y, tmpSize.z) || 1;
    const scaleFactor = spec.length / longest;

    const scaler = new THREE.Group();
    scaler.scale.setScalar(scaleFactor);
    scaler.add(wrapper);

    // 4. Position so the GRIP lands on the local origin.
    const gripBox = robustSceneBounds(scaler, new THREE.Box3());
    const gSize = new THREE.Vector3();
    gripBox.getSize(gSize);
    const gx = gripBox.min.x + gSize.x * (spec.gripX ?? 0.5);
    const gy = gripBox.min.y + gSize.y * (spec.gripY ?? 0.3);
    const gz = gripBox.min.z + gSize.z * (spec.gripZ ?? 0.7);
    scaler.position.set(-gx, -gy, -gz);

    const root = new THREE.Group();
    root.name = `weapon_${kind}`;
    root.add(scaler);

    fixMaterials(root);
    addAddon(kind, root, spec);

    const cached: LoadedWeapon = { template: root, muzzleZ: spec.muzzleZ ?? -spec.length * 0.5 };
    _cache.set(kind, cached);
    return cached;
  } catch (err) {
    console.warn(`[WeaponModelLoader] failed to load "${spec.file}":`, err);
    return null;
  }
}

/** Start loading every weapon model in the background. Safe to re-call. */
export function preloadWeaponModels(): Promise<void> {
  const kinds = Object.keys(SPECS) as WeaponModelKind[];
  const jobs = kinds
    .filter(k => !_cache.has(k) && !_pending.has(k))
    .map(k => {
      const p = loadWeaponModel(k).finally(() => _pending.delete(k));
      _pending.set(k, p);
      return p;
    });
  return Promise.all(jobs).then(() => undefined);
}

/** Synchronously get a ready-to-attach clone, or null if not loaded yet.
 *  Uses SkeletonUtils because the Quaternius guns are SkinnedMeshes — a
 *  plain Object3D.clone() would leave the clone's skeleton pointing at the
 *  cached template's bones and render the weapon at the wrong place. */
export function getWeaponModelClone(kind: WeaponModelKind): THREE.Group | null {
  const cached = _cache.get(kind);
  if (!cached) return null;
  return cloneSkeleton(cached.template) as THREE.Group;
}

export function isWeaponModelReady(kind: WeaponModelKind): boolean {
  return _cache.has(kind);
}

/**
 * Asynchronously build a weapon model group for `kind`.
 * Resolves with null if the model could not be loaded (caller falls back to
 * the procedural builder).
 */
export async function buildWeaponModel(kind: WeaponModelKind): Promise<THREE.Group | null> {
  if (!_cache.has(kind)) {
    let p = _pending.get(kind);
    if (!p) {
      p = loadWeaponModel(kind).finally(() => _pending.delete(kind));
      _pending.set(kind, p);
    }
    await p;
  }
  return getWeaponModelClone(kind);
}

export function getWeaponMuzzleZ(kind: WeaponModelKind): number {
  return _cache.get(kind)?.muzzleZ ?? -0.3;
}
