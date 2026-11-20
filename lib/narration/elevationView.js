/**
 * Where the camera stands to show one ELEVATION of a product.
 *
 * Shared by the recording screen and the tour, so the angle a shop picks
 * while it talks is exactly the angle the visitor is shown while the clip
 * plays. Pure geometry -- no scene, no renderer -- so it is tested in Node.
 *
 * "Left side" means the side on YOUR left as you stand facing the product's
 * front, which is how a shop will describe it ("on the left you have the
 * storage console"). The tests hold that, because it is easy to get the
 * wrong way round.
 */

import * as THREE from "three";

/**
 * `yaw`: degrees round the piece from its front, positive towards the
 * viewer's RIGHT. `pitch`: degrees above level the camera looks down from.
 * `close`: a detail shot, nearer and aimed a little above the middle.
 */
export const ELEVATIONS = [
  { id: "front",  label: "Front",        yaw: 0,    pitch: 12 },
  { id: "left",   label: "Left side",    yaw: -90,  pitch: 12 },
  { id: "right",  label: "Right side",   yaw: 90,   pitch: 12 },
  { id: "back",   label: "Back",         yaw: 180,  pitch: 12 },
  { id: "top",    label: "From above",   yaw: 25,   pitch: 62 },
  { id: "detail", label: "Close detail", yaw: 30,   pitch: 18, close: true },
];

export const elevationOf = (id) => ELEVATIONS.find((e) => e.id === id) ?? ELEVATIONS[0];

const UP = new THREE.Vector3(0, 1, 0);
/** Headroom round the piece, so it is not cropped at the edges of the frame. */
const MARGIN = 1.12;
/** A detail shot stands this much closer. */
const CLOSE = 0.55;

/**
 * The direction from the product to the camera for an elevation.
 *
 * @param {THREE.Vector3} front  unit vector the product faces, level
 * @param {object} elevation     one of ELEVATIONS
 */
export function elevationDirection(front, elevation) {
  const flat = new THREE.Vector3(front.x, 0, front.z).normalize();
  // Facing the product you look along -front, and your right is
  // (-front) x up. For a product facing -Z that is -X -- which is where a
  // POSITIVE turn about Y takes -Z. So positive yaw = your right, as is.
  flat.applyAxisAngle(UP, THREE.MathUtils.degToRad(elevation.yaw));
  const pitch = THREE.MathUtils.degToRad(elevation.pitch ?? 0);
  return flat.multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch)).normalize();
}

/**
 * Where to put the camera and what to aim it at.
 *
 * @param {object} piece
 * @param {THREE.Box3}    piece.box    the product's world bounding box
 * @param {THREE.Vector3} piece.front  unit vector it faces
 * @param {object|string} elevation    an ELEVATIONS entry, or its id
 * @param {object} [lens]
 * @param {number} [lens.fov=50]       vertical field of view, degrees
 * @param {number} [lens.aspect=1.6]   width / height
 * @returns {{eye: THREE.Vector3, target: THREE.Vector3, distance: number}}
 */
export function elevationView({ box, front }, elevation, { fov = 50, aspect = 1.6 } = {}) {
  const spec = typeof elevation === "string" ? elevationOf(elevation) : elevation;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(0.15, size.length() / 2);

  // Fit the piece's bounding sphere in whichever of the two angles is tighter.
  const vHalf = THREE.MathUtils.degToRad(fov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  let distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * MARGIN;
  if (spec.close) distance *= CLOSE;

  const target = centre.clone();
  if (spec.close) target.y += size.y * 0.15;

  const eye = target.clone().addScaledVector(elevationDirection(front, spec), distance);
  return { eye, target, distance };
}
