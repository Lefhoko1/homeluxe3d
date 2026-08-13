/**
 * Walk-through tour.
 *
 * Drives a character around the property in third person, so a visitor can
 * arrive at the gate, walk up the drive, go through the front door and stand
 * in front of the furniture at eye level. Orbiting a model tells you the
 * layout; walking it tells you the scale.
 *
 * Three problems have to be solved for that to feel right, and each is solved
 * by a raycast rather than by a physics engine:
 *
 *  1. GROUND FOLLOWING. The lawn is contoured, the slab stands 150mm proud,
 *     the porch is a step up. A ray fired straight down finds whatever is
 *     underfoot, so the character walks up the step without being told the
 *     step exists.
 *
 *  2. WALLS. A short ray fired along the direction of travel stops the
 *     character before it reaches a wall. Because walls were built as piers,
 *     sills and lintels rather than solid panels with holes cut in them,
 *     doorways are REAL GAPS in the geometry -- so walking through a doorway
 *     needs no door logic at all. The ray simply finds nothing.
 *
 *  3. FALLING. If a downward ray finds nothing (off the edge of the site),
 *     the character keeps its previous height instead of dropping forever.
 *
 * Door leaves are deliberately NOT collided with: every door is treated as
 * open. A tour that requires you to work out which doors open is a worse tour.
 */

import * as THREE from "three";

/** Metres per second. A relaxed walking pace, not a sprint. */
export const WALK_SPEED = 2.4;

/** Radians per second when turning on the spot. */
export const TURN_SPEED = 2.2;

/** How far ahead to check for walls. Roughly shoulder width. */
const COLLIDE_DISTANCE = 0.42;

/** Ray height for wall checks: chest height, clear of skirtings and steps. */
const CHEST = 1.1;

/** How far above the character to start the downward ground ray. */
const PROBE_HEIGHT = 4.0;

/** Third-person camera rig. */
const CAMERA_BACK = 4.2;
const CAMERA_UP = 2.4;
const CAMERA_LOOK_AT = 1.3;

/** How quickly the camera catches up. 1 = instant, lower = smoother. */
const CAMERA_LERP = 0.12;

/**
 * @param {object} options
 * @param {THREE.Object3D} options.character  the avatar, feet at its origin
 * @param {THREE.Camera}   options.camera
 * @param {object}         options.controls   OrbitControls, disabled while walking
 * @param {THREE.Object3D[]} options.groundObjects  what to stand on
 * @param {THREE.Object3D[]} options.wallObjects    what to bump into
 * @param {number[]}       options.start      [x, z] start position, metres
 * @param {number}         options.startHeading  radians; 0 faces -Z
 */
