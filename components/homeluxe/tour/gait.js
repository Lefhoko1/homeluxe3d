/**
 * The walking figure's body: joints, and a walk that is driven by the walk.
 *
 * THE CHARACTER USED TO BE A STATUE ON CASTORS. character.glb is thirteen
 * rigid parts -- legs, shoes, arms, hands, hips, torso, neck, head, nose --
 * with no skeleton and no animation, every part's origin at the feet. So the
 * figure slid across the floor with its legs together and its arms at its
 * sides, and turned on the spot like a turntable. However smooth the path,
 * that reads as a model being moved rather than a person walking.
 *
 * So the parts are hung from joints when the model loads -- legs from the
 * hips, arms from the shoulders, the head from the neck -- and a gait swings
 * them. Nothing here is keyframed: the stride is TIED TO THE DISTANCE
 * ACTUALLY COVERED, so the feet keep pace with the floor at any speed. A
 * figure whose legs cycle at a fixed rate while it speeds up and slows down
 * skates, and skating is exactly the unreality this is here to remove.
 *
 * What it does, all of it from two numbers the controller already has --
 * how fast the figure is going and how fast it is turning:
 *
 *   - legs swing from the hips, arms against them, as people walk
 *   - the body dips as the legs spread and rises as they pass, twice a stride
 *   - a slight lean into the walk, and a slight sway side to side
 *   - turning on the spot shuffles the feet instead of pivoting on a pin
 *   - standing still, the legs settle together and the arms hang
 *   - the head turns to what is being looked at BEFORE the body does, and
 *     further than the body does, as a person's head leads their shoulders
 */

import * as THREE from "three";

import { damp, smoothDamp } from "./easing.js";

/**
 * Where the joints are, in the model's own metres (built 1.70m tall, feet at
 * the origin, facing -Z). Read off the parts' bounding boxes: each leg hangs
 * from y 0.88 and sits 95mm either side of the middle, each arm from y 1.37,
 * and the head sits on the neck at 1.42. See blender/houseluxe/components/
 * character.py.
 */
const JOINTS = {
  legLeft: [-0.095, 0.88, 0],
  legRight: [0.095, 0.88, 0],
  armLeft: [-0.225, 1.37, 0],
  armRight: [0.225, 1.37, 0],
  head: [0, 1.42, 0],
};

/** Which parts hang from which joint, by the end of their exported names. */
const LIMBS = {
  legLeft: ["leg_left", "shoe_left"],
  legRight: ["leg_right", "shoe_right"],
  armLeft: ["arm_left", "hand_left"],
  armRight: ["arm_right", "hand_right"],
  head: ["head", "nose"],
};

/** Hip to sole, model metres. What the body dips by is worked out from it. */
const LEG_LENGTH = 0.88;

/** Radians each leg swings either side of straight, at a normal walk. */
const LEG_SWING = 0.36;
/** And each arm, against the leg on its own side. */
const ARM_SWING = 0.3;

/**
 * Metres covered by one full cycle -- left step and right step -- as a
 * function of speed. People lengthen their stride as they speed up as well
 * as stepping faster: about 1.25m per cycle at a stroll, 1.6m at a brisk walk.
 */
const cycleLength = (speed) => 1.05 + 0.22 * Math.min(speed, 2.5);

/** The speed a "normal" stride is sized for, m/s. */
const STRIDE_SPEED = 1.05;

/**
 * How much of the geometric dip the body actually makes. A rigid leg would
 * drop the hips 5cm at full stride; knees absorb most of it, and 2-3cm is
 * what reads as a walk rather than a bounce.
 */
const DIP_SHARE = 0.55;

/** Radians the head may turn from the body, and tilt up and down. */
const HEAD_YAW = 1.05;
const HEAD_UP = 0.35;
const HEAD_DOWN = 0.5;

const findPart = (root, suffix) => {
  let found = null;
  root.traverse((child) => {
    // GLTFLoader strips the dot from "character.leg_left", so match the end.
    if (!found && child.isMesh && child.name.replace(/[^a-z_]/gi, "").endsWith(suffix)) {
      found = child;
    }
  });
  return found;
};

/**
 * Hang the character's parts from joints. Idempotent: a model rigged once
 * keeps its rig.
 *
 * @param {THREE.Object3D} root  the loaded character, feet at its origin
 * @returns {object|null} the rig, or null if this is not the character model
 */
export function rigCharacter(root) {
  if (!root) return null;
  if (root.userData.rig) return root.userData.rig;

  const body = new THREE.Group();
  body.name = "rig.body";

  const joints = {};
  let found = 0;

  Object.entries(LIMBS).forEach(([limb, parts]) => {
    const joint = new THREE.Group();
    joint.name = `rig.${limb}`;
    joint.position.fromArray(JOINTS[limb]);
    body.add(joint);
    joints[limb] = joint;

    parts.forEach((suffix) => {
      const part = findPart(root, suffix);
      if (!part) return;
      found += 1;
      part.removeFromParent();
      // The part keeps its place in the model: it moves to the joint and is
      // offset back by the joint's position, so only the ROTATION changes
      // where it ends up.
      part.position.sub(joint.position);
      joint.add(part);

      // A SHOE WHOSE TOE POINTS BACKWARDS IS TURNED ROUND. The generator
      // built each shoe 150mm behind the ankle and 110mm in front of it -- a
      // heel longer than the foot -- which character.py now corrects. The
      // model is measured rather than trusted, so an export from before the
      // fix is mended and one from after it is left alone. Forward is -Z.
      if (suffix.startsWith("shoe")) {
        part.geometry.computeBoundingBox();
        const { min, max } = part.geometry.boundingBox;
        if (max.z > -min.z + 0.01) part.scale.z *= -1;
      }
    });
  });

  // Everything else -- hips, torso, neck -- rides on the body.
  [...root.children].forEach((child) => {
    if (child.isMesh) {
      child.removeFromParent();
      body.add(child);
    }
  });

  if (!found) return null;   // not the character model; leave it alone

  root.add(body);
  const rig = { body, joints };
  root.userData.rig = rig;
  return rig;
}

