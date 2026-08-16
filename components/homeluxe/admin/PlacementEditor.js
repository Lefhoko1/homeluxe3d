/**
 * The move / rotate / scale gizmo.
 *
 * Deliberately NOT a React component. It manipulates Object3Ds sixty times a
 * second while a handle is held; routing that through state would re-render
 * the page on every mouse move. React owns the toolbar, this owns the scene,
 * and they meet at a handful of method calls.
 *
 * THINGS THAT ARE EASY TO GET WRONG HERE, ALL OF THEM LEARNED THE HARD WAY
 * ELSEWHERE IN THIS FILE'S HISTORY:
 *
 *  - Products are children of the products group, which is a child of the
 *    house group, which carries the recentring offset. So `object.position`
 *    is ALREADY plan-relative and must not be converted to world space.
 *    Converting adds about seven metres to everything.
 *
 *  - The gizmo helper goes in the SCENE, not the house group -- it positions
 *    itself from the attached object's world matrix, so parenting it under an
 *    offset group would draw it in the wrong place.
 *
 *  - OrbitControls must be disabled while a handle is held, or dragging an
 *    arrow also spins the camera.
 *
 *  - Scale is UNIFORM. `placements.scale` is one numeric column, not three,
 *    so a non-uniform gizmo would silently discard two thirds of what the
 *    admin just did. Rather than pretend, the axes are re-unified on change.
 */

import * as THREE from 'three';
import { TransformControls } from 'three-stdlib';

import { transformOf } from '../../../lib/scene/transforms';

