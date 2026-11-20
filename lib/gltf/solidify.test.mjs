// You should never see through a sofa, a head or a back -- but glass stays glass.
// Run: node lib/gltf/solidify.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { solidify, solidifyMaterial } from "./solidify.js";

/** A material the way GLTFLoader builds one from alphaMode BLEND. */
const blended = (name, opacity = 1) =>
  new THREE.MeshStandardMaterial({ name, transparent: true, depthWrite: false, opacity });

// Upholstery exported as BLEND: made solid, and both sides drawn.
{
  const m = blended("Fabric_Beige");
  assert.equal(solidifyMaterial(m, { doubleSided: true }), true);
  assert.equal(m.transparent, false);
  assert.equal(m.depthWrite, true);
  assert.equal(m.alphaTest, 0);
  assert.equal(m.side, THREE.DoubleSide);
  console.log("  ok  a sofa's fabric exported as see-through is made solid");
}

// Her skin, eyes and teeth solid; hair, brows and lashes cut-outs.
{
  const cutout = /hair|braid|cornrow|eyebrow|eyelash/i;
  const names = ["Human.body", "Human.high-poly", "Human.teeth_base", "Human.tongue01",
    "Human.elvs_braided_rows", "Human.eyebrow007", "Human.eyelashes01"];
  const result = Object.fromEntries(names.map((n) => {
    const m = blended(n);
    solidifyMaterial(m, { cutout });
    assert.equal(m.transparent, false, `${n} still transparent`);
    assert.equal(m.depthWrite, true, `${n} still writes no depth`);
    return [n, m.alphaTest];
  }));
  assert.deepEqual(Object.values(result), [0, 0, 0, 0, 0.5, 0.5, 0.5]);
  console.log("  ok  the figure: skin solid, hair/brows/lashes cut out");
}

// Real glass and water are left see-through, by name or by faintness.
{
  for (const [name, opacity] of [["glass", 0.22], ["pool_water", 0.62], ["Material.003", 0.4], ["TableGlass", 1]]) {
    const m = blended(name, opacity);
    solidifyMaterial(m, { doubleSided: true });
    assert.equal(m.transparent, true, `${name} should stay see-through`);
    assert.equal(m.depthWrite, false);
    assert.notEqual(m.side, THREE.DoubleSide, `${name}: see-through stays one-sided`);
  }
  console.log("  ok  glass, water and genuinely faint materials stay see-through");
}

// Shared materials (clones of one product) are fixed once.
{
  const shared = blended("Leather");
  const root = new THREE.Group();
  for (let i = 0; i < 3; i += 1) root.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
  const copy = root.clone(true);
  assert.equal(solidify(root, { doubleSided: true }), 1);
  copy.traverse((c) => c.isMesh && assert.equal(c.material.transparent, false));
  console.log("  ok  clones share the fix");
}

console.log("solidify: ok");
