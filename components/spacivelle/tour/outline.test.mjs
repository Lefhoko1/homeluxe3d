// The glossy line round the piece being shown. What can be checked without a
// screen: the geometry it is pushed out from has no cracks, it follows the
// piece, it goes when the piece goes, and it never gets in the way of clicks
// or measurements. Run: node components/spacivelle/tour/outline.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFocusOutline, outlineGeometryFor } from "./outline.js";

// 1. A BOX -- the worst case: every face has its own normals, so a naive push
// opens a gap at all eight corners. Welded, its 24 vertices are 8, and each
// corner's normal points out diagonally, between its three faces.
{
  const box = new THREE.BoxGeometry(2, 0.8, 0.9);
  assert.equal(box.attributes.position.count, 24);
  const g = outlineGeometryFor(box);
  assert.equal(g.attributes.position.count, 8, "corners welded");
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    p.fromBufferAttribute(g.attributes.position, i);
    n.fromBufferAttribute(g.attributes.normal, i);
    // Outward on every axis -- that is what closes the corner -- and leaning
    // away from the centre. (Averaging weights the bigger faces more, so the
    // split is uneven; the sign is what matters.)
    for (const axis of ["x", "y", "z"]) {
      assert.ok(Math.sign(n[axis]) === Math.sign(p[axis]) && Math.abs(n[axis]) > 0.1, `corner ${i} normal points out along ${axis}`);
    }
    assert.ok(n.dot(p.clone().normalize()) > 0.5, `corner ${i} leans outward`);
  }
  assert.equal(outlineGeometryFor(box), g, "made once per geometry, then cached");
  console.log("  ok  a box's 24 split vertices weld to 8 corners, each pushed out diagonally -- no cracks");
}

// 2. Compressed models (quantised, normalised int16 -- like the uploads)
// are read as their real sizes.
{
  const q = new THREE.BufferGeometry();
  q.setAttribute("position", new THREE.BufferAttribute(new Int16Array([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true));
  const g = outlineGeometryFor(q);
  const xs = [0, 1, 2].map((i) => g.attributes.position.getX(i));
  assert.ok(Math.abs(Math.min(...xs) + 1) < 1e-4 && Math.abs(Math.max(...xs) - 1) < 1e-4, `read as -1..1, got ${xs}`);
  console.log("  ok  a compressed (quantised) model is read at its real size");
}

// 3. On a piece: follows it, stays out of the way, goes with it.
{
  const products = new THREE.Group();
  const sofa = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.9), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  seat.position.y = 0.4;
  sofa.add(seat);
  sofa.position.set(3, 0, -2);
  products.add(sofa);
  const scene = new THREE.Scene();
  scene.add(products);
  scene.updateMatrixWorld(true);

  const before = new THREE.Box3().setFromObject(sofa);
  const ray = new THREE.Raycaster(new THREE.Vector3(3, 0.4, 5), new THREE.Vector3(0, 0, -1));
  const hitsBefore = ray.intersectObject(sofa, true).length;

  const outline = createFocusOutline();
  outline.aim(sofa);
  outline.update(0.016);
  const helpers = [];
  sofa.traverse((o) => { if (o.userData.outlineHelper) helpers.push(o); });
  assert.equal(helpers.length, 2, "a mask and a line for the one mesh");
  assert.ok(helpers.every((h) => h.parent === seat), "children of the mesh, so they move with it");
  assert.ok(helpers.every((h) => !h.castShadow), "no shadows");
  assert.ok(helpers.find((h) => h.material.stencilFunc === THREE.NotEqualStencilFunc), "the line is cut by the mask");

  scene.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(sofa);
  assert.ok(after.equals(before), "the piece measures the same with its outline on");
  assert.equal(ray.intersectObject(sofa, true).length, hitsBefore, "clicks hit exactly what they did");
  console.log("  ok  outlined: moves with the piece, same size, same clicks, no shadow");

  outline.aim(sofa);
  sofa.traverse((o) => { if (o.userData.outlineHelper && !helpers.includes(o)) helpers.push(o); });
  assert.equal(helpers.length, 2, "aiming again at the same piece adds nothing");

  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshStandardMaterial());
  products.add(chair);
  outline.aim(chair);
  let left = 0;
  sofa.traverse((o) => { if (o.userData.outlineHelper) left += 1; });
  assert.equal(left, 0, "moving on to the next piece takes the line off the last");

  products.remove(chair);
  outline.update(0.016);
  assert.equal(outline.aimed, null, "a withdrawn piece takes its line with it");
  outline.aim(null);
  outline.dispose();
  console.log("  ok  moves on cleanly, and a withdrawn piece leaves nothing behind");
}

