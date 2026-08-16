/**
 * The coordinate round trip must be the identity.
 *
 *     database mm  ->  three.js metres  ->  database mm
 *
 * If it is not, the failure mode is silent and ugly: drag a sofa 100mm, save,
 * reload, and it has moved somewhere else. Every save would compound the
 * error. This is cheap to prove and expensive to debug, so it is proven.
 *
 *     node lib/scene/transforms.test.mjs
 */

import assert from "node:assert/strict";

import {
  mmToThree,
  threeToMm,
  degToThreeY,
  threeYToDeg,
  transformOf,
  applyTransform,
} from "./transforms.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

console.log("transforms");

check("mm -> three uses the glTF axis convention", () => {
  // A point 5m east, 3m north, 1m up in the plan.
  const [x, y, z] = mmToThree(5000, 3000, 1000);
  assert.equal(x, 5, "plan x is three x");
  assert.equal(y, 1, "plan z (up) is three y");
  assert.equal(z, -3, "plan y (north) is three -z");
});

check("the round trip is the identity", () => {
  const cases = [
    [0, 0, 0],
    [7900, 830, 0],
    [-1250.5, 11170, 2400],
    [12970, -230, 45.5],
  ];
  for (const [xMm, yMm, zMm] of cases) {
    const [x, y, z] = mmToThree(xMm, yMm, zMm);
    const back = threeToMm(x, y, z);
    assert.deepEqual(
      back,
      { x_mm: xMm, y_mm: yMm, z_mm: zMm },
      `round trip failed for ${xMm},${yMm},${zMm}`
    );
  }
});

check("rotation round-trips, and is normalised to 0..360", () => {
  for (const deg of [0, 45, 90, 180, 270, 359.5]) {
    assert.equal(threeYToDeg(degToThreeY(deg)), deg);
  }
  // A gizmo dragged in circles accumulates turns; the column is
  // numeric(6,2) and would overflow on the raw value.
  assert.equal(threeYToDeg(degToThreeY(725)), 5);
  assert.equal(threeYToDeg(degToThreeY(-90)), 270);
});

check("transformOf reads an Object3D the way the database stores it", () => {
  const object = fakeObject3D();
  applyTransform(object, {
    x_mm: 6300, y_mm: 2500, z_mm: 0, rotation_deg: 270, scale: 1.25,
  });

  assert.equal(object.position.x, 6.3);
  assert.equal(object.position.y, 0);
  assert.equal(object.position.z, -2.5);
  assert.equal(object.scale.x, 1.25);

  assert.deepEqual(transformOf(object), {
    x_mm: 6300, y_mm: 2500, z_mm: 0, rotation_deg: 270, scale: 1.25,
  });
});

check("a placement survives ten save/load cycles unchanged", () => {
  // The real risk is not one conversion but drift over many: an admin nudges
  // the same sofa repeatedly over a week.
  const object = fakeObject3D();
  let stored = { x_mm: 7700, y_mm: 2350, z_mm: 0, rotation_deg: 90, scale: 1 };
  for (let i = 0; i < 10; i += 1) {
    applyTransform(object, stored);
    stored = transformOf(object);
  }
  assert.deepEqual(stored, {
    x_mm: 7700, y_mm: 2350, z_mm: 0, rotation_deg: 90, scale: 1,
  });
});

console.log(`\n${checks} checks passed`);

/** Just enough of an Object3D to exercise the conversions without three.js. */
function fakeObject3D() {
  return {
    position: {
      x: 0, y: 0, z: 0,
      fromArray([x, y, z]) { this.x = x; this.y = y; this.z = z; return this; },
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: 1, y: 1, z: 1,
      setScalar(v) { this.x = v; this.y = v; this.z = v; return this; },
    },
  };
}