/** Snap increments: 50mm, 15 degrees, 5%. Hold Shift for free movement. */
const SNAP_TRANSLATE = 0.05;
const SNAP_ROTATE = THREE.MathUtils.degToRad(15);
const SNAP_SCALE = 0.05;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export class PlacementEditor {
  /**
   * @param {object} options
   * @param {THREE.Camera} options.camera
   * @param {HTMLElement} options.dom          the renderer's canvas
   * @param {THREE.Scene} options.scene
   * @param {object} options.orbitControls
   * @param {(state: object) => void} [options.onChange] told when the
   *        selection or the dirty flag changes, so the toolbar can re-render
   */
  constructor({ camera, dom, scene, orbitControls, onChange = () => {} }) {
    this.scene = scene;
    this.orbitControls = orbitControls;
    this.onChange = onChange;

    this.object = null;
    this.original = null;        // transform as it was when attached
    this.mode = 'translate';
    this.dragging = false;
    this.snap = true;
    this.lockY = true;           // furniture stands on the floor
    this.uniformScale = 1;

    const controls = new TransformControls(camera, dom);
    controls.setSize(0.9);
    controls.addEventListener('dragging-changed', this.#onDragging);
    controls.addEventListener('objectChange', this.#onObjectChange);
    this.controls = controls;

    // three moved TransformControls off Object3D: newer versions expose the
    // drawable part separately. Support both rather than pinning a version.
    this.helper = typeof controls.getHelper === 'function'
      ? controls.getHelper()
      : controls;

    this.#applySettings();
  }

  // -- selection -----------------------------------------------------------

  /**
   * Take control of an object.
   *
   * `object` should be the tagged product root -- the node carrying
   * `userData.productId` -- not the mesh a raycast happened to hit.
   */
  attach(object) {
    if (!object) return this.detach();
    if (this.object === object) return;

    this.object = object;
    this.original = transformOf(object);
    this.uniformScale = object.scale.x;

    this.controls.attach(object);
    if (this.helper.parent !== this.scene) this.scene.add(this.helper);
    this.#emit();
  }

  detach() {
    this.controls.detach();
    if (this.helper.parent) this.helper.parent.remove(this.helper);
    this.object = null;
    this.original = null;
    this.#emit();
  }

  /** Put the object back where it was found. */
  revert() {
    if (!this.object || !this.original) return;
    const { x_mm, y_mm, z_mm, rotation_deg, scale } = this.original;
    // Imported lazily-by-hand rather than via applyTransform to avoid a
    // circular-looking import in a file that already owns transformOf.
    this.object.position.set(x_mm / 1000, z_mm / 1000, -y_mm / 1000);
    this.object.rotation.y = THREE.MathUtils.degToRad(rotation_deg);
    this.object.scale.setScalar(scale);
    this.uniformScale = scale;
    this.#emit();
  }

  /** Sit the object on the floor without moving it horizontally. */
  dropToFloor() {
    if (!this.object) return;
    this.object.position.y = 0;
    this.#emit();
  }

  /** Called after a successful save, so the toolbar stops saying "unsaved". */
  markSaved() {
    if (!this.object) return;
    this.original = transformOf(this.object);
    this.#emit();
  }

  // -- settings ------------------------------------------------------------

  setMode(mode) {
    this.mode = mode;
    this.controls.setMode(mode);
    this.#applySettings();
    this.#emit();
  }

  setSnap(enabled) {
    this.snap = enabled;
    this.#applySettings();
    this.#emit();
  }

  setLockY(locked) {
    this.lockY = locked;
    this.#applySettings();
    this.#emit();
  }

  #applySettings() {
    const { controls } = this;

    controls.setTranslationSnap(this.snap ? SNAP_TRANSLATE : null);
    controls.setRotationSnap(this.snap ? SNAP_ROTATE : null);
    controls.setScaleSnap(this.snap ? SNAP_SCALE : null);

    if (this.mode === 'translate') {
      // Y hidden by default. A free three-axis translate gizmo produces
      // floating furniture more reliably than it produces wall units.
      controls.showX = true;
      controls.showY = !this.lockY;
      controls.showZ = true;
    } else if (this.mode === 'rotate') {
      // Only yaw. Furniture that is tipped over is never what was meant, and
      // the database stores a single rotation about the vertical anyway.
      controls.showX = false;
      controls.showY = true;
      controls.showZ = false;
    } else {
      controls.showX = true;
      controls.showY = true;
      controls.showZ = true;
    }
  }

  // -- state ---------------------------------------------------------------

  get isDragging() {
    return this.dragging;
  }

  get hasSelection() {
    return Boolean(this.object);
  }

  get isDirty() {
    if (!this.object || !this.original) return false;
    const now = transformOf(this.object);
    return (
      now.x_mm !== this.original.x_mm ||
      now.y_mm !== this.original.y_mm ||
      now.z_mm !== this.original.z_mm ||
      now.rotation_deg !== this.original.rotation_deg ||
      now.scale !== this.original.scale
    );
  }

  /** What the database should be told. */
  toTransform() {
    return this.object ? transformOf(this.object) : null;
  }

  /** Everything the toolbar needs to draw itself. */
  get state() {
    return {
      mode: this.mode,
      snap: this.snap,
      lockY: this.lockY,
      hasSelection: this.hasSelection,
      isDirty: this.isDirty,
      transform: this.toTransform(),
      advert: this.object?.userData ?? null,
    };
  }

  dispose() {
    this.controls.removeEventListener('dragging-changed', this.#onDragging);
    this.controls.removeEventListener('objectChange', this.#onObjectChange);
    this.detach();
    this.controls.dispose();
  }

  // -- internals -----------------------------------------------------------

  #onDragging = (event) => {
    this.dragging = event.value;
    // Without this the camera orbits at the same time as the handle drags.
    if (this.orbitControls) this.orbitControls.enabled = !event.value;
    if (!event.value) this.#emit();
  };

  #onObjectChange = () => {
    const object = this.object;
    if (!object) return;

    if (this.mode === 'scale') {
      // Re-unify. The gizmo has moved one axis; whichever moved furthest
      // from the last uniform value is what the admin meant, applied to all.
      const last = this.uniformScale;
      const next = [object.scale.x, object.scale.y, object.scale.z].reduce(
        (best, value) =>
          Math.abs(value - last) > Math.abs(best - last) ? value : best,
        last
      );
      this.uniformScale = THREE.MathUtils.clamp(next, MIN_SCALE, MAX_SCALE);
      object.scale.setScalar(this.uniformScale);
    }

    if (this.mode === 'translate' && this.lockY) {
      object.position.y = 0;
    }

    // Fires continuously while dragging; the toolbar shows live coordinates,
    // which is worth one cheap render per frame during a drag only.
    this.#emit();
  };

  #emit() {
    this.onChange(this.state);
  }
}

export default PlacementEditor;
