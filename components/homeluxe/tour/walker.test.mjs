/**
 * Whose head is in the picture.
 *
 *     node components/homeluxe/tour/walker.test.mjs
 *
 * FIRST PERSON MEANS THE CAMERA IS INSIDE THE AVATAR'S HEAD. It sits five
 * centimetres ahead of the eyes so there is no nose in frame, but the rig
 * eases into position rather than snapping, so while turning or setting off
 * it trails its target and ends up BEHIND that eye point. If the figure is
 * drawn at that moment, the visitor gets a face filling the screen.
 *
 * Hiding the figure in first person removes the possibility outright, which
 * is better than tuning the lag until it usually misses -- and it was already
 * the rule. `VIEWS.first.showCharacter` is false and both `enter` and
 * `setView` applied it. What broke it was a fourth party: the page had a
 * `setWalkerVisible` that assigned `character.visible` directly, knowing
 * nothing about the current view. Pressing Auto Tour while already in eye
 * level called it with `true` and won.
 *
 * The rule is one function now. This drives every order those calls can
 * arrive in, because the bug was not in any one of them -- it was in the
 * combination, and a test of each separately would have passed.
 */

import assert from "node:assert/strict";

import * as THREE from "three";

import { createTourController, VIEWS } from "./TourController.js";
import { createWalkVolume } from "./collision.js";

const build = () => {
  const character = new THREE.Object3D();
  const tour = createTourController({
    character,
    // The full-screen canvas: 1.72 rather than the 1.21 of the old three-
    // column layout. The wider frame is why a lag that had always been there
    // started catching the head.
    camera: new THREE.PerspectiveCamera(55, 1.72, 0.1, 1000),
    // The real one, with nothing in it: this test is about who is drawn,
    // not about where anybody can stand.
    walkVolume: createWalkVolume({ fixed: [] }),
    groundObjects: [],
    obstacles: [],
    start: [0, 0],
    startHeading: 0,
  });

  return { tour, character };
};

// ---- the declared rule -----------------------------------------------------

assert.equal(VIEWS.first.showCharacter, false, "first person must not draw the avatar");
assert.equal(VIEWS.third.showCharacter, true, "third person must draw it");

// ---- every order the calls can arrive in -----------------------------------

const orders = [
  {
    what: "eye level, then the page asks for the walker back",
    run: ({ tour }) => {
      tour.enter();
      tour.setView("first");
      tour.setWalkerVisible(true);       // Auto Tour, pressed while in first
    },
  },
  {
    what: "the page asks first, then the visitor switches to eye level",
    run: ({ tour }) => {
      tour.enter();
      tour.setWalkerVisible(true);
      tour.setView("first");
    },
  },
  {
    what: "the opening film hides it, then eye level, then Auto Tour",
    run: ({ tour }) => {
      tour.enter();
      tour.setWalkerVisible(false);      // the cinematic
      tour.setView("first");
      tour.setWalkerVisible(true);       // take control
    },
  },
  {
    what: "toggled into eye level rather than set",
    run: ({ tour }) => {
      tour.enter();
      tour.setWalkerVisible(true);
      tour.toggleView();                 // third -> first
    },
  },
  {
    what: "a frame is drawn after all of it",
    run: ({ tour }) => {
      tour.enter();
      tour.setView("first");
      tour.setWalkerVisible(true);
      for (let i = 0; i < 30; i += 1) tour.update(1 / 60);
    },
  },
];

for (const order of orders) {
  const kit = build();

  order.run(kit);

  assert.equal(
    kit.character.visible,
    false,
    `${order.what}: the avatar is visible in first person -- that is the ` +
    "camera inside its head",
  );
  console.log(`  hidden: ${order.what}`);
}

// ---- and it must still come back in third person ---------------------------
//
// The opposite failure is just as bad and much easier to ship by accident: a
// rule that hides the figure everywhere leaves the visitor walking an empty
// house with no sense of where they are standing.

{
  const { tour, character } = build();

  tour.enter();
  tour.setView("first");
  tour.setWalkerVisible(true);
  assert.equal(character.visible, false, "still first person");

  tour.setView("third");
  assert.equal(character.visible, true, "third person must show the figure again");
  console.log("  shown:  back in third person");

  tour.setWalkerVisible(false);
  assert.equal(character.visible, false, "the opening film must still be able to hide it");

  tour.setWalkerVisible(true);
  assert.equal(character.visible, true, "and taking control must bring it back");
  console.log("  shown:  the film can hide it and control brings it back");
}

// ---- outside the tour it is nobody's avatar --------------------------------

{
  const { tour, character } = build();

  tour.setWalkerVisible(true);           // never entered
  assert.equal(character.visible, false, "no figure before the tour is entered");
  console.log("  hidden: before the tour starts");
}

console.log("walker: ok");