// 4. A light that travels round the piece, not a fixed ring: the head goes
// once round per lap, and the centre it goes round is the piece's middle on
// screen, following the camera.
{
  const scene = new THREE.Scene();
  const piece = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.9), new THREE.MeshStandardMaterial());
  piece.position.set(1.5, 0.4, -3);
  scene.add(piece);
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  camera.position.set(0, 1.5, 2);
  camera.lookAt(0, 0.5, -3);
  camera.updateMatrixWorld(true);

  const outline = createFocusOutline();
  outline.aim(piece);
  let ring;
  piece.traverse((o) => { if (o.userData.outlineHelper && o.material.uniforms) ring = o; });
  const u = ring.material.uniforms;
  u.resolution.value.set(1600, 1000);

  const heads = [];
  for (let t = 0; t < 3.2; t += 0.1) { outline.update(0.1, camera); heads.push(u.head.value); }
  const travelled = heads.slice(1).reduce((sum, h, i) => sum + ((h - heads[i] + Math.PI * 2) % (Math.PI * 2)), 0);
  assert.ok(Math.abs(travelled - Math.PI * 2) < 0.3, `about one lap in 3.2s, went ${(travelled / Math.PI / 2).toFixed(2)} laps`);
  assert.ok(u.arc.value > 1 && u.arc.value < Math.PI * 2 - 1, "only part of the outline is lit at once");
  assert.match(ring.material.fragmentShader, /discard/, "the unlit part of the outline is not drawn at all");

  const mid = new THREE.Box3().setFromObject(piece).getCenter(new THREE.Vector3()).project(camera);
  assert.ok(Math.abs(u.center.value.x - (mid.x * 0.5 + 0.5) * 1600) < 0.5, "centre follows the piece on screen (x)");
  assert.ok(Math.abs(u.center.value.y - (mid.y * 0.5 + 0.5) * 1000) < 0.5, "centre follows the piece on screen (y)");
  camera.position.set(3, 1.5, 0);
  camera.lookAt(1.5, 0.4, -3);
  camera.updateMatrixWorld(true);
  const was = u.center.value.clone();
  outline.update(0.016, camera);
  assert.ok(u.center.value.distanceTo(was) > 1, "and moves when the camera does");
  outline.dispose();
  console.log(`  ok  a light runs round the piece, a lap every ~3s, lighting ${Math.round(u.arc.value / Math.PI * 180)} degrees of it at a time, centred on the piece as the camera moves`);
}

// 5. A FLAT SURFACE -- a room's floor -- seen from standing height. Its line
// is pushed away from the point being looked at, not along its normal (which
// points at the camera and would open no ring), and the light goes round
// that point.
{
  const scene = new THREE.Scene();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4), new THREE.MeshStandardMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.name = "floors.living";
  scene.add(floor);
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100);
  camera.position.set(0, 1.6, 1.8);
  const look = new THREE.Vector3(0, 0.02, 0.1);
  camera.lookAt(look);
  camera.updateMatrixWorld(true);

  const outline = createFocusOutline();
  outline.aim(floor, { surface: true, center: look });
  let ring;
  floor.traverse((o) => { if (o.userData.outlineHelper && o.material.uniforms) ring = o; });
  ring.material.uniforms.resolution.value.set(1600, 1000);
  outline.update(0.016, camera);
  const u = ring.material.uniforms;
  assert.equal(u.radial.value, 1, "a surface is pushed away from the centre, not along its normal");
  assert.equal(ring.geometry, floor.geometry, "and needs no welded copy");
  const p = look.clone().project(camera);
  assert.ok(Math.abs(u.centerNdc.value.x - p.x) < 1e-6 && Math.abs(u.centerNdc.value.y - p.y) < 1e-6, "centred on the patch being looked at");

  // Same floor, aimed as furniture: the normal push, on the welded copy.
  outline.aim(floor);
  floor.traverse((o) => { if (o.userData.outlineHelper && o.material.uniforms) ring = o; });
  assert.equal(ring.material.uniforms.radial.value, 0, "furniture still pushes along its normals");
  outline.dispose();
  console.log("  ok  a floor or a wall's paint gets the light too: pushed out from the patch being looked at, which it runs round");
}

console.log("outline: ok");
