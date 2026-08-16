/**
 * The one definition of scene space.
 *
 * Three coordinate systems meet in this project and they do not agree:
 *
 *   BLENDER / DATABASE   millimetres, Z up, +Y is north
 *   glTF / THREE.JS      metres,      Y up, -Z is north
 *
 * so a point (x, y, z) in the plan becomes (x, z, -y) in the viewer, scaled
 * by a thousand. That mapping was written out by hand in repository.js and
 * would have been written out again in the placement editor -- and two
 * definitions of it in two files is how a sofa ends up in the garden.
 *
 * It lives here instead, with its inverse beside it, so the round trip
 * (drag a chair, save it, reload the page, find it where you left it) is
 * provably the identity rather than hopefully the identity.
 *
 * ROTATION deserves a note. The database stores degrees about the plan's Z
 * axis; three.js rotates about Y. They are the same axis after the mapping
 * above, and ProductLoader has always assigned `rotation.y = degToRad(deg)`
 * directly, so that is the contract these functions preserve. Do not "fix"
 * the sign here without re-exporting every model -- the whole catalogue is
 * placed against it.
 */

/** Millimetres in plan space -> metres in three.js space. */
export function mmToThree(xMm, yMm, zMm) {
  return [(xMm ?? 0) / 1000, (zMm ?? 0) / 1000, -((yMm ?? 0) / 1000)];
}

/** Metres in three.js space -> millimetres in plan space. */
export function threeToMm(x, y, z) {
  return {
    x_mm: round1(x * 1000),
    y_mm: round1(-z * 1000),
    z_mm: round1(y * 1000),
  };
}

/** Plan rotation (degrees CCW about Z) -> three.js Y rotation in radians. */
export function degToThreeY(deg) {
  return ((deg ?? 0) * Math.PI) / 180;
}

/** three.js Y rotation in radians -> plan rotation in degrees, 0..360. */
export function threeYToDeg(radians) {
  const deg = ((radians ?? 0) * 180) / Math.PI;
  // Normalised, because a gizmo dragged in circles accumulates turns and the
  // column is numeric(6,2) -- 1e6 degrees would overflow it.
  return round2(((deg % 360) + 360) % 360);
}

/**
 * Everything the database needs to record a transform, read off an Object3D.
 *
 * The object must be a child of the products group, which sits at the house
 * group's origin -- so its local position is already plan-relative and no
 * world-space conversion is wanted here. Converting would introduce the
 * house's recentring offset and put everything about seven metres out.
 */
export function transformOf(object3D) {
  const { x, y, z } = object3D.position;
  return {
    ...threeToMm(x, y, z),
    rotation_deg: threeYToDeg(object3D.rotation.y),
    // Uniform only: `placements.scale` is a single scalar, and non-uniform
    // scaling of real furniture is wrong anyway.
    scale: round3(object3D.scale.x),
  };
}

/** Apply a stored transform to an Object3D. The inverse of `transformOf`. */
export function applyTransform(object3D, { x_mm, y_mm, z_mm, rotation_deg, scale }) {
  object3D.position.fromArray(mmToThree(x_mm, y_mm, z_mm));
  object3D.rotation.y = degToThreeY(rotation_deg);
  object3D.scale.setScalar(scale ?? 1);
  return object3D;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
