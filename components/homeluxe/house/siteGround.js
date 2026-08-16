/**
 * Making the ground look like ground.
 *
 * Two jobs, both of which need the yard's real extent and so can only be done
 * once it has loaded: fitting the lawn photograph to the site, and continuing
 * the ground past it.
 *
 * ---------------------------------------------------------------------------
 * 1. THE LAWN IS FITTED, NOT TILED
 *
 * Tiling a photograph of a real lawn cannot be made to look right. Every copy
 * carries the same blades, the same bare patch, the same bright corner, so the
 * eye finds the grid immediately -- and the levelling that removes the seams
 * makes each copy MORE identical, not less. The result was a chequerboard.
 *
 * One copy stretched over the whole site has no grid to find. It is softer,
 * and that is the trade: soft grass reads as grass, repeated grass reads as a
 * texture.
 *
 * ---------------------------------------------------------------------------
 * 2. THE GROUND BEYOND THE YARD
 *
 * The site is a 30x40 rectangle of contoured turf sitting on a block of soil.
 * That is the whole world -- outside it there is nothing, so from any camera
 * angle low enough to see past the fence, the yard reads as a slab of lawn
 * floating in mid air with sky underneath it. Adding a photographed horizon
 * made it worse, not better: the backdrop gave the eye a distant field to
 * compare against, and the gap in between became obvious.
 *
 * So the ground continues. A large plane, wearing the same lawn material,
 * running out past the backdrop cylinder.
 *
 * HEIGHT IS MEASURED, NOT ASSUMED. The lawn is contoured -- it falls away
 * from the building for drainage and carries +/-90mm of undulation -- so
 * there is no single number for "ground level" at the boundary, and the
 * figures in config/site.py are millimetres in Blender's frame rather than
 * metres in this one. Instead this raycasts straight down onto the real
 * loaded geometry at points around the perimeter and takes the LOWEST hit.
 *
 * Lowest, specifically, so the plane can never poke up through the turf and
 * slice the edge of the yard off. The cost is a step at the highest points of
 * the boundary: the turf there runs from -496mm at its lowest to -150mm where
 * a flat zone holds it at ground level, so up to 346mm of soil edge stays
 * visible. That is behind the boundary fence and 25m from anywhere a visitor
 * stands, and it is much the lesser of the two evils -- the alternative is a
 * plane cutting a hole through the lawn.
 */

import * as THREE from "three";

import { fitTextureToSpan } from "./textures/photoTextures";

/** How far out the ground runs. Comfortably past the backdrop at 260m. */
const EXTENT = 700;

/** Points sampled around the perimeter to find its lowest turf. */
const SAMPLES = 48;

/** Dropped this far below the lowest sample, to guarantee no z-fighting. */
const CLEARANCE = 0.02;

/**
 * Build the far ground and add it to the house group.
 *
 * A CHILD of the house group on purpose: that group carries the recentring
 * offset, so a plane parented to it lines up with the yard automatically. Add
 * it to the scene instead and it sits at raw Blender coordinates, metres out.
 *
 * @param {THREE.Group} house      from loadHouse
 * @param {Map} materials          the house material library
 * @returns {THREE.Mesh|null}      null when there is no yard to extend
 */
export function addFarGround(house, materials) {
  const yard = house?.userData?.parts?.yard_ground;
  const material = materials?.get("far_ground");
  if (!yard || !material) return null;

  // Raycasts read world matrices, which are otherwise only refreshed during
  // render -- so the first probe would use stale ones.
  house.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(yard);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const y = lowestPerimeterY(yard, box, centre, size);
  if (y === null) return null;

  const geometry = new THREE.PlaneGeometry(EXTENT, EXTENT, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "far_ground";
  mesh.receiveShadow = true;
  // It is scenery, not terrain: the tour must not be able to walk out onto
  // it, so it is deliberately NOT added to the controller's ground list.
  mesh.userData.isScenery = true;

  // World position, converted into the house group's local frame.
  const world = new THREE.Vector3(centre.x, y - CLEARANCE, centre.z);
  mesh.position.copy(house.worldToLocal(world));

  house.add(mesh);
  house.userData.parts.far_ground = mesh;
  return mesh;
}

/**
 * The lowest point of the turf around the edge of the yard.
 *
 * Probes from above, so the first thing each ray meets is the top surface --
 * which sorts out turf from the soil block underneath it without this having
 * to know the two are different objects.
 */
function lowestPerimeterY(yard, box, centre, size) {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const above = box.max.y + 10;

  // Just inside the boundary: exactly on it, a ray can slip past the edge
  // face and hit nothing.
  const halfX = size.x / 2 - 0.5;
  const halfZ = size.z / 2 - 0.5;

  let lowest = Infinity;

  for (let i = 0; i < SAMPLES; i += 1) {
    const t = (i / SAMPLES) * Math.PI * 2;
    // A rectangle, not a circle: the yard is 30x40 and a circular sample ring
    // would miss the corners entirely.
    const x = centre.x + halfX * clampUnit(Math.cos(t) * 1.6);
    const z = centre.z + halfZ * clampUnit(Math.sin(t) * 1.6);

    raycaster.set(new THREE.Vector3(x, above, z), down);
    const hit = raycaster.intersectObject(yard, true)[0];
    if (hit && hit.point.y < lowest) lowest = hit.point.y;
  }

  if (lowest === Infinity) {
    console.warn("[site] could not probe the yard edge; far ground skipped");
    return null;
  }
  return lowest;
}

const clampUnit = (v) => Math.max(-1, Math.min(1, v));

/**
 * Stretch one copy of the lawn photograph over the whole site.
 *
 * The UV frame is the Blender one. `uv_project_box` writes u = x and v = y in
 * metres, and glTF maps Blender (x, y, z) onto three (x, z, -y) -- so for a
 * point in the house group's local space, u is its x and v is MINUS its z.
 * Getting that sign wrong flips the lawn north-to-south, which is invisible
 * on a photograph of grass and would therefore never be noticed; it is
 * written out here rather than left to be re-derived.
 */
export function fitLawnToYard(house, materials) {
  const yard = house?.userData?.parts?.yard_ground;
  const map = materials?.get("lawn")?.map;
  if (!yard || !map) return null;

  house.updateMatrixWorld(true);

  // World bounds, less the group's offset, gives local. The house group is
  // only ever translated -- no rotation, no scale -- so this is a subtraction
  // rather than a full transform.
  const box = new THREE.Box3().setFromObject(yard);
  const min = box.min.clone().sub(house.position);
  const max = box.max.clone().sub(house.position);

  return fitTextureToSpan(map, {
    uMin: min.x,
    uMax: max.x,
    vMin: -max.z,
    vMax: -min.z,
  });
}
