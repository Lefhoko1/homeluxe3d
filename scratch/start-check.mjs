// Does the tour always head for the house? Run: node scratch/start-check.mjs
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createTourController } from "../components/spacivelle/tour/TourController.js";
import { createWalkVolume } from "../components/spacivelle/tour/collision.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../public/models/${p}`, import.meta.url)));
const walls = read("house/collision.json").walls.map((w) => w.rect);
const route = read("tour/tour.json");
const doorZ = route.waypoints.find((w) => w.label === "Front door").position[1];

function run(name, start, seconds, check) {
  const volume = createWalkVolume({ fixed: walls });
  const tour = createTourController({
    character: new THREE.Object3D(), camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000),
    walkVolume: volume, groundObjects: [], obstacles: [], start, startHeading: 0,
  });
  const seen = [];
  tour.followRoute(route.waypoints, (s) => s.label && seen.push(s.label));
  const z0 = tour.position.z;
  let maxZ = z0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    tour.update(1 / 60);
    maxZ = Math.max(maxZ, tour.position.z);
  }
  const ok = check({ z0, maxZ, seen, end: tour.position });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: started z=${z0.toFixed(2)}, furthest from house z=${maxZ.toFixed(2)}, first stops: ${seen.slice(0, 3).join(", ")}`);
  if (!ok) process.exitCode = 1;
}

const gate = route.waypoints[0].position;
run("from the gate", gate, 20, ({ z0, maxZ, seen }) => maxZ <= z0 + 0.05 && seen[0] === "Front door");
run("from half-way up the drive", [gate[0], (gate[1] + doorZ) / 2], 20, ({ z0, maxZ, seen }) => maxZ <= z0 + 0.05 && seen[0] === "Front door");
const bed = route.waypoints.find((w) => w.label === "Master Bedroom").position;
run("from inside, in the master bedroom", bed, 60, ({ maxZ }) => maxZ < doorZ);

// After the whole tour, going round again must not take her back out to the street.
{
  const volume = createWalkVolume({ fixed: walls });
  const tour = createTourController({
    character: new THREE.Object3D(), camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000),
    walkVolume: volume, groundObjects: [], obstacles: [], start: gate, startHeading: 0,
  });
  let stops = 0, after = -Infinity, t = 0;
  tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; });
  for (; t < 1500 && stops < route.stops.length + 3; t += 1 / 60) {
    tour.update(1 / 60);
    if (stops >= route.stops.length) after = Math.max(after, tour.position.z);
  }
  const ok = stops >= route.stops.length + 3 && after < doorZ;
  console.log(`${ok ? "ok  " : "FAIL"} second lap: ${stops} stops in ${t.toFixed(0)}s, furthest towards the street after lap one z=${after.toFixed(2)} (front door z=${doorZ.toFixed(2)})`);
  if (!ok) process.exitCode = 1;
}
