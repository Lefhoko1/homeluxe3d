// How long does the visitor get a STILL picture of each product on the tour?
// Run: node scratch/view-time.mjs
//
// Drives the whole guided tour with the showcase on, as approach.test.mjs
// does, and for every product counts the seconds in which the camera was both
// pointed at it (within ~4.5 degrees, level) and not moving.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createTourController } from "../components/spacivelle/tour/TourController.js";
import { createWalkVolume } from "../components/spacivelle/tour/collision.js";
import { createShowcase } from "../components/spacivelle/tour/showcase.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../public/models/${p}`, import.meta.url)));
const collision = read("house/collision.json");
const lights = read("house/lights.json");
const catalog = read("products/catalog.json");
const route = read("tour/tour.json");
const products = new Map(catalog.shops.flatMap((s) => s.products.map((p) => [p.id, p])));

const group = new THREE.Group();
const rects = [];
catalog.houses["3bed"].filter((p) => !p.isFinish && p.position).forEach((placement) => {
  const size = products.get(placement.product)?.dimensions ?? { width: 500, depth: 500, height: 500 };
  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.width / 1000, size.height / 1000, size.depth / 1000));
  mesh.position.y = size.height / 2000;
  holder.add(mesh);
  holder.position.fromArray(placement.position);
  holder.rotation.y = THREE.MathUtils.degToRad(placement.rotationY ?? 0);
  holder.userData = { productId: placement.product, name: products.get(placement.product)?.name, room: placement.room };
  group.add(holder);
  if ((size.height ?? 0) < 150) return;
  const turned = Math.round(Math.abs(placement.rotationY ?? 0) / 90) % 2 === 1;
  const hw = (turned ? size.depth : size.width) / 2000, hd = (turned ? size.width : size.depth) / 2000;
  const [x, , z] = placement.position;
  rects.push([x - hw, z - hd, x + hw, z + hd]);
});
group.updateMatrixWorld(true);

const volume = createWalkVolume({ fixed: collision.walls.map((w) => w.rect) });
volume.setDynamic(rects);
const rooms = collision.rooms.map((e) => {
  const [x0, z0, x1, z1] = e.rect;
  return { room: e.room, label: e.label, type: e.type, x0, z0, x1, z1, centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2) };
});
const showcase = createShowcase({
  products: group, rooms, ceiling: collision.ceiling_m,
  fittings: lights.lights.map((l) => ({ room: l.room, point: new THREE.Vector3().fromArray(l.position) })),
});
const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000);
const tour = createTourController({
  character: new THREE.Object3D(), camera, walkVolume: volume,
  start: route.waypoints[0].position, startHeading: 0,
});

let current = null;
const still = new Map();       // caption -> seconds of still, on-target view
const total = new Map();       // caption -> seconds it was the thing shown
let stops = 0;
tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; }, { showcase, onShow: (t) => { current = t; } });

const STEP = 1 / 60;
const fwd = new THREE.Vector3();
let lastPos = camera.position.clone();
let lastYaw = 0;
let seconds = 0;
for (; seconds < 1500 && stops < route.stops.length; seconds += STEP) {
  tour.update(STEP);
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(fwd);
  const yaw = Math.atan2(fwd.x, -fwd.z);
  const speed = camera.position.distanceTo(lastPos) / STEP;
  const yawRate = Math.abs(Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw))) / STEP;
  lastPos.copy(camera.position);
  lastYaw = yaw;
  if (!current || current.kind !== "product" || !tour.showing) continue;
  const key = current.caption;
  total.set(key, (total.get(key) ?? 0) + STEP);
  const to = current.point.clone().sub(camera.position);
  const off = Math.abs(Math.atan2(Math.sin(Math.atan2(to.x, -to.z) - yaw), Math.cos(Math.atan2(to.x, -to.z) - yaw)));
  if (off < 0.08 && speed < 0.12 && yawRate < 0.05) still.set(key, (still.get(key) ?? 0) + STEP);
}
console.log(`tour: ${stops} stops in ${seconds.toFixed(0)}s`);
let sum = 0, n = 0, worst = Infinity;
for (const [key, t] of total) {
  const s = still.get(key) ?? 0;
  sum += s; n += 1; worst = Math.min(worst, s);
  console.log(`  ${s.toFixed(1).padStart(5)}s still of ${t.toFixed(1).padStart(5)}s shown  ${key}`);
}
console.log(`average still view per product: ${(sum / n).toFixed(1)}s, worst ${worst.toFixed(1)}s`);