/**
 * A walk for a rigged character.
 *
 * @param {object|null} rig  from `rigCharacter`; null gives a gait that does
 *        nothing, so the controller never has to ask
 */
export function createGait(rig) {
  let phase = 0;
  let stride = 0;          // 0 standing .. 1 a full stride
  let lean = 0;
  let breathe = 0;
  const headYaw = { value: 0, velocity: { value: 0 } };
  const headPitch = { value: 0, velocity: { value: 0 } };

  return {
    /**
     * @param {number} dt  seconds
     * @param {object} motion
     * @param {number} motion.speed     metres per second actually covered
     * @param {number} motion.turnRate  radians per second the body is turning
     * @param {number} [motion.lookYaw]    radians, where the eyes want to be
     *        relative to where the body faces; positive is to the RIGHT
     * @param {number} [motion.lookPitch]  radians, positive is up
     */
    update(dt, { speed = 0, turnRate = 0, lookYaw = 0, lookPitch = 0 } = {}) {
      if (!rig || dt <= 0) return;
      const { body, joints } = rig;

      const moving = Math.abs(speed);
      const turning = Math.abs(turnRate);

      // TURNING ON THE SPOT IS STEPPING ON THE SPOT. Nobody rotates on a
      // pin; they take two or three small steps round. So a turn with
      // little forward speed keeps the feet going at a shorter stride.
      const shuffle = moving < 0.25 ? Math.min(turning / 1.4, 1) * 0.55 : 0;
      const wanted = Math.max(Math.min(moving / STRIDE_SPEED, 1.25), shuffle);

      // The stride opens as the walk starts and closes as it stops, rather
      // than the legs snapping together on the frame the walker halts.
      stride = damp(stride, wanted, wanted > stride ? 6 : 4, dt);

      // Distance drives the cycle; the shuffle is driven by the turn.
      const cyclesPerSecond = moving > 0.05
        ? moving / cycleLength(moving)
        : turning * 0.35;
      phase = (phase + cyclesPerSecond * Math.PI * 2 * dt) % (Math.PI * 4);

      // Once standing, let the legs finish the step they were in rather than
      // freezing mid-stride: the phase is drawn home to the nearest rest.
      if (stride < 0.02) {
        const rest = Math.round(phase / Math.PI) * Math.PI;
        phase = damp(phase, rest, 5, dt);
      }

      const swing = Math.sin(phase) * stride;
      joints.legLeft.rotation.x = swing * LEG_SWING;
      joints.legRight.rotation.x = -swing * LEG_SWING;
      joints.armLeft.rotation.x = -swing * ARM_SWING;
      joints.armRight.rotation.x = swing * ARM_SWING;
      // Arms hang slightly out from the body while walking, not glued to it.
      joints.armLeft.rotation.z = -0.04 * stride;
      joints.armRight.rotation.z = 0.04 * stride;

      // The body is lowest when the legs are furthest apart, twice a cycle:
      // where a rigid leg of this length would put the hips, softened by the
      // knees the model does not have.
      const legAngle = Math.abs(swing) * LEG_SWING;
      const dip = LEG_LENGTH * (1 - Math.cos(legAngle)) * DIP_SHARE;

      // Breathing, standing still: a few millimetres, every four seconds.
      breathe += dt;
      const rest = (1 - Math.min(stride * 3, 1)) * Math.sin(breathe * 1.6) * 0.003;

      body.position.y = -dip + rest;
      // Weight shifts over the foot that is down.
      body.rotation.z = Math.sin(phase) * 0.02 * stride;
      // A little forward lean into a walk; none standing.
      lean = damp(lean, Math.min(moving / 2.4, 1) * 0.06, 4, dt);
      body.rotation.x = -lean;

      // THE HEAD LEADS. It turns to what is being looked at on a quicker
      // spring than the body's, and as far as a neck goes, so a glance to
      // one side does not need the whole body to swing round.
      const yaw = Math.max(-HEAD_YAW, Math.min(HEAD_YAW, lookYaw));
      const pitch = Math.max(-HEAD_DOWN, Math.min(HEAD_UP, lookPitch));
      headYaw.value = smoothDamp(headYaw.value, yaw, headYaw.velocity, 0.6, dt, 1.0);
      headPitch.value = smoothDamp(headPitch.value, pitch, headPitch.velocity, 0.7, dt, 0.8);
      // The model faces -Z, so turning its head to the right is a negative
      // rotation about Y, and tilting it up is a positive one about X.
      joints.head.rotation.y = -headYaw.value;
      joints.head.rotation.x = headPitch.value;
    },
  };
}
