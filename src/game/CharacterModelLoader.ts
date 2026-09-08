// CharacterModelLoader.ts
// Loads the GLTF soldier model with embedded Idle/Walk/Run animations,
// caches it, and provides per-instance clones with their own AnimationMixer
// + a procedural Death clip (the source GLB has no death animation).
//
// Design notes:
//   - The cloned GLTF scene is added as a child of the caller's `meshGroup`.
//   - Every visual mesh in the clone has `raycast = () => {}` overridden so it
//     does NOT participate in hit-detection raycasts (the caller still owns
//     its own invisible head/body hitboxes). This preserves the existing
//     GameCanvas.tsx hit-detection logic line-for-line.
//   - Each clone has its own AnimationMixer so multiple bots can animate
//     independently.
//   - The procedural Death clip rotates the whole root forward 90° and lowers
//     it to the ground, matching the old tip-over behavior but driven through
//     the mixer so it cleanly layers with idle/walk/run.
//   - `tryCreateCharacterInstance` is SYNCHRONOUS: it returns null if the
//     model hasn't finished loading yet, so callers can fall back to the
//     procedural character. This avoids making the bot-creation code async.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Vite exposes BASE_URL via import.meta.env, but the project's tsconfig
// doesn't include vite/client types. Cast to any to avoid the TS error.
const BASE_URL = ((import.meta as any).env?.BASE_URL) || '/';
const MODEL_URL = `${BASE_URL}models/Soldier.glb`;

// Target render height of the soldier in world units (meters).
// The original procedural character had head at y=1.6, so ~1.8m total height
// matches well.
const TARGET_HEIGHT = 1.8;

export type AnimName = 'Idle' | 'Walk' | 'Run' | 'Death';

export interface LoadedCharacterModel {
  scene: THREE.Group;          // normalized scene — clone this
  animations: THREE.AnimationClip[];
  clips: Record<AnimName, THREE.AnimationClip | null>;
  /** World-space Y of the head bone (after normalization). Used by callers
   *  to position a head hitbox. */
  headY: number;
}

let _cached: LoadedCharacterModel | null = null;
let _loadingPromise: Promise<LoadedCharacterModel> | null = null;
let _loadFailed = false;

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

      _cached = { scene: normalized, animations: gltf.animations, clips, headY };
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
  mixer: THREEAnimationMixer;     // call .update(delta) each frame
  actions: Record<AnimName, THREEAnimationAction | null>;
  currentAction: THREEAnimationAction | null;
  headY: number;                  // world Y of the head bone (for hitbox positioning)
}

// Type aliases to avoid importing THREE types repeatedly.
type THREEAnimationMixer = THREE.AnimationMixer;
type THREEAnimationAction = THREE.AnimationAction;

/**
 * SYNCHRONOUSLY create a character instance by cloning the cached model.
 * Returns null if the model isn't loaded yet — caller should fall back to
 * the procedural character in that case.
 *
 * @param tint Optional THREE.Color to tint the body material (per-class color).
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
  };
}

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
  // (setEffectiveWeight already called above)
  if (inst.currentAction && inst.currentAction !== next) {
    inst.currentAction.crossFadeTo(next, fadeDuration, false);
  }
  inst.currentAction = next;
}
