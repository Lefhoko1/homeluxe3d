/**
 * The ground beyond the yard.
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
  const lawn = materials?.get("lawn");
  if (!yard || !lawn) return null;

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
  // UVs in metres, matching the contract the rest of the pipeline uses: the
  // Blender exporter projects at 1 UV unit per metre, and the lawn material's
  // repeat is set from that. A plane's default 0..1 UVs would stretch one
  // copy of the photograph across 700 metres.
  setMetreUvs(geometry, EXTENT);

  const mesh = new THREE.Mesh(geometry, lawn);
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

/** Give a plane UVs measured in metres rather than 0..1 across its extent. */
function setMetreUvs(geometry, extent) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    uv.setXY(i, position.getX(i) + extent / 2, position.getZ(i) + extent / 2);
  }
  uv.needsUpdate = true;
}
