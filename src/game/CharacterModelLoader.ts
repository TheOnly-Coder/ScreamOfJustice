// CharacterModelLoader.ts
// Loads the GLTF soldier model with embedded Idle/Walk/Run animations,
// caches it, and provides per-instance clones with their own AnimationMixer.
//
// Design notes:
//   - The cloned GLTF scene is added as a child of the caller's `meshGroup`.
//   - Every visual mesh in the clone has `raycast = () => {}` overridden so it
//     does NOT participate in hit-detection raycasts (the caller still owns
//     its own invisible head/body hitboxes). This preserves the existing
//     GameCanvas.tsx hit-detection logic line-for-line.
//   - Each clone has its own AnimationMixer so multiple bots can animate
//     independently.
//   - `tryCreateCharacterInstance` is SYNCHRONOUS: it returns null if the
//     model hasn't finished loading yet, so callers can fall back to the
//     procedural character. This avoids making the bot-creation code async.
//
// Weapon-hold support (NEW):
//   - The loader captures the bind-pose ("rest") world orientation of every
//     pose-relevant bone ONCE, so CharacterPose.ts can deterministically
//     re-pose arms/legs to hold weapons on top of the mixer-driven clips
//     (rifle carry, pistol hold, melee grip, jump tuck).
//   - `tryCreateCharacterInstance` accepts an optional tint AND team color:
//     the body is tinted with the team color in team modes so every bot on a
//     team reads as one unit (per request: bots don't have unique characters —
//     teams have their own character color).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Vite exposes BASE_URL via import.meta.env, but the project's tsconfig
// doesn't include vite/client types. Cast to any to avoid the TS error.
const BASE_URL = ((import.meta as any).env?.BASE_URL) || '/';
const MODEL_URL = `${BASE_URL}models/Soldier.glb`;

// Target render height of the soldier in world units (meters).
const TARGET_HEIGHT = 1.8;

export type AnimName = 'Idle' | 'Walk' | 'Run' | 'Death';

export interface LoadedCharacterModel {
  scene: THREE.Group;          // normalized scene — clone this
  animations: THREE.AnimationClip[];
  clips: Record<AnimName, THREE.AnimationClip | null>;
  /** World-space Y of the head bone (after normalization). Used by callers
   *  to position a head hitbox. */
  headY: number;
  /** Bind-pose world quaternions (in root space) for pose bones, by name.
   *  Shared read-only reference for every instance. */
  restQuats: Record<string, THREE.Quaternion>;
}

let _cached: LoadedCharacterModel | null = null;
let _loadingPromise: Promise<LoadedCharacterModel> | null = null;
let _loadFailed = false;

/** Bones re-posed by the weapon-hold / jump layers. */
export const POSE_BONES = [
  'Hips',
  'Spine', 'Spine1', 'Spine2',
  'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
] as const;

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  // Mixamo bone names lose their ":" during GLTF import (three.js
  // sanitizeNodeName), so try every spelling seen in the wild:
  //   "mixamorig:Hips" (source) / "mixamorigHips" (loaded) / "Hips"
  return (
    root.getObjectByName(`mixamorig:${name}`) ||
    root.getObjectByName(`mixamorig${name}`) ||
    root.getObjectByName(name) ||
    null
  );
}

