/**
 * The motion maths, checked as maths.
 *
 *     node components/homeluxe/tour/easing.test.mjs
 *
 * None of this needs a browser and all of it is easy to get subtly wrong in
 * ways that look like "the animation feels a bit off" rather than like a bug.
 * The two properties worth proving are the two the old code did not have:
 *
 *   THE SAME CURVE AT EVERY FRAME RATE. A per-frame lerp is faster on a 144Hz
 *   screen than a 60Hz one and slower when the frame rate dips -- which is
 *   exactly when a camera should hold steady.
 *
 *   NO OVERSHOOT, EVER. A spring that overshoots is fine for a bouncing menu
 *   and wrong for a head: it means looking past the thing you turned to face
 *   and coming back, and at a doorway it means walking into the jamb.
 */

import assert from "node:assert/strict";

import {
  angleDelta,
  approach,
  createTween,
  damp,
  dampAngle,
  easeInOutCubic,
  easeOutCubic,
  frameRateSafe,
  smoothDamp,
  smoothDampAngle,
} from "./easing.js";

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tolerance ${tol})`);

// ---- the short way round ---------------------------------------------------

near(angleDelta(0, 0.5), 0.5, 1e-9, "a small turn is itself");
near(angleDelta(3.0, -3.0), 0.283185, 1e-5, "past pi goes the short way");
near(angleDelta(-3.0, 3.0), -0.283185, 1e-5, "and the same in reverse");
near(angleDelta(0, Math.PI * 4), 0, 1e-9, "whole turns are no turn at all");
console.log("  angleDelta: always the short way");

// ---- frame-rate independence ----------------------------------------------
//
// Run the same one second of settling at three refresh rates and require the
// answers to agree. A per-frame lerp fails this by a mile; that is the point.

for (const [lambda, label] of [[6, "slow"], [18, "medium"], [26, "snappy"]]) {
  const after = (fps) => {
    let v = 0;
    const dt = 1 / fps;

    for (let i = 0; i < fps; i += 1) v = damp(v, 1, lambda, dt);

    return v;
  };

  const at30 = after(30);
  const at60 = after(60);
  const at144 = after(144);

  near(at30, at60, 0.002, `${label}: 30Hz vs 60Hz`);
  near(at60, at144, 0.002, `${label}: 60Hz vs 144Hz`);

  // And it is the curve it claims to be: 1/lambda closes ~63.2% of the gap.
  let v = 0;
  const dt = 1 / 240;
  const steps = Math.round((1 / lambda) * 240);

  for (let i = 0; i < steps; i += 1) v = damp(v, 1, lambda, dt);
  near(v, 0.632, 0.01, `${label}: one time constant closes 63%`);
}
console.log("  damp: identical at 30, 60 and 144Hz, and the curve it claims");

// The old per-frame constant, converted, must reproduce the old feel at 60Hz.
near(frameRateSafe(0.35, 1 / 60), 0.35, 1e-9, "a converted factor is itself at its tuned rate");
assert.ok(frameRateSafe(0.35, 1 / 144) < 0.35, "smaller step, smaller factor");
assert.ok(frameRateSafe(0.35, 1 / 30) > 0.35, "larger step, larger factor");
console.log("  frameRateSafe: preserves the tuned feel, scales off it");

// ---- the spring ------------------------------------------------------------

{
  // It must arrive, and it must never go past.
  const velocity = { value: 0 };
  let v = 0;
  let maxSeen = 0;

  for (let i = 0; i < 240; i += 1) {
    v = smoothDamp(v, 1, velocity, 0.4, 1 / 60);
    maxSeen = Math.max(maxSeen, v);
  }

  near(v, 1, 1e-3, "the spring arrives");
  assert.ok(maxSeen <= 1 + 1e-9, `the spring overshot to ${maxSeen}`);
  console.log("  smoothDamp: arrives, never overshoots");
}

{
  // It must EASE IN. The first frame of a spring travels much less than the
  // first frame of a decay -- which is the whole reason it is here.
  const velocity = { value: 0 };
  const spring = smoothDamp(0, 1, velocity, 0.4, 1 / 60);
  const decay = damp(0, 1, 18, 1 / 60);

  assert.ok(
    spring < decay / 3,
    `the spring should start gently: ${spring.toFixed(4)} vs decay ${decay.toFixed(4)}`,
  );
  console.log(`  smoothDamp: eases in (${spring.toFixed(4)} vs decay ${decay.toFixed(4)})`);
}

{
  // Stable when a frame runs long. A naive spring explodes here.
  const velocity = { value: 0 };
  let v = 0;

  for (let i = 0; i < 20; i += 1) v = smoothDamp(v, 1, velocity, 0.3, 0.5);

  assert.ok(Number.isFinite(v) && v <= 1 + 1e-9, `a half-second frame broke it: ${v}`);
  console.log("  smoothDamp: stable at half-second steps");
}

{
  // Round the circle the short way, and settle facing the right direction.
  const velocity = { value: 0 };
  let heading = 3.0;

  for (let i = 0; i < 240; i += 1) {
    heading = smoothDampAngle(heading, -3.0, velocity, 0.35, 1 / 60);
  }

  near(angleDelta(heading, -3.0), 0, 1e-3, "the turn ends facing the target");
  assert.ok(heading > 3.0, `it should have gone forwards past pi, not back: ${heading}`);
  console.log("  smoothDampAngle: takes the short way and lands on the heading");
}

{
  // A max speed must actually cap it.
  const velocity = { value: 0 };
  let v = 0;
  let fastest = 0;

  for (let i = 0; i < 120; i += 1) {
    const before = v;

    v = smoothDamp(v, 10, velocity, 0.2, 1 / 60, 2);
    fastest = Math.max(fastest, (v - before) * 60);
  }

  assert.ok(fastest <= 2.35, `max speed 2 was exceeded: ${fastest.toFixed(2)}/s`);
  console.log(`  smoothDamp: honours maxSpeed (peak ${fastest.toFixed(2)}/s of 2)`);
}

// ---- ramps -----------------------------------------------------------------

near(approach(0, 1, 2, 0.1), 0.2, 1e-9, "a ramp moves at its rate");
near(approach(0.95, 1, 2, 0.1), 1, 1e-9, "and lands exactly rather than creeping");
near(approach(1, 0, 2, 0.1), 0.8, 1e-9, "downwards too");
console.log("  approach: linear, and lands exactly");

// ---- curves ----------------------------------------------------------------

for (const [name, fn] of [["easeInOutCubic", easeInOutCubic], ["easeOutCubic", easeOutCubic]]) {
  near(fn(0), 0, 1e-9, `${name} starts at 0`);
  near(fn(1), 1, 1e-9, `${name} ends at 1`);

  let previous = -1;

  for (let t = 0; t <= 1.0001; t += 0.01) {
    const v = fn(t);

    assert.ok(v >= previous - 1e-9, `${name} is not monotonic at ${t}`);
    previous = v;
  }
}
near(easeInOutCubic(0.5), 0.5, 1e-9, "easeInOutCubic is symmetric");
console.log("  curves: bounded, monotonic, symmetric where they should be");

// ---- the tween runner ------------------------------------------------------

{
  const seen = [];
  let finished = false;
  const tween = createTween({
    seconds: 0.5,
    ease: (t) => t,
    onUpdate: (v) => seen.push(v),
    onDone: () => { finished = true; },
  });

  // Driven by the caller's clock, and it must end exactly on 1.
  for (let i = 0; i < 40; i += 1) tween.step(1 / 60);

  assert.ok(finished, "the tween never finished");
  near(seen[seen.length - 1], 1, 1e-9, "it must land on exactly 1");
  assert.equal(tween.step(1 / 60), false, "a finished tween keeps saying so");

  // `finish` jumps to the end without waiting.
  let jumped = null;
  const second = createTween({ seconds: 10, onUpdate: (v) => { jumped = v; } });

  second.finish();
  near(jumped, 1, 1e-9, "finish lands on 1");
  console.log("  createTween: driven by the caller, lands exactly, can be cut short");
}

console.log("easing: ok");