export function createTourController(options = {}) {
  const {
    character,
    camera,
    controls,
    groundObjects = [],
    wallObjects = [],
    start = [0, 0],
    startHeading = 0,
  } = options;

  const position = new THREE.Vector3(start[0], 0, start[1]);
  let heading = startHeading;
  let active = false;
  let lastGroundY = 0;

  const groundRay = new THREE.Raycaster();
  groundRay.far = PROBE_HEIGHT * 2;

  const wallRay = new THREE.Raycaster();
  wallRay.far = COLLIDE_DISTANCE;

  const DOWN = new THREE.Vector3(0, -1, 0);
  const probe = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  // Held input. Keyboard and on-screen buttons write into the same object so
  // they behave identically -- including both at once.
  const input = { forward: 0, turn: 0 };
  const keys = new Set();

  const MOVE_KEYS = {
    ArrowUp: ["forward", 1], KeyW: ["forward", 1],
    ArrowDown: ["forward", -1], KeyS: ["forward", -1],
    ArrowLeft: ["turn", 1], KeyA: ["turn", 1],
    ArrowRight: ["turn", -1], KeyD: ["turn", -1],
  };

  function readKeys() {
    let f = 0;
    let t = 0;
    keys.forEach((code) => {
      const mapped = MOVE_KEYS[code];
      if (!mapped) return;
      if (mapped[0] === "forward") f += mapped[1];
      else t += mapped[1];
    });
    return { f, t };
  }

  function onKeyDown(event) {
    if (!active || !MOVE_KEYS[event.code]) return;
    keys.add(event.code);
    // Stop arrow keys scrolling the page out from under the canvas.
    event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  /** Height of whatever is directly under (x, z). */
  function groundAt(x, z) {
    probe.set(x, lastGroundY + PROBE_HEIGHT, z);
    groundRay.set(probe, DOWN);
    const hits = groundRay.intersectObjects(groundObjects, true);
    return hits.length ? hits[0].point.y : null;
  }

  /** True if something solid is within reach in this direction. */
  function blocked(origin, direction) {
    if (!wallObjects.length) return false;
    probe.set(origin.x, lastGroundY + CHEST, origin.z);
    wallRay.set(probe, direction);
    return wallRay.intersectObjects(wallObjects, true).length > 0;
  }

  return {
    get active() {
      return active;
    },

    get position() {
      return position.clone();
    },

    /** Enter walk mode: park the character, take over the camera. */
    enter() {
      if (active) return;
      active = true;
      keys.clear();
      input.forward = 0;
      input.turn = 0;

      if (controls) controls.enabled = false;

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;
      position.y = lastGroundY;

      character.visible = true;
      character.position.copy(position);
      character.rotation.y = heading;

      // Snap the camera in rather than sweeping it across the whole site.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camera.position.set(
        position.x - forward.x * CAMERA_BACK,
        position.y + CAMERA_UP,
        position.z - forward.z * CAMERA_BACK
      );
      camera.lookAt(position.x, position.y + CAMERA_LOOK_AT, position.z);
    },

    /** Leave walk mode and hand the camera back to OrbitControls. */
    exit() {
      if (!active) return;
      active = false;
      keys.clear();
      character.visible = false;
      if (controls) {
        controls.enabled = true;
        controls.target.set(position.x, position.y + 1, position.z);
      }
    },

    toggle() {
      if (active) this.exit();
      else this.enter();
    },

    /** Press or release an on-screen control. `dir` is one of the MOVE keys. */
    setButton(dir, pressed) {
      const amount = pressed ? 1 : 0;
      if (dir === "forward") input.forward = amount;
      else if (dir === "back") input.forward = -amount;
      else if (dir === "left") input.turn = amount;
      else if (dir === "right") input.turn = -amount;
    },

    /** Release everything. Used when the pointer leaves a button mid-press. */
    releaseAll() {
      input.forward = 0;
      input.turn = 0;
      keys.clear();
    },

    attach(target = window) {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
    },

    detach(target = window) {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    },

    /** Advance the walk. `delta` in seconds. */
    update(delta) {
      if (!active) return;

      // Clamp: a long frame (tab regains focus) must not teleport anyone
      // through a wall by stepping further than the collision ray reaches.
      const step = Math.min(delta, 0.05);

      const held = readKeys();
      const turn = held.t + input.turn;
      const drive = held.f + input.forward;

      if (turn) heading += turn * TURN_SPEED * step;

      if (drive) {
        forward.set(Math.sin(heading), 0, -Math.cos(heading));
        const distance = drive * WALK_SPEED * step;
        desired.copy(forward).multiplyScalar(Math.sign(distance));

        if (!blocked(position, desired)) {
          position.x += forward.x * distance;
          position.z += forward.z * distance;
        } else {
          // Slide along the wall rather than sticking to it: try each axis
          // on its own, so walking into a wall at an angle still moves you.
          const tryX = desired.clone().setZ(0).normalize();
          const tryZ = desired.clone().setX(0).normalize();
          if (tryX.lengthSq() && !blocked(position, tryX)) {
            position.x += forward.x * distance;
          } else if (tryZ.lengthSq() && !blocked(position, tryZ)) {
            position.z += forward.z * distance;
          }
        }
      }

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;   // else keep the last known height
      position.y = lastGroundY;

      character.position.copy(position);
      character.rotation.y = heading;

      // Chase camera, eased so turning does not whip the view around.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camTarget.set(
        position.x - forward.x * CAMERA_BACK,
        position.y + CAMERA_UP,
        position.z - forward.z * CAMERA_BACK
      );

      // Keep the camera out of walls: if the ideal spot is behind one, pull
      // it in until it is not.
      camera.position.lerp(camTarget, CAMERA_LERP);
      lookTarget.set(position.x, position.y + CAMERA_LOOK_AT, position.z);
      camera.lookAt(lookTarget);
    },
  };
}