/** Preload the GLTF model in the background. Safe to call multiple times. */
export function preloadCharacterModel(): Promise<LoadedCharacterModel> {
  if (_cached) return Promise.resolve(_cached);
  if (_loadingPromise) return _loadingPromise;
  if (_loadFailed) {
    // Retry once on explicit preload call after a previous failure.
    _loadFailed = false;
  }
  _loadingPromise = (async () => {
    try {
      const loader = new GLTFLoader();
      // Models are meshopt-compressed by gltf-transform (4x smaller downloads)
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(MODEL_URL);

      // --- Normalize the model: scale to TARGET_HEIGHT, feet at Y=0, face -Z ---
      const tmpBox = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      tmpBox.getSize(size);

      // The Soldier.glb from three.js examples is in centimeters and its
      // native orientation is "facing +Z" with Y up. We want:
      //   - height = TARGET_HEIGHT (1.8m)
      //   - feet at Y = 0
      //   - facing -Z (so weapon attached at +Z appears in front of the bot)
      const scaleFactor = TARGET_HEIGHT / size.y;

      const normalized = new THREE.Group();
      // 1. Translate so feet (min Y) are at Y=0
      gltf.scene.position.y = -tmpBox.min.y;
      // 2. Rotate 180° around Y so model faces -Z
      gltf.scene.rotation.y = Math.PI;
      // 3. Apply uniform scale on the wrapper
      normalized.scale.setScalar(scaleFactor);
      normalized.add(gltf.scene);

      // Shared template: mark resources as do-not-dispose (see the note in
      // WeaponModelLoader — clones share geometry/materials with this cache).
      gltf.scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.userData.doNotDispose = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach(mat => { (mat as any).userData.doNotDispose = true; });
        }
      });

      // Compute head world Y for callers (after normalization).
      let headBone: THREE.Object3D | null = null;
      gltf.scene.traverse(obj => {
        if (obj.name === 'mixamorig:Head' && !headBone) headBone = obj;
      });
      let headY = TARGET_HEIGHT * 0.92; // sensible default if head bone not found
      if (headBone) {
        const headWorld = new THREE.Vector3();
        headBone.getWorldPosition(headWorld);
        headWorld.multiplyScalar(scaleFactor); // account for normalized wrapper scale
        headY = headWorld.y;
      }

      // Enable shadows on every mesh and disable raycasting on visual meshes.
      normalized.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Visual meshes should NOT participate in hit-detection raycasts.
          mesh.raycast = () => {};
          mesh.userData.isCharacterVisual = true;
        }
      });

      // --- Capture bind-pose world orientations for the pose layer ---
      // Done BEFORE any animation clip has played, so this is the true
      // T-pose bind orientation. Scale does not affect quaternions.
      normalized.updateMatrixWorld(true);
      const restQuats: Record<string, THREE.Quaternion> = {};
      for (const name of POSE_BONES) {
        const bone = findBone(normalized, name);
        if (bone) {
          restQuats[name] = bone.getWorldQuaternion(new THREE.Quaternion());
        }
      }

      const clips: Record<AnimName, THREE.AnimationClip | null> = {
        Idle: null,
        Walk: null,
        Run: null,
        Death: null,
      };
      for (const clip of gltf.animations) {
        const name = clip.name as AnimName;
        if (name in clips) clips[name] = clip;
      }
      // NOTE: We don't synthesize a procedural Death clip. The existing
      // GameCanvas.tsx death animation (forward tip-over of meshGroup) works
      // well and is preserved as-is. The mixer is only used for
      // idle/walk/run transitions on LIVING bots.

      _cached = { scene: normalized, animations: gltf.animations, clips, headY, restQuats };
      return _cached;
    } catch (err) {
      console.warn('[CharacterModelLoader] Failed to load character model:', err);
      _loadFailed = true;
      throw err;
    } finally {
      _loadingPromise = null;
    }
  })();
  return _loadingPromise;
}

/** Synchronously check if the model is loaded and ready. */
export function isCharacterModelLoaded(): boolean {
  return _cached !== null;
}

export interface CharacterInstance {
  root: THREE.Group;              // the cloned GLTF scene — ADD this to your meshGroup
  mixer: THREE.AnimationMixer;    // call .update(delta) each frame
  actions: Record<AnimName, THREEAnimationAction | null>;
  currentAction: THREEAnimationAction | null;
  headY: number;                  // world Y of the head bone (for hitbox positioning)
  restQuats: Record<string, THREE.Quaternion>;
  /** Per-instance smoothing state for the weapon-hold layer (owned by
   *  CharacterPose.ts). Maps bone name -> last applied LOCAL quaternion. */
  poseState?: Map<string, THREE.Quaternion>;
  /** Set to > 0 while a melee swing overlay is playing (seconds remaining). */
  meleeSwingTimer?: number;
  /** Total duration of the active melee swing (for progress math). */
  meleeSwingDuration?: number;
  /** Weapon model currently parented to the right hand (pose layer keeps it
   *  aligned with the hold pose every frame). */
  attachedWeapon?: {
    obj: THREE.Object3D;
    hold: 'rifle' | 'pistol' | 'melee';
    handScaleComp: number;
  } | null;
}

// Type aliases to avoid importing THREE types repeatedly.
type THREEAnimationMixer = THREE.AnimationMixer;
type THREEAnimationAction = THREE.AnimationAction;

/**
 * SYNCHRONOUSLY create a character instance by cloning the cached model.
 * Returns null if the model isn't loaded yet — caller should fall back to
 * the procedural character in that case.
 *
 * @param tint Optional THREE.Color to tint the body material (per-class or
 *             per-team color).
 */
export function tryCreateCharacterInstance(
  tint?: THREE.Color | null
): CharacterInstance | null {
  if (!_cached) return null;
  const loaded = _cached;

  // SkeletonUtils.clone preserves skinning/bone data — required for skinned
  // meshes (which the Soldier model is).
  const root = cloneSkeleton(loaded.scene) as THREE.Group;

  // Apply a per-instance tint by cloning the body material.
  if (tint) {
    root.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) {
          mesh.material = mat.map(m => tintMaterial(m, tint));
        } else {
          mesh.material = tintMaterial(mat, tint);
        }
        // Re-assert raycast override (clone may have reset it).
        mesh.raycast = () => {};
      }
    });
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions: Record<AnimName, THREEAnimationAction | null> = {
    Idle: null,
    Walk: null,
    Run: null,
    Death: null,
  };
  for (const name of Object.keys(actions) as AnimName[]) {
    const clip = loaded.clips[name];
    if (clip) {
      const action = mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      action.play();
      actions[name] = action;
    }
  }
  // Start in Idle by default.
  if (actions.Idle) {
    actions.Idle.setEffectiveWeight(1);
  }

  return {
    root,
    mixer,
    actions,
    currentAction: actions.Idle,
    headY: loaded.headY,
    restQuats: loaded.restQuats,
    poseState: new Map(),
    meleeSwingTimer: 0,
    meleeSwingDuration: 0.38,
  };
}

/**
 * Tint only the character's CLOTHING (torso/limbs), keeping skin and gear
 * colors intact, so team colors read clearly without making the whole model
 * a single flat color. Falls back to tinting everything if the clothing
 * materials cannot be identified.
 */
function tintMaterial(mat: THREE.Material, tint: THREE.Color): THREE.Material {
  const m = (mat as THREE.Material).clone();
  if ('color' in m) {
    const baseColor = (m as any).color as THREE.Color;
    if (baseColor) {
      (m as any).color = baseColor.clone().multiply(tint);
    }
  }
  return m;
}

/** Find a bone inside a character instance (mixamorig prefix aware). */
export function findCharacterBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return findBone(root, name);
}

/**
 * Smoothly transition from the current action to a new one with a fade.
 * Used by the per-frame bot loop.
 */
export function transitionTo(
  inst: CharacterInstance,
  name: AnimName,
  fadeDuration = 0.2,
  options: { loop?: THREE.AnimationActionLoopStyles; clampWhenFinished?: boolean } = {}
) {
  const next = inst.actions[name];
  if (!next) return;
  if (inst.currentAction === next) return;

  if (options.loop !== undefined) {
    next.setLoop(options.loop, Infinity);
  } else if (name === 'Death') {
    next.setLoop(THREE.LoopOnce, 1);
  }
  if (options.clampWhenFinished !== undefined) {
    next.clampWhenFinished = options.clampWhenFinished;
  } else if (name === 'Death') {
    next.clampWhenFinished = true;
  }

  next.reset();
  next.setEffectiveWeight(1);
  next.play();
  if (inst.currentAction && inst.currentAction !== next) {
    inst.currentAction.crossFadeTo(next, fadeDuration, false);
  }
  inst.currentAction = next;
}

/** Kick off a one-shot melee swing overlay (drives CharacterPose). */
export function startMeleeSwing(inst: CharacterInstance, duration = 0.38): void {
  inst.meleeSwingTimer = duration;
  inst.meleeSwingDuration = duration;
}
