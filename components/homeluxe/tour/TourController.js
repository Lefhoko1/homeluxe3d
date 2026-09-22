/**
 * Walk-through tour.
 *
 * Drives a character around the property in third person, so a visitor can
 * arrive at the gate, walk up the drive, go through the front door and stand
 * in front of the furniture at eye level. Orbiting a model tells you the
 * layout; walking it tells you the scale.
 *
 * Three problems have to be solved for that to feel right, and each is solved
 * by a raycast rather than by a physics engine:
 *
 *  1. GROUND FOLLOWING. The lawn is contoured, the slab stands 150mm proud,
 *     the porch is a step up. A ray fired straight down finds whatever is
 *     underfoot, so the character walks up the step without being told the
 *     step exists.
 *
 *  2. WALLS AND FURNITURE. Not a raycast -- a VOLUME. The character is a
 *     circle on the floor plan, and it is pushed out of the solid rectangles
 *     given by `collision.json`. A ray could be stepped over in one long
 *     frame, could thread a doorway the shoulder does not fit through, and
 *     could only ever refuse to move rather than slide; none of those are
 *     true of a circle. See tour/collision.js, which is where the walls now
 *     live.
 *
 *     Because walls were built as piers, sills and lintels rather than solid
 *     panels with holes cut in them, doorways are REAL GAPS -- so walking
 *     through a doorway still needs no door logic at all. At walking height
 *     there is simply no rectangle there.
 *
 *  3. FALLING. If a downward ray finds nothing (off the edge of the site),
 *     the character keeps its previous height instead of dropping forever.
 *
 * Door leaves are deliberately NOT collided with: every door is treated as
 * open. A tour that requires you to work out which doors open is a worse tour.
 *
 * AND THE TOUR STOPS TO SHOW YOU THINGS. Arriving in a room, the character
 * works through a list of what is advertised there -- each piece of furniture,
 * the floor, the walls, the ceiling light -- turning to face each one and
 * holding still while its advert is on screen. That list is read off the
 * scene, not written down here; see tour/showcase.js.
 *
 * THE HOUSE NEVER MOVES -- AND NOW IT DOES NOT LOOK AS IF IT DOES EITHER.
 * Nothing in here ever touched the scene, but the camera used to ride a 2.3m
 * boom behind the character's back, so every turn on the spot swept the
 * camera round a 2.3m circle and the whole room slid sideways across the
 * screen. To a viewer that is the building moving. So the camera is a
 * COMPANION now: it walks behind the character's shoulder while they walk,
 * and when they stop and turn to look at something it stays where it is and
 * turns its view -- which is what your own eyes do when you turn your head.
 *
 * AND THINGS ARE LOOKED AT FROM IN FRONT OF THEM. At a stop the character
 * walks up to each advertised piece and stands before it, rather than
 * standing in the middle of the room and having the camera swung at things
 * across it. See `viewingSpot`. A visitor who picks something from the list
 * gets the same thing: the character walks over (`visit`), the camera goes
 * with them, and nothing flies.
 */

import * as THREE from "three";

import {
  approach,
  damp,
  smoothDamp,
  smoothDampAngle,
  smoothstep,
} from "./easing.js";
import { createGait, rigCharacter } from "./gait.js";

/** Metres per second. A relaxed walking pace, not a sprint. */
export const WALK_SPEED = 2.4;

/** Radians per second when turning on the spot. */
export const TURN_SPEED = 2.2;

/**
 * The GUIDED tour moves slower than a person driving themselves.
 *
 * 2.4 m/s is a brisk walk -- right when you are steering, because you already
 * know where you are going. Being driven at it is useless: the whole house
 * goes by in about a minute and you cannot take in a single room. An estate
 * agent walks a client through at closer to 1 m/s and stops talking in each
 * room, which is what these two numbers are for.
 */
export const GUIDED_WALK_SPEED = 1.05;
export const GUIDED_TURN_SPEED = 1.1;

/**
 * How far ahead to check for the things that are NOT in the collision
 * manifest: the yard's fences, hedges and tree trunks.
 *
 * The building is a volume test now, so this no longer has anything to do
 * with walls or with the route's clearance. It is only ever used while the
 * visitor is steering themselves around the garden.
 */
const COLLIDE_DISTANCE = 0.42;

/**
 * How far the character sweeps its heading while paused at a stop.
 *
 * THE RATE IS WHAT MATTERS, and it is this divided by the dwell. The sweep is
 * a full cycle -- centre, right, centre, left, centre -- so the head travels
 * four times this arc in one pause:
 *
 *     4 x 0.55 rad over 10s  =  0.22 rad/s, about 13 degrees a second
 *
 * Two earlier attempts were too fast to watch: 4 x 1.05 over 6s gave 40
 * degrees a second, and 4 x 0.80 over 9s gave 20. Someone scanning a room
 * they have just walked into turns their head slowly; anything quicker reads
 * as the camera being swung rather than a person looking.
 *
 * If this changes, change DWELL in export/tour_json.py with it -- the two
 * only mean something together.
 */
const SURVEY_ARC = 0.55;   // radians, about 32 degrees either side

/**
 * How fast the character turns to face something it is being shown.
 *
 * Slower than steering and faster than the fallback sweep. The showcase sorts
 * a room's items nearest-first, so most turns are small; this only has to
 * cover the occasional half-turn inside the seconds allotted to one item, and
 * 1.6 rad/s crosses a full half-turn in about two.
 */
const SHOWCASE_TURN_SPEED = 1.6;

/**
 * How long the camera's aim takes to settle on where it is being pointed, in
 * seconds -- springs, not per-frame lerps, so they start and stop gently.
 *
 * Two, because they are two different jobs. Walking, the aim is fixed ahead
 * of a moving character and has to keep up or the view lags behind the walk.
 * Being shown something, the value is in the slowness: the eyes drift onto
 * the sofa rather than snapping to it.
 */
const AIM_SMOOTH_WALK = 0.3;
const AIM_SMOOTH_LOOK = 0.75;

/**
 * THE COMPANION CAMERA. Where it stands follows the character's heading on a
 * spring -- quickly while walking, so it stays behind them; slowly while
 * standing, so a turn to look at something does not drag it round in an arc.
 * Within CAM_HOLD_ANGLE of the character's back it does not follow a
 * standing character at all: it stays put and turns its view, the way your
 * own eyes stay where they are when you turn your head.
 */
const CAM_FOLLOW_WALK = 0.38;
const CAM_FOLLOW_STAND = 1.8;
const CAM_HOLD_ANGLE = 1.1;
/**
 * Standing and looking at something, the camera does follow the body round
 * -- the body squares up to what it is shown, and the companion steps round
 * with it to stand at its shoulder -- but slowly enough to read as someone
 * repositioning, not as the view being swung.
 */
const CAM_FOLLOW_LOOK = 1.2;
/** Seconds to step between walking behind and standing beside. */
const CAM_POSE_SMOOTH = 0.9;
/** Seconds for the camera's position to settle behind the character. */
const CAM_POSITION_SMOOTH = 0.22;
/**
 * How far the view may tilt, up and down, in radians. A ceiling light is
 * glanced up at; nobody lies on the floor to look at one.
 */
const PITCH_UP = 0.32;
// Down further than up: a WC or a coffee table a metre away is looked DOWN
// at, and at 0.5 the view stopped short of it and showed the wall behind.
const PITCH_DOWN = 0.72;

/**
 * Closer than this to the head, the figure is not drawn -- and it comes back
 * past the second number, so it does not flicker on the edge. A wall pushes
 * the camera in behind the character in a small room, and the back of a head
 * filling the screen shows the visitor nothing; games fade the figure out
 * for the same reason.
 */
const HIDE_WITHIN = 0.62;
const SHOW_BEYOND = 0.78;

/**
 * THROUGH THE EYES WHEN THE ROOM IS TOO SMALL. If the walls leave less than
 * this between the head and where the camera wants to stand, the camera goes
 * to the eyes instead of sitting against the wall behind the head -- a 2m
 * ensuite has no room for anyone to stand behind you, and that is how you
 * would see it. It comes back out past the second number.
 */
const EYES_WITHIN = 0.75;
const EYES_BEYOND = 1.0;

/** Eye height of the 1.55m figure, metres above its feet. */
const EYE_HEIGHT = 1.42;

/**
 * WALKING UP TO THINGS. How close counts as "near enough to see it" -- from
 * nearer than this the character looks from where it is -- and how far in
 * front of a piece it stands to look at it, tried nearest-natural first.
 * 1.2m in front of a sofa is where a person stands to take it in; the others
 * are for a piece hemmed in by the room.
 */
const CLOSE_ENOUGH = 1.7;
const SPOT_GAPS = [1.2, 1.55, 0.95, 1.9];
/** Straight in front first, then a little either side, then the sides. */
const SPOT_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, Math.PI / 2, -Math.PI / 2];
/** Flat things -- a rug -- are seen from wherever you stand. */
const LOW_ITEM = 0.15;
/** Seconds a walk to one spot may make no progress before it is given up. */
const TASK_STALL = 3.0;

/**
 * THE BODY TURNS ONLY FOR WHAT THE HEAD CANNOT REACH. Something within half
 * a radian of straight ahead is looked at by the head alone; further round,
 * the body turns to face it, and once turning keeps going until it is square
 * -- starting and stopping on the same threshold would twitch.
 */
const BODY_TURN_START = 0.5;
const BODY_TURN_DONE = 0.08;

/**
 * ROUNDING CORNERS INSTEAD OF STOPPING AT THEM. Speed falls away as the
 * heading error grows, and only past TURN_IN_PLACE does the walker stop and
 * turn on the spot -- a person slows into a corner and walks round it; they
 * do not halt, pivot and set off again at every change of direction. Near a
 * waypoint where the route bends, it slows in anticipation, by more for a
 * sharper bend.
 */
const TURN_IN_PLACE = 0.85;
const CORNER_DISTANCE = 0.9;
/** Distance over which the walk eases to a halt at a stop or a spot. */
const SETTLE_DISTANCE = 0.9;

/** Walking to something the visitor asked to see: a touch brisker. */
const VISIT_PACE = 1.2;

/**
 * Heights at which the forward ray is fired.
 *
 * One ray at chest height walks straight through a coffee table and a sofa
 * seat, because there is nothing at chest height to hit. Three heights --
 * shin, waist, chest -- catch low furniture, seat backs and walls alike.
 */
const PROBE_HEIGHTS = [0.25, 0.75, 1.35];

/** How far above the character to start the downward ground ray. */
const PROBE_HEIGHT = 4.0;

/**
 * Biggest height change allowed in one step, up or down.
 *
 * This is what stops the character strolling off the pool terrace and
 * standing on the bottom of the pool, or climbing a wall it happened not to
 * hit. A porch step is ~150mm and the slab edge is ~150mm, so 450mm clears
 * everything intended while blocking a 1.9m drop.
 */
const MAX_STEP = 0.45;

/**
 * How close counts as arriving at a waypoint.
 *
 * This is a tighter number than it first appears it should be, and the reason
 * is doorways. Accept 450mm and the character turns for the next waypoint
 * from up to 450mm off the route -- which in a 1m front door is outside the
 * gap, so the new straight line runs into the jamb and it grinds there.
 * Solved routes are kept 300mm clear of walls, so arriving has to be tighter
 * than that or the clearance buys nothing.
 */
export const ARRIVE_RADIUS = 0.22;

/**
 * How long the walk may make no progress before it gives up on a waypoint.
 *
 * THIS IS A BUSINESS REQUIREMENT, not a nicety. The house is an advertising
 * space whose stock rotates from a database with nobody watching: batches go
 * live overnight, a shop uploads a wardrobe and drops it somewhere awkward,
 * a promotion ends and a sofa vanishes. `settleRoute` moves waypoints out of
 * whatever has appeared on top of them, and handles the ordinary case -- but
 * it cannot promise there is still a way THROUGH. Something can be placed
 * across a doorway.
 *
 * Without a guard the tour then stands still for as long as the page is open,
 * which on a showroom site is indistinguishable from the site being broken.
 * With one, the worst case is a tour that takes a slightly odd line through
 * one room. Degraded beats dead.
 *
 * Four seconds is longer than any legitimate manoeuvre: the walk turns before
 * it moves, so a full half-turn on the spot at the guided rate is under three.
 */
const STALL_SECONDS = 4.0;

/** Progress smaller than this, over that time, is not progress. */
const STALL_PROGRESS = 0.05;

/**
 * THE CAMERA RIG, AND WHY THE OLD ONE COULD NOT WORK INDOORS
 *
 * It sat 4.2m behind the character and 2.4m up, looking AT the character's
 * chest. Every one of those three numbers fights a house:
 *
 *  - 4.2m BACK is deeper than most rooms in this plan. Bedroom 2 is 2.97m
 *    deep. So the camera was always outside the room, always dragged back in
 *    by the wall test, and always ended up at its 0.9m minimum -- which is
 *    close enough that a 1.7m character fills the frame.
 *
 *  - 2.4m UP is exactly the ceiling height. The camera sat in the ceiling
 *    plane, and the ceiling was not in the list of things it must not pass
 *    through, so it went above it.
 *
 *  - LOOKING AT THE CHARACTER puts the back of their head in the middle of
 *    the screen and the room in the periphery. For a walk-through of a house
 *    that is exactly backwards: the room is the subject, the character is
 *    there for scale.
 *
 * So the camera now sits close and low, and looks AHEAD of the character
 * rather than at them -- the room the visitor is walking into fills the
 * frame, and the character reads as a figure in the lower third.
 *
 * FIRST PERSON is the same rig with the offsets collapsed and the character
 * hidden. In a 2m bathroom no third-person camera can work at all, and being
 * able to just look is the whole point.
 */
export const VIEWS = {
  third: {
    // OVER THE SHOULDER, not down a boom. 1.75m back and a third of a metre
    // to the right: the figure sits in the lower left of the frame and the
    // room fills the rest, and a turn on the spot moves the camera round a
    // circle a quarter smaller than the old 2.3m one -- which it only
    // follows once the character walks off. See CAM_HOLD_ANGLE.
    back: 1.75,
    side: 0.34,
    up: 1.62,           // just above the head, well under the 2.4m ceiling
    // STANDING AND LOOKING AT SOMETHING, the camera steps up BESIDE them.
    // From 1.75m behind, the line to a sofa 1.2m in front of the character
    // runs straight through their back -- you see a person looking at a
    // sofa, not the sofa. A companion standing at their shoulder sees what
    // they see, with the figure at the edge of the frame for scale.
    // 1.35m back and 0.95m aside is about 1.65m from the figure: far enough
    // that it sits at the edge of the frame rather than filling half of it,
    // and wide enough that the line to the piece clears its shoulder.
    lookBack: 1.35,
    lookSide: 0.95,
    lookUp: 1.6,
    lookAhead: 3.4,     // the room, not the character
    lookHeight: 1.35,
    // THE SAME LENS AS OUTSIDE THE TOUR, so stepping into it does not warp
    // the house. This was 68, which is 100 degrees across a 16:9 frame -- an
    // ultra-wide, and ultra-wides bend straight lines. A house is nothing
    // BUT straight lines, so every wall leaned as the camera turned and the
    // building looked like it was flexing. 55 is 86 degrees across, still
    // wide enough to see both sides of the smallest room in the plan.
    fov: 55,
    showCharacter: true,
  },
  first: {
    back: -0.05,        // a hair in front of the eyes, so no nose geometry
    side: 0,
    up: 1.45,
    lookAhead: 4.0,
    lookHeight: 1.45,
    // A little wider than third person, because your eyes are at the wall
    // rather than 2.3m back from it -- but nowhere near the old 74, which
    // was 107 degrees across and bowed the corners of every room.
    fov: 62,
    showCharacter: false,
  },
};

/** Closest the camera may sit to the character when pushed in by a wall. */
const CAMERA_MIN = 0.45;

/**
 * How long a turn takes to complete, roughly, in seconds.
 *
 * The turn is a critically damped spring now rather than a constant angular
 * velocity -- see easing.js. Constant velocity means a head that snaps to
 * full speed, holds it, and stops dead on the heading, which is how a turret
 * turns and not how a person does. The spring accelerates in and decelerates
 * out, and the max speeds below are ceilings for the middle of the move
 * rather than the speed of the whole of it.
 */
const TURN_SMOOTH_GUIDED = 0.30;
const TURN_SMOOTH_SHOWCASE = 0.34;
const TURN_SMOOTH_MANUAL = 0.16;   // a key press should feel connected

/**
 * How quickly `pace` (0..1 of walking speed) may change, per second.
 * Asymmetric on purpose -- see `pace`. A person takes about half a second to
 * reach a stroll and a little less to stop; the old 3.2 and 9.0 went from a
 * standstill to walking in a third of a second and stopped in a tenth, which
 * is a lurch and a halt rather than a step off and a slowing down.
 */
const ACCELERATE = 1.9;
const BRAKE = 3.4;

/** Seconds to change lens when the view is switched. */
const FOV_SECONDS = 0.42;

/**
 * @param {object} options
 * @param {THREE.Object3D} options.character  the avatar, feet at its origin
 * @param {THREE.Camera}   options.camera
 * @param {object}         options.controls   OrbitControls, disabled while walking
 * @param {THREE.Object3D[]} options.groundObjects  what to stand on
 * @param {THREE.Object3D[]} options.wallObjects    what to bump into
 * @param {number[]}       options.start      [x, z] start position, metres
 * @param {number}         options.startHeading  radians; 0 faces -Z
 */
export function createTourController(options = {}) {
  const {
    character,
    camera,
    controls,
    groundObjects = [],
    /**
     * THE BUILDING AND ITS CONTENTS, as a volume. Walls from the collision
     * manifest, furniture from its own bounding boxes; see tour/collision.js.
     * This is what stops the character walking through a wall, and it applies
     * whether the visitor is steering or being driven.
     */
    walkVolume = null,
    /**
     * The yard: fences, hedges, tree trunks, the porch. Geometry the plan
     * knows nothing about, so it cannot be in the manifest -- these stay a
     * raycast. Only tested while the visitor is steering, since the guided
     * route never leaves the paved approach.
     */
    obstacles = [],
    // What the CAMERA may not pass through. Structure and ceiling -- if the
    // camera dodged every sofa it would jitter constantly in a furnished room.
    cameraObstacles = [],
    start = [0, 0],
    startHeading = 0,
  } = options;

  const position = new THREE.Vector3(start[0], 0, start[1]);
  let heading = startHeading;
  let active = false;
  let lastGroundY = 0;

  let view = VIEWS.third;

  /**
   * Whether the PAGE wants the figure shown, as distinct from whether the
   * VIEW can show one.
   *
   * The opening film hides it -- a third-person character standing in shot
   * turns "here is a house" into "here is a video game about a house" -- and
   * taking the controls brings it back, because then it is you and you need
   * to see where you are standing. That is a legitimate preference and it is
   * what this records.
   *
   * It is only ever half the answer. First person has no figure to show: the
   * camera is inside the head. See `showWalker`.
   */
  let wantCharacter = true;

  /**
   * The state a spring needs and a curve does not: how fast we are already
   * going. Carried between frames so a turn that is interrupted by another
   * turn continues from the speed it had rather than starting again.
   */
  const turnVelocity = { value: 0 };

  /**
   * How fast the character is actually walking, 0..1 of the view's speed.
   *
   * The old code set `drive` to 0 or 1 and multiplied, so the walk went from
   * a standstill to 2.4 m/s between two frames and back again -- which on a
   * guided tour happens at every corner, because the route turns before it
   * walks. Ramping it is most of what makes the tour watchable.
   *
   * ASYMMETRIC: braking is nearly three times as quick as accelerating. That
   * is true of walking, and it matters here for a specific reason -- the
   * guided route stops driving when it needs to turn, and anything still
   * rolling at that moment arcs into the door jamb it was lining up on.
   */
  let pace = 0;

  /** Which way the last press was going, so a coast keeps its direction. */
  let lastDrive = 1;

  /**
   * The single rule for whether the avatar is drawn.
   *
   * IT USED TO BE WRITTEN IN THREE PLACES AND SET FROM A FOURTH. `enter` and
   * `setView` both applied `view.showCharacter`, correctly; the page also had
   * a `setWalkerVisible` that assigned `character.visible` directly, which
   * knew nothing about the view. Press Auto Tour while already in eye level
   * and that last one won: the figure came back with the camera inside its
   * skull, and the visitor got a face filling the screen.
   *
   * The camera makes it worse rather than causing it. First person sits five
   * centimetres AHEAD of the eyes so there is no nose in frame, but the rig
   * eases into position on a spring -- so while turning or setting off it
   * trails its target and ends up behind the eye point. Widening the canvas
   * to full screen widened the horizontal field from about 34 degrees either
   * side to 46, which is why a lag that had always been there started
   * catching the head. Hiding the figure removes the possibility entirely,
   * which is better than tuning the lag until it usually misses.
   */
  const showWalker = () => {
    character.visible = active && wantCharacter && view.showCharacter && !crowded;
  };
  /** The camera has been pushed in against the head. See HIDE_WITHIN. */
  let crowded = false;
  /** No room behind the character; seeing through its eyes. See EYES_WITHIN. */
  let throughEyes = false;
  let viewName = "third";

  // -- Guided route -------------------------------------------------------
  // A solved path through the house, from tour.json. `null` means the
  // visitor is driving.
  let route = null;
  let routeIndex = 0;

  /**
   * Held, but not forgotten.
   *
   * A PAUSE IS NOT A STOP, and the difference is the whole reason this flag
   * exists rather than reusing `stopRoute`. Stopping throws the route away:
   * `route`, `routeIndex`, the dwell timer and the showcase all go, and the
   * only way back is to start again from the driveway. Somebody who broke off
   * the tour to look at a sofa wants to carry on from the sofa's room, not
   * from the front door.
   *
   * So everything is kept exactly as it was and the walk simply stops being
   * stepped. The camera goes back to OrbitControls while this is true, which
   * is what lets the caller fly it somewhere else.
   */
  let routeHeld = false;
  let dwellLeft = 0;
  let dwellTotal = 0;
  let surveyFrom = 0;
  let onArrive = null;

  // -- The showcase -------------------------------------------------------
  // What is being advertised in the room the tour has just walked into, and
  // which of those things the character is looking at right now. Empty
  // whenever the tour is between rooms. See tour/showcase.js.
  let showcase = null;
  let onShow = null;
  let showTargets = [];
  let showIndex = 0;
  let showLeft = 0;

  // -- The stall guard ----------------------------------------------------
  // How long the walk has been failing to get closer to the waypoint it is
  // heading for, and the closest it has managed. See STALL_SECONDS.
  let stallFor = 0;
  let closestSoFar = Infinity;
  let skipped = 0;

  // -- At a stop ------------------------------------------------------------
  // What the stop is doing: being shown the room ('show'), looking round an
  // empty one ('survey'), or walking back to where it arrived ('return').
  // Null between stops. Held separately from the distance to the waypoint,
  // because walking up to a sofa takes the character AWAY from the waypoint
  // it arrived at -- and the walk must not mistake that for not having got
  // there yet.
  let stopState = null;
  /** Where the stop was reached, so the walk comes back to its route. */
  const stopAt = new THREE.Vector3();
  /** The spots walked through at this stop, to retrace them on the way back. */
  let trail = [];

  // -- Walking to a place ---------------------------------------------------
  // A short list of points to walk through, and what to do on arrival. Used
  // for walking up to a piece at a stop, back to the route afterwards, and to
  // whatever the visitor asked to see. `owner` says whose it is: a stop's
  // walk is frozen by a pause like the rest of the route; a visit is what
  // the pause was FOR, so it carries on.
  let task = null;
  /** What to keep looking at once there, until the visitor moves on. */
  let focus = null;
  /** Where a visit set off from, to go back to when the tour resumes. */
  let visitFrom = null;
  /**
   * The paths through the house, for getting somewhere not in a straight
   * line -- another room. The solved route visits every room, so walking
   * along it always gets there. See `planPath`.
   */
  let network = null;

  // -- The companion camera ---------------------------------------------------
  let camYaw = startHeading;
  const camYawVelocity = { value: 0 };
  const camVelocity = { x: { value: 0 }, y: { value: 0 }, z: { value: 0 } };
  const aimVelocity = { x: { value: 0 }, y: { value: 0 }, z: { value: 0 } };
  /** What the eyes are on this frame; null means straight ahead. */
  let looking = null;
  /** 0 walking behind, 1 standing beside -- blended, never cut. */
  const pose = { value: 0, velocity: { value: 0 } };
  /** Which shoulder the companion stands at: +1 right, -1 left. */
  let poseSide = 1;
  const lookPoint = new THREE.Vector3();
  const surveyPoint = new THREE.Vector3();
  let bodyTurning = false;

  // -- The body -------------------------------------------------------------
  // A walk driven by the walk. A bare Object3D (the tests) rigs to nothing
  // and the gait does nothing. See gait.js.
  const gait = createGait(rigCharacter(character));

  /** Shortest signed angle from a to b. */
  const angleTo = (from, to) => {
    let diff = (to - from) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  };

  const groundRay = new THREE.Raycaster();
  groundRay.far = PROBE_HEIGHT * 2;

  const wallRay = new THREE.Raycaster();
  wallRay.far = COLLIDE_DISTANCE;

  const camRay = new THREE.Raycaster();

  const DOWN = new THREE.Vector3(0, -1, 0);
  const probe = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  // Where the camera is pointed, and where it is being pointed. Two vectors
  // rather than one so the aim can EASE onto a target instead of snapping to
  // it, which is the difference between a person looking at a sofa and a
  // camera being swung at one.
  const aim = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const head = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();

  // Held input. Keyboard and on-screen buttons write into the same object so
  // they behave identically -- including both at once.
  const input = { forward: 0, turn: 0 };
  const keys = new Set();

  const MOVE_KEYS = {
    ArrowUp: ["forward", 1], KeyW: ["forward", 1],
    ArrowDown: ["forward", -1], KeyS: ["forward", -1],
    ArrowLeft: ["turn", 1], KeyA: ["turn", 1],
    ArrowRight: ["turn", -1], KeyD: ["turn", -1],
  };

  function readKeys() {
    let f = 0;
    let t = 0;
    keys.forEach((code) => {
      const mapped = MOVE_KEYS[code];
      if (!mapped) return;
      if (mapped[0] === "forward") f += mapped[1];
      else t += mapped[1];
    });
    return { f, t };
  }

  function onKeyDown(event) {
    if (!active || !MOVE_KEYS[event.code]) return;
    keys.add(event.code);
    // Stop arrow keys scrolling the page out from under the canvas.
    event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  /**
   * A wider lens while walking.
   *
   * 55 degrees is right for orbiting a building from outside. Inside a 3m
   * bedroom it turns the room into a corridor -- you see a wall and no idea
   * what is either side of you. Restored on exit so the outside view is
   * unaffected.
   */
  let savedFov = null;

  /**
   * The lens the view wants, arrived at over FOV_SECONDS rather than cut to.
   *
   * Switching between third and first person is a change of 7 degrees, and
   * snapping it is a visible pop in the middle of a walk -- the whole room
   * jumps a step nearer. Eased, it reads as leaning in. `fovTarget` is what
   * the view asked for; the update loop damps towards it.
   */
  let fovTarget = null;

  function applyFov() {
    if (!camera?.isPerspectiveCamera) return;
    if (savedFov === null) savedFov = camera.fov;
    fovTarget = view.fov;
    // Entering the tour from the overview is a cut, not a lean: there is
    // nothing on screen yet to be continuous with.
    if (!active) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Called once per frame; a no-op once the lens has arrived. */
  function stepFov(dt) {
    if (fovTarget === null || !camera?.isPerspectiveCamera) return;
    if (Math.abs(camera.fov - fovTarget) < 0.01) {
      if (camera.fov !== fovTarget) {
        camera.fov = fovTarget;
        camera.updateProjectionMatrix();
      }

      return;
    }

    // 1/FOV_SECONDS as a rate gives the same settle time at any frame rate.
    camera.fov = damp(camera.fov, fovTarget, 1 / (FOV_SECONDS / 3), dt);
    camera.updateProjectionMatrix();
  }

  function restoreFov() {
    fovTarget = null;
    if (savedFov === null || !camera?.isPerspectiveCamera) return;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
    savedFov = null;
  }

  /** Height of whatever is directly under (x, z). */
  function groundAt(x, z) {
    probe.set(x, lastGroundY + PROBE_HEIGHT, z);
    groundRay.set(probe, DOWN);
    const hits = groundRay.intersectObjects(groundObjects, true);
    return hits.length ? hits[0].point.y : null;
  }

  /**
   * True if something solid is within reach in this direction.
   *
   * Fires at three heights, because a single chest-height ray walks straight
   * through a coffee table.
   */
  function blocked(origin, direction) {
    // THE WALLS AND THE FURNITURE ARE NOT TESTED HERE. They are a volume now,
    // resolved by `walkVolume` in `update` -- a circle pushed out of solid
    // rectangles, which cannot be stepped over in a long frame and cannot
    // stick. See tour/collision.js for why a ray could never do that job.
    //
    // What is left is the yard: fences, hedges, tree trunks. That geometry is
    // not in the plan, so it cannot be in the manifest, and it is only ever
    // in the way when the visitor is steering -- the guided route walks up
    // the drive and goes indoors.
    if (route || task || !obstacles.length) return false;

    for (let i = 0; i < PROBE_HEIGHTS.length; i += 1) {
      probe.set(origin.x, lastGroundY + PROBE_HEIGHTS[i], origin.z);
      wallRay.set(probe, direction);
      if (wallRay.intersectObjects(obstacles, true).length > 0) return true;
    }
    return false;
  }

  /**
   * Look at a point: with the head if it is near ahead, with the body too if
   * it is further round.
   *
   * The eyes go to the thing itself rather than to eye level -- which is what
   * lets a glance go down to a floor tile or up to a ceiling light. The head
   * turns first (see gait.js); the body follows only when the head cannot
   * reach, and then squares up to it. Turning to look at a product is the
   * most watched motion in the application, so it has the longest smoothing.
   */
  function faceTowards(point, step) {
    looking = point;
    const dx = point.x - position.x;
    const dz = point.z - position.z;
    if (dx * dx + dz * dz < 1e-4) return;

    const wanted = Math.atan2(dx, -dz);
    const off = Math.abs(angleTo(heading, wanted));
    if (off > BODY_TURN_START) bodyTurning = true;
    if (bodyTurning && off < BODY_TURN_DONE) bodyTurning = false;

    if (bodyTurning) {
      heading = smoothDampAngle(
        heading, wanted, turnVelocity,
        TURN_SMOOTH_SHOWCASE, step, SHOWCASE_TURN_SPEED * 1.5
      );
    } else {
      // Let a turn that has just finished run down rather than stop dead.
      turnVelocity.value = damp(turnVelocity.value, 0, 8, step);
      heading += turnVelocity.value * step;
    }
  }

  /**
   * Can the walker get from `from` to (x, z) in a straight line?
   *
   * Asked of the same volume the walk is resolved against, every 150mm, so a
   * "yes" means the circle the character occupies fits the whole way -- past
   * the sofa, through the doorway, clear of the wall. A closed swing door is
   * in the volume and answers "no", which is right: go round by the route.
   */
  function lineClear(from, x, z) {
    if (!walkVolume) return true;
    const length = Math.hypot(x - from.x, z - from.z);
    const steps = Math.max(1, Math.ceil(length / 0.15));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (walkVolume.resolve(from.x + (x - from.x) * t, from.z + (z - from.z) * t).hit) {
        return false;
      }
    }
    return true;
  }

  /**
   * Where to stand to look at a piece, or null to look from here.
   *
   * In front of it first -- along the direction its placement faces -- and at
   * the distance a person stands back from a sofa to take it in; then a
   * little to either side, then its sides, for a piece the room hems in. A
   * spot is only used if the character can stand there and, when
   * `requireLine`, walk there straight from where it is.
   *
   * @param {object} spec  from `approachOf` in showcase.js
   */
  function viewingSpot(spec, from, { requireLine = true } = {}) {
    if (!spec || spec.height < LOW_ITEM) return null;
    const { centre, front, halfAlong, halfAcross } = spec;

    const edge =
      Math.hypot(from.x - centre.x, from.z - centre.z) - Math.max(halfAlong, halfAcross);
    if (edge < CLOSE_ENOUGH) return null;

    for (const angle of SPOT_ANGLES) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const dx = front.x * c - front.z * s;
      const dz = front.x * s + front.z * c;
      const reach = Math.abs(c) * halfAlong + Math.abs(s) * halfAcross;

      for (const gap of SPOT_GAPS) {
        const x = centre.x + dx * (reach + gap);
        const z = centre.z + dz * (reach + gap);
        if (walkVolume?.resolve(x, z).hit) continue;
        if (requireLine && !lineClear(from, x, z)) continue;
        return new THREE.Vector3(x, from.y, z);
      }
    }

    return null;
  }

  /**
   * Points to walk through to get from `from` to `to`.
   *
   * Straight there if nothing is in the way. Otherwise by the route: onto
   * the nearest point of it that can be reached directly, along it the short
   * way round the loop, and off it at the point nearest the destination. The
   * route was solved through every doorway in the house, so this always
   * finds a way that exists. Null if there is none.
   */
  function planPath(from, to) {
    if (lineClear(from, to.x, to.z)) return [to.clone()];
    if (!network?.length) return null;

    const nearestReachable = (p) => {
      const order = network
        .map((point, index) => ({
          index,
          d: (point.position[0] - p.x) ** 2 + (point.position[1] - p.z) ** 2,
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 16);
      const hit = order.find(({ index }) =>
        lineClear(p, network[index].position[0], network[index].position[1])
      );
      return hit ? hit.index : -1;
    };

    const on = nearestReachable(from);
    const off = nearestReachable(to);
    if (on < 0 || off < 0) return null;

    const n = network.length;
    const ahead = (off - on + n) % n;
    const behind = (on - off + n) % n;
    const way = ahead <= behind ? 1 : -1;
    const count = Math.min(ahead, behind);

    const points = [];
    for (let k = 0; k <= count; k += 1) {
      const [x, z] = network[(on + way * k + n) % n].position;
      points.push(new THREE.Vector3(x, from.y, z));
    }
    points.push(to.clone());
    return points;
  }

  /** A walk through `points`. See `task`. */
  function goTo(points, { owner = "route", pace: pacing = 1, lookAt = null, onDone = null } = {}) {
    if (!points?.length) return null;
    return { points, index: 0, owner, pace: pacing, lookAt, onDone, stall: 0, closest: Infinity };
  }

  /**
   * Head for a point: turn towards it, and set the pace for how far off the
   * heading is -- full speed when facing it, slower into a bend, stopped to
   * turn on the spot only when it is well behind. Returns the pace asked for.
   *
   * @param {object} [how]
   * @param {boolean} [how.settle]  this is where the walk stops, so ease in
   * @param {number}  [how.bend]    radians the route turns at this point
   */
  function steerTo(tx, tz, step, { settle = false, bend = 0 } = {}) {
    const dx = tx - position.x;
    const dz = tz - position.z;
    const distance = Math.hypot(dx, dz);
    const wanted = Math.atan2(dx, -dz);
    const diff = angleTo(heading, wanted);

    if (Math.abs(diff) > 0.015) {
      heading = smoothDampAngle(
        heading, wanted, turnVelocity,
        TURN_SMOOTH_GUIDED, step, GUIDED_TURN_SPEED * 1.5
      );
    } else {
      // Settle exactly, and shed the velocity, so the next bend starts from
      // rest rather than from whatever was left over.
      heading = wanted;
      turnVelocity.value = 0;
    }

    const off = Math.abs(diff);
    let want = off >= TURN_IN_PLACE ? 0 : (1 - off / TURN_IN_PLACE) ** 1.6;

    if (settle) {
      want *= Math.max(0.18, smoothstep(Math.min(1, distance / SETTLE_DISTANCE)));
    } else if (bend > 0.3) {
      const near = 1 - Math.min(1, distance / CORNER_DISTANCE);
      want *= 1 - near * Math.min(bend / (Math.PI / 2), 1) * 0.55;
    }

    return want;
  }

  /** How sharply the route turns at waypoint `index`, radians. */
  function bendAt(index) {
    if (!route || index <= 0 || index >= route.length - 1) return 0;
    const [ax, az] = route[index - 1].position;
    const [bx, bz] = route[index].position;
    const [cx, cz] = route[index + 1].position;
    const into = Math.atan2(bx - ax, -(bz - az));
    const out = Math.atan2(cx - bx, -(cz - bz));
    return Math.abs(angleTo(into, out));
  }

  /**
   * Walk the current task one frame. Returns the pace asked for.
   *
   * Each point is arrived at within a few centimetres if it is the last --
   * that is where the character will stand -- and within 300mm otherwise,
   * so the walk flows through the middle ones rather than stopping on them.
   * A point that cannot be got closer to for TASK_STALL seconds is given up,
   * the same guard the route has, for the same reason.
   */
  function runTask(step) {
    const t = task;
    const point = t.points[t.index];
    const last = t.index === t.points.length - 1;
    const distance = Math.hypot(point.x - position.x, point.z - position.z);

    if (distance < (last ? 0.12 : 0.3)) {
      t.index += 1;
      t.stall = 0;
      t.closest = Infinity;
      if (t.index >= t.points.length) {
        task = null;
        t.onDone?.();
        return 0;
      }
      return steerTo(t.points[t.index].x, t.points[t.index].z, step) * t.pace;
    }

    if (distance < t.closest - 0.03) {
      t.closest = distance;
      t.stall = 0;
    } else {
      t.stall += step;
      if (t.stall > TASK_STALL) {
        t.index += 1;
        t.stall = 0;
        t.closest = Infinity;
        if (t.index >= t.points.length) {
          task = null;
          t.onDone?.();
        }
        return 0;
      }
    }

    // Walking towards something to look at, the eyes are already on it --
    // as long as it is somewhere ahead.
    if (t.lookAt) {
      const toward = Math.atan2(t.lookAt.x - position.x, -(t.lookAt.z - position.z));
      if (Math.abs(angleTo(heading, toward)) < 1.0) looking = t.lookAt;
    }

    return steerTo(point.x, point.z, step, { settle: last }) * t.pace;
  }

  /** The way back to where the stop was reached: retracing, but no further than needed. */
  function returnPath() {
    const path = [];
    let from = position;
    for (let k = trail.length - 1; k >= 0 && !lineClear(from, stopAt.x, stopAt.z); k -= 1) {
      path.push(trail[k].clone());
      from = trail[k];
    }
    path.push(stopAt.clone());
    return path;
  }

  /**
   * Start being shown the current target: tell the page, and walk up to it
   * if it is a piece worth walking up to.
   *
   * Surfaces -- the floor, the walls, the ceiling -- are looked at from the
   * spot the stop was reached, because that is where they were measured
   * from; after a walk up to a sofa the character goes back there first.
   */
  function beginTarget() {
    const current = showTargets[showIndex];
    current.begun = true;
    showLeft = current.dwell;
    onShow?.(current, showIndex, showTargets.length);

    if (current.kind === "product") {
      const spot = viewingSpot(current.approach, position);
      if (spot) {
        trail.push(position.clone());
        task = goTo([spot], { lookAt: current.point });
      }
    } else if (Math.hypot(position.x - stopAt.x, position.z - stopAt.z) > 0.4) {
      task = goTo(returnPath());
      trail = [];
    }
  }

  /** The room has been shown. Back to the route, then on. */
  function finishStop() {
    clearShowcase();
    if (Math.hypot(position.x - stopAt.x, position.z - stopAt.z) > 0.3) {
      task = goTo(returnPath());
      trail = [];
      stopState = "return";
    } else {
      advance();
    }
  }

  /**
   * Being shown the room, one frame.
   *
   * Each target's dwell counts only once the character is standing in front
   * of it -- the walk there is not time spent looking.
   */
  function runShowcase(step) {
    const current = showTargets[showIndex];
    if (!current) {
      finishStop();
      return 0;
    }
    if (!current.begun) {
      beginTarget();
      if (task) return 0;
    }

    faceTowards(current.point, step);
    showLeft -= step;

    if (showLeft <= 0) {
      showIndex += 1;
      if (showIndex >= showTargets.length) finishStop();
      else beginTarget();
    }
    return 0;
  }

  /**
   * The guided route, one frame. Returns the pace asked for.
   *
   * `stopState` comes first: at a stop, the walk is doing something other
   * than heading for the waypoint, and may be nowhere near it.
   */
  function runRoute(step) {
    if (stopState === "show") return runShowcase(step);

    if (stopState === "survey") {
      // NOTHING ADVERTISED HERE. A hallway, or a room whose products have
      // all been withdrawn. The HEAD sweeps a slow full cycle -- right, back,
      // left, back -- and the body stays put, so the room is taken in by
      // looking round it rather than by the whole figure swivelling.
      dwellLeft -= step;
      const t = 1 - dwellLeft / Math.max(dwellTotal, 0.001);
      const yaw = surveyFrom + Math.sin(t * Math.PI * 2) * SURVEY_ARC;
      surveyPoint.set(
        position.x + Math.sin(yaw) * 3,
        position.y + EYE_HEIGHT,
        position.z - Math.cos(yaw) * 3
      );
      looking = surveyPoint;
      if (dwellLeft <= 0) advance();
      return 0;
    }

    // The walk back from the last piece has finished (the task ran first).
    if (stopState === "return") {
      advance();
      return 0;
    }

    let target = route[routeIndex];
    let dx = target.position[0] - position.x;
    let dz = target.position[1] - position.z;
    let distance = Math.hypot(dx, dz);

    // ARRIVED, OR GONE PAST.
    //
    // Distance alone is not enough. Walking is continuous and turning takes
    // time, so the character can sail past a waypoint by more than the
    // arrival radius -- and then it turns round, comes back, overshoots the
    // other way, and circles it forever. So a waypoint also counts as reached
    // once the character is past the far end of the leg leading to it. That
    // matters more now that the walk rounds its corners: it often goes past
    // a bend's waypoint without ever being within the radius of it.
    let passed = false;
    if (routeIndex > 0) {
      const prev = route[routeIndex - 1].position;
      const legX = target.position[0] - prev[0];
      const legZ = target.position[1] - prev[1];
      const legLength = Math.hypot(legX, legZ);
      if (legLength > 1e-4) {
        const travelled =
          ((position.x - prev[0]) * legX + (position.z - prev[1]) * legZ) / legLength;
        passed = travelled > legLength - ARRIVE_RADIUS * 0.5;
      }
    }

    if (distance < ARRIVE_RADIUS || passed) {
      if (target.dwell && !target.done) {
        // Reached a stop: tell whoever is listening, so the room lists can
        // follow the visitor through the house, then work out what there is
        // to show here.
        target.done = true;
        onArrive?.(target, routeIndex);
        stopAt.set(position.x, position.y, position.z);
        trail = [];

        const showing = target.room && showcase
          ? showcase.forRoom(target.room, position)
          : [];

        if (showing.length) {
          showTargets = showing;
          showIndex = 0;
          stopState = "show";
          beginTarget();
        } else {
          dwellLeft = target.dwell;
          dwellTotal = target.dwell;
          surveyFrom = heading;
          stopState = "survey";
        }
        return 0;
      }

      // A waypoint on the way, not a stop: carry straight on to the next one,
      // in the same frame, so the walk does not hesitate at it.
      advance();
      target = route[routeIndex];
      dx = target.position[0] - position.x;
      dz = target.position[1] - position.z;
      distance = Math.hypot(dx, dz);
    }

    // STALL GUARD. Something placed since the route was solved can block the
    // way through rather than merely stand on a waypoint, and `settleRoute`
    // cannot move a waypoint past a wardrobe across a doorway. Giving up on
    // the waypoint and trying the next one walks around the obstruction often
    // enough to be worth it, and when it does not, the tour at least keeps
    // moving. See STALL_SECONDS.
    if (distance < closestSoFar - STALL_PROGRESS) {
      closestSoFar = distance;
      stallFor = 0;
    } else {
      stallFor += step;
      if (stallFor >= STALL_SECONDS) {
        skipped += 1;
        if (skipped <= 3 || skipped % 25 === 0) {
          console.warn(
            `[tour] cannot reach waypoint ${routeIndex}` +
            `${target.label ? ` (${target.label})` : ''} -- something is ` +
            `in the way that was not there when the route was solved. ` +
            `Skipping it.`
          );
        }
        advance();
        return 0;
      }
    }

    return steerTo(target.position[0], target.position[1], step, {
      settle: Boolean(target.dwell && !target.done),
      bend: bendAt(routeIndex),
    });
  }

  /** Drop whatever the tour was showing. */
  function clearShowcase() {
    showTargets = [];
    showIndex = 0;
    showLeft = 0;
  }

  /**
   * Move on to the next waypoint, looping at the end.
   *
   * The stall counters reset here and nowhere else, so every way of leaving a
   * waypoint -- arriving at it, or giving up on it -- starts the next one
   * with a clean slate.
   */
  function advance() {
    routeIndex += 1;
    dwellLeft = 0;
    stallFor = 0;
    closestSoFar = Infinity;
    stopState = null;
    trail = [];
    clearShowcase();

    if (routeIndex >= route.length) {
      // Loop: the route ends where it began.
      routeIndex = 0;
      route.forEach((point) => { point.done = false; });
    }
  }

  /**
   * Can the character stand at (x, z)?
   *
   * Rejects anything that would need too big a step up or down. Off the edge
   * of the world -- no ground at all -- is allowed, so walking past the site
   * boundary does not trap you; the height simply stops changing.
   */
  function standable(x, z) {
    const y = groundAt(x, z);
    if (y === null) return true;
    return Math.abs(y - lastGroundY) <= MAX_STEP;
  }

  /**
   * Move to (x, z) if anything solid there allows it.
   *
   * The volume gets first say and answers with the nearest position that is
   * NOT inside a wall or a piece of furniture -- so a walker pressed into a
   * wall is displaced along it rather than stopped. Only the height test can
   * refuse outright, because there is no sensible way to push someone out of
   * a 2m drop.
   *
   * @returns {boolean} whether the character moved
   */
  function moveTo(x, z) {
    let px = x;
    let pz = z;

    if (walkVolume) {
      const solved = walkVolume.resolve(px, pz);
      px = solved.x;
      pz = solved.z;
    }

    if (!standable(px, pz)) return false;

    const moved = Math.abs(px - position.x) > 1e-6 || Math.abs(pz - position.z) > 1e-6;
    position.x = px;
    position.z = pz;
    return moved;
  }

  return {
    get active() {
      return active;
    },

    /** True while the route is held mid-way. See `routeHeld` above. */
    get paused() {
      return routeHeld;
    },

    /**
     * Stop walking, keep the place.
     *
     * The character stays standing where they got to and stays VISIBLE --
     * they are the bookmark, and a tour that resumes from an empty room
     * leaves the visitor wondering where they were.
     *
     * THE CAMERA STAYS THE TOUR'S. A pause used to hand it to OrbitControls so
     * it could fly off to a product -- which is the house zooming away from
     * the person standing in it. Now the character walks over instead (see
     * `visit`), and the camera goes with them.
     */
    pauseRoute() {
      if (!active || routeHeld) return false;
      routeHeld = true;
      keys.clear();
      input.forward = 0;
      input.turn = 0;
      return true;
    },

    /**
     * Carry on from exactly where it stopped -- walking back there first if a
     * visit took the character somewhere else in the meantime.
     */
    resumeRoute() {
      if (!active || !routeHeld) return false;
      routeHeld = false;
      focus = null;
      if (visitFrom && Math.hypot(position.x - visitFrom.x, position.z - visitFrom.z) > 0.3) {
        task = goTo(planPath(position, visitFrom) ?? [visitFrom.clone()]);
      } else if (task?.owner === "visit") {
        task = null;
      }
      visitFrom = null;
      return true;
    },

    /**
     * Go and look at something: walk to stand in front of it, then keep
     * looking at it until the visitor moves on.
     *
     * WHAT "SHOW ME" MEANS IN A WALK-THROUGH. The alternative -- flying the
     * camera to the sofa -- leaves the person behind and zooms the house
     * about; a visitor who asked to see a sofa should be walked to it. A
     * guided tour is held for the visit and walked back to where it was on
     * `resumeRoute`. A visitor walking themselves simply arrives, and their
     * next key press is theirs.
     *
     * @param {object} what
     * @param {THREE.Vector3} what.point      what to look at, world metres
     * @param {object} [what.approach]        from `approachOf`; where to stand
     * @param {THREE.Vector3} [what.standAt]  or say where to stand outright
     * @returns {boolean} whether there is a walk to take
     */
    visit({ point, approach: spec = null, standAt = null } = {}) {
      if (!active || !point) return false;
      if (route && !routeHeld) routeHeld = true;
      if (route && !visitFrom) visitFrom = position.clone();

      const goal = standAt?.clone() ?? viewingSpot(spec, position, { requireLine: false });
      const path = goal ? planPath(position, goal) : null;

      focus = point.clone();
      bodyTurning = false;
      task = path ? goTo(path, { owner: "visit", pace: VISIT_PACE, lookAt: focus }) : null;
      return Boolean(task);
    },

    /**
     * The solved route, for finding a way to somewhere not in a straight line
     * -- another room -- before any guided tour has been started.
     */
    setNetwork(waypoints) {
      network = waypoints?.length ? waypoints : null;
    },

    get position() {
      return position.clone();
    },

    /** Enter walk mode: park the character, take over the camera. */
    enter() {
      if (active) return;
      active = true;
      keys.clear();
      input.forward = 0;
      input.turn = 0;

      if (controls) controls.enabled = false;

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;
      position.y = lastGroundY;

      showWalker();
      character.position.copy(position);
      // NEGATIVE, and it always had to be. The walk goes along
      // (sin h, -cos h); the model faces -Z, and a positive rotation about Y
      // turns -Z towards -X. So `rotation.y = heading` faced the figure the
      // mirror image of where it walked -- the right way north and south,
      // backwards east and west.
      character.rotation.y = -heading;

      applyFov();

      // Snap the camera in rather than sweeping it across the whole site.
      camYaw = heading;
      camYawVelocity.value = 0;
      [camVelocity, aimVelocity].forEach((v) => { v.x.value = 0; v.y.value = 0; v.z.value = 0; });
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camRight.set(Math.cos(heading), 0, Math.sin(heading));
      camera.position.set(
        position.x - forward.x * view.back + camRight.x * view.side,
        position.y + view.up,
        position.z - forward.z * view.back + camRight.z * view.side
      );
      // Seed the aim rather than letting it ease in from wherever the orbit
      // camera happened to be pointed, which would start every tour with an
      // unexplained pan across the garden.
      aimTarget.set(
        position.x + forward.x * view.lookAhead,
        position.y + view.lookHeight,
        position.z + forward.z * view.lookAhead
      );
      aim.copy(aimTarget);
      camera.lookAt(aim);
    },

    /** Leave walk mode and hand the camera back to OrbitControls. */
    exit() {
      if (!active) return;
      active = false;
      routeHeld = false;
      keys.clear();
      route = null;
      task = null;
      focus = null;
      visitFrom = null;
      stopState = null;
      clearShowcase();
      character.visible = false;
      restoreFov();
      if (controls) {
        controls.enabled = true;
        controls.target.set(position.x, position.y + 1, position.z);
      }
    },

    /** 'third' or 'first'. */
    get view() {
      return viewName;
    },

    setView(name) {
      if (!VIEWS[name]) return;
      viewName = name;
      view = VIEWS[name];
      showWalker();
      if (active) applyFov();
    },

    toggleView() {
      this.setView(viewName === "third" ? "first" : "third");
    },

    /**
     * The page asking for the figure to be shown or hidden.
     *
     * A REQUEST, NOT AN ASSIGNMENT. Whether it is honoured depends on the
     * view, and only this object knows which view is current -- which is
     * exactly what the old direct assignment from the page did not.
     */
    setWalkerVisible(visible) {
      wantCharacter = Boolean(visible);
      showWalker();
    },

    /** Whether the current view shows a figure at all. */
    get showsCharacter() {
      return view.showCharacter;
    },

    // -- The guided tour --------------------------------------------------

    get touring() {
      return Boolean(route);
    },

    /** Which stop the tour is at, for the UI. */
    get stop() {
      return route ? route[Math.min(routeIndex, route.length - 1)] : null;
    },

    /**
     * Walk a solved route, entering walk mode if needed.
     *
     * @param {Array<{position:[number,number], label?:string, dwell?:number}>} waypoints
     *        WORLD coordinates -- the character lives in the scene, not in the
     *        house group, so the caller adds the house offset.
     * @param {(stop:object, index:number) => void} [arrived] called on reaching
     *        a stop, so the panels can follow the visitor from room to room.
     * @param {object} [options]
     * @param {{forRoom: Function}} [options.showcase] what is advertised in
     *        each room; see tour/showcase.js. Without one the tour falls back
     *        to sweeping its head around each room.
     * @param {(target:object, index:number, total:number) => void} [options.onShow]
     *        called as each advertised thing is turned to, so the advert on
     *        screen is the one being looked at.
     */
    followRoute(waypoints, arrived = null, { showcase: showing = null, onShow: shown = null } = {}) {
      if (!waypoints?.length) return;
      if (!active) this.enter();

      route = waypoints.map((point) => ({ ...point, done: false }));
      network = route;
      dwellLeft = 0;
      stopState = null;
      trail = [];
      task = null;
      focus = null;
      visitFrom = null;
      routeHeld = false;
      clearShowcase();
      onArrive = arrived;
      showcase = showing;
      onShow = shown;

      // ALWAYS START AT THE BEGINNING. Snapping to the nearest waypoint looks
      // like a saving and is a trap: every waypoint is indoors, the visitor
      // starts on the driveway, and the nearest one is on the far side of the
      // front wall -- so the tour would set off diagonally and press itself
      // against the outside of the house forever.
      //
      // The route's first point is in front of the front door precisely so
      // that walking to it is a clear run across the drive.
      routeIndex = 0;
    },

    /** Stop following, but stay in walk mode so the visitor can take over. */
    stopRoute() {
      route = null;
      onArrive = null;
      onShow = null;
      showcase = null;
      stopState = null;
      trail = [];
      routeHeld = false;
      visitFrom = null;
      if (task?.owner !== "visit") task = null;
      clearShowcase();
      wallRay.far = COLLIDE_DISTANCE;
    },

    /** Progress through the stops, for the UI: {at, total}. */
    get progress() {
      if (!route) return null;
      const stops = route.filter((point) => point.label);
      const done = stops.filter((point) => point.done).length;
      return { at: done, total: stops.length };
    },

    toggle() {
      if (active) this.exit();
      else this.enter();
    },

    /** Press or release an on-screen control. `dir` is one of the MOVE keys. */
    setButton(dir, pressed) {
      const amount = pressed ? 1 : 0;
      if (dir === "forward") input.forward = amount;
      else if (dir === "back") input.forward = -amount;
      else if (dir === "left") input.turn = amount;
      else if (dir === "right") input.turn = -amount;
    },

    /** Release everything. Used when the pointer leaves a button mid-press. */
    releaseAll() {
      input.forward = 0;
      input.turn = 0;
      keys.clear();
    },

    attach(target = window) {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
    },

    detach(target = window) {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    },

    /** Advance the walk. `delta` in seconds. */
    update(delta) {
      // A HELD TOUR STILL DRAWS. The character stands (or walks to what the
      // visitor asked to see), the camera stays with them, and the route
      // simply is not stepped until `resumeRoute`.
      if (!active) return;

      // Clamp: a long frame (tab regains focus) must not teleport anyone
      // through a wall by stepping further than the collision reaches.
      const step = Math.min(delta, 0.05);
      const fromX = position.x;
      const fromZ = position.z;
      const fromHeading = heading;

      const held = readKeys();
      let turn = held.t + input.turn;
      const drive = held.f + input.forward;

      // Any manual input hands control back. A tour you cannot escape is a
      // cutscene.
      if (turn || drive) {
        if (route) this.stopRoute();
        task = null;
        focus = null;
        visitFrom = null;
      }

      looking = null;
      let automatic = false;
      let want = 0;

      if (!turn && !drive) {
        if (task && (task.owner === "visit" || !routeHeld)) {
          automatic = true;
          want = runTask(step);
        } else if (route && !routeHeld) {
          // The route steers by asking for the SAME motion a person would --
          // a heading and a pace -- so collision, sliding, ground following
          // and the step limit all apply unchanged. A separate "just move
          // along the path" mode would have to re-solve all of it and would
          // still walk through a sofa that was moved after the route was
          // solved.
          automatic = true;
          want = runRoute(step);
        } else if (focus) {
          faceTowards(focus, step);
        }
      }

      // A HELD KEY IS A TARGET HEADING, NOT AN ANGULAR VELOCITY. Adding a
      // fixed rate per frame starts and stops the turn instantly; springing
      // towards a point a little way round means the turn accelerates when
      // the key goes down and settles when it comes up, without adding any
      // lag to the press itself -- the smoothing time is 0.16s.
      if (turn) {
        heading = smoothDampAngle(
          heading, heading + turn * 0.6, turnVelocity,
          TURN_SMOOTH_MANUAL, step, TURN_SPEED
        );
      } else if (!automatic && !focus && Math.abs(turnVelocity.value) > 0.001) {
        // Key released: let the turn run down rather than stopping dead.
        heading += turnVelocity.value * step;
        turnVelocity.value = damp(turnVelocity.value, 0, 12, step);
      }

      // Ramp towards the pace being asked for. Braking is quicker than
      // setting off, as it is on foot. The automatic walk asks for a pace
      // that falls away into bends and eases into stops, so this rarely has
      // to brake hard at all.
      if (drive) lastDrive = Math.sign(drive);
      if (automatic) lastDrive = 1;
      const goal = automatic ? want : drive ? 1 : 0;
      pace = approach(pace, goal, goal > pace ? ACCELERATE : BRAKE, step);

      if (pace > 0.001) {
        forward.set(Math.sin(heading), 0, -Math.cos(heading));
        const speed = automatic ? GUIDED_WALK_SPEED : WALK_SPEED;
        // `drive` carries the direction; `pace` carries how much of it.
        const heldDirection = drive === 0 ? lastDrive : Math.sign(drive);
        const distance = heldDirection * pace * speed * step;
        desired.copy(forward).multiplyScalar(Math.sign(distance));

        const nextX = position.x + forward.x * distance;
        const nextZ = position.z + forward.z * distance;

        if (!blocked(position, desired)) {
          // The building resolves itself: `moveTo` asks the volume where the
          // character may actually stand, which is why walking into a wall at
          // an angle slides along it with no special case for sliding.
          if (!moveTo(nextX, nextZ)) {
            // Refused for HEIGHT, not for a wall -- the pool edge, the slab
            // step. Try each axis alone so a glancing approach still moves.
            if (!moveTo(nextX, position.z)) moveTo(position.x, nextZ);
          }
        } else {
          // A fence or a hedge. The ray can only refuse, so sliding has to be
          // asked for one axis at a time.
          const tryX = desired.clone().setZ(0);
          const tryZ = desired.clone().setX(0);

          if (tryX.lengthSq() > 1e-6 && !blocked(position, tryX.normalize())) {
            moveTo(nextX, position.z);
          } else if (tryZ.lengthSq() > 1e-6 && !blocked(position, tryZ.normalize())) {
            moveTo(position.x, nextZ);
          }
        }
      }

      // RECOVERY. Everything above resolves where the character is GOING; this
      // resolves where it IS. It matters because the world can move while the
      // character stands still -- an admin drags a sofa onto them, a placement
      // loads late -- and because a walk that can only ever test its next step
      // has no way back out of a wall it somehow ended up inside. A position
      // test does.
      if (walkVolume) {
        const freed = walkVolume.resolve(position.x, position.z);
        if (freed.hit && standable(freed.x, freed.z)) {
          position.x = freed.x;
          position.z = freed.z;
        }
      }

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;   // else keep the last known height
      position.y = lastGroundY;

      // THE HOUSE NEVER MOVES. Only the character and the camera do.
      character.position.copy(position);
      character.rotation.y = -heading;   // see `enter` for why negative

      // ---- Where the eyes are -------------------------------------------
      // On whatever is being looked at, or straight ahead.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      if (looking) {
        lookPoint.copy(looking);
      } else {
        lookPoint.set(
          position.x + forward.x * view.lookAhead,
          position.y + view.lookHeight,
          position.z + forward.z * view.lookAhead
        );
      }

      // ---- The body -----------------------------------------------------
      const moved = Math.hypot(position.x - fromX, position.z - fromZ) / step;
      const turnRate = angleTo(fromHeading, heading) / step;
      const lookDX = lookPoint.x - position.x;
      const lookDZ = lookPoint.z - position.z;
      const lookFlat = Math.hypot(lookDX, lookDZ);
      gait.update(step, {
        speed: moved,
        turnRate,
        lookYaw: lookFlat > 0.05 ? angleTo(heading, Math.atan2(lookDX, -lookDZ)) : 0,
        lookPitch: Math.atan2(lookPoint.y - (position.y + EYE_HEIGHT), Math.max(lookFlat, 0.3)),
      });

      // ---- The companion camera ------------------------------------------
      // Where it stands follows the character's heading -- promptly while
      // they walk, slowly while they stand, and not at all while they stand
      // roughly facing away from it, so turning to look at something turns
      // the view rather than swinging the camera round them. First person is
      // the eyes themselves, and follows the heading closely.
      const firstPerson = view === VIEWS.first;
      const standing = moved < 0.12;
      const studying = Boolean(looking) && standing && !firstPerson;
      const behind = Math.abs(angleTo(camYaw, heading));
      if (firstPerson || !standing || studying || behind > CAM_HOLD_ANGLE) {
        const follow = firstPerson ? 0.12
          : !standing ? CAM_FOLLOW_WALK
          : studying ? CAM_FOLLOW_LOOK
          : CAM_FOLLOW_STAND;
        camYaw = smoothDampAngle(camYaw, heading, camYawVelocity, follow, step);
      } else {
        camYawVelocity.value = damp(camYawVelocity.value, 0, 6, step);
        camYaw += camYawVelocity.value * step;
      }

      camForward.set(Math.sin(camYaw), 0, -Math.cos(camYaw));
      camRight.set(Math.cos(camYaw), 0, Math.sin(camYaw));

      // Behind while walking, beside while studying something. The side is
      // chosen as the step begins, and it is the shoulder with room to stand
      // at: a companion does not stand inside the wall.
      const wantPose = studying ? 1 : 0;
      if (wantPose === 1 && pose.value < 0.02 && walkVolume && view.lookSide) {
        const at = (sign) => walkVolume.resolve(
          position.x - camForward.x * view.lookBack + camRight.x * view.lookSide * sign,
          position.z - camForward.z * view.lookBack + camRight.z * view.lookSide * sign
        ).hit;
        poseSide = !at(1) ? 1 : !at(-1) ? -1 : 1;
      }
      pose.value = smoothDamp(pose.value, wantPose, pose.velocity, CAM_POSE_SMOOTH, step);
      const p = view.lookSide ? pose.value : 0;
      const back = view.back + ((view.lookBack ?? view.back) - view.back) * p;
      const side = view.side + ((view.lookSide ?? view.side) * poseSide - view.side) * p;
      const up = view.up + ((view.lookUp ?? view.up) - view.up) * p;

      head.set(position.x, position.y + view.lookHeight, position.z);
      camTarget.set(
        position.x - camForward.x * back + camRight.x * side,
        position.y + up,
        position.z - camForward.z * back + camRight.z * side
      );

      // Keep the camera out of the building: cast from the character's head
      // to where the camera wants to be and, if a wall is in the way, pull
      // the camera in front of it. Without this the view ends up outside the
      // room whenever you back up to a wall.
      let pulledIn = false;
      if (cameraObstacles.length) {
        camDir.copy(camTarget).sub(head);
        const reach = camDir.length();
        if (reach > 1e-4) {
          camDir.divideScalar(reach);
          camRay.set(head, camDir);
          camRay.far = reach;
          const hits = camRay.intersectObjects(cameraObstacles, true);
          const room = hits.length ? hits[0].distance - 0.25 : reach;
          if (hits.length) {
            const pulled = Math.max(CAMERA_MIN, room);
            camTarget.copy(head).addScaledVector(camDir, pulled);
            pulledIn = true;
          }
          if (!firstPerson) {
            throughEyes = throughEyes ? room < EYES_BEYOND : room < EYES_WITHIN;
          }
        }
      }
      if (throughEyes && !firstPerson) {
        camTarget.set(
          position.x + forward.x * 0.08,
          position.y + EYE_HEIGHT + 0.03,
          position.z + forward.z * 0.08
        );
        pulledIn = true;
      }

      // SPRINGS, NOT LERPS. A lerp moves a fixed share of the distance each
      // frame, so it leaves at full speed and crawls in; a critically damped
      // spring gathers speed and settles, which is how a person carrying a
      // camera moves. A wall pulling the camera in gets a much quicker one,
      // or the camera would drift through the wall on its way.
      const closing = pulledIn && camTarget.distanceTo(head) < camera.position.distanceTo(head);
      const settle = firstPerson ? 0.06 : closing ? 0.06 : CAM_POSITION_SMOOTH;
      camera.position.x = smoothDamp(camera.position.x, camTarget.x, camVelocity.x, settle, step);
      camera.position.y = smoothDamp(camera.position.y, camTarget.y, camVelocity.y, settle, step);
      camera.position.z = smoothDamp(camera.position.z, camTarget.z, camVelocity.z, settle, step);

      // WHERE THE CAMERA IS POINTED: ahead while walking -- the room, not
      // the back of someone's head -- and at the thing itself while looking
      // at something, drifting onto it rather than snapping.
      const aimSmooth = looking ? AIM_SMOOTH_LOOK : AIM_SMOOTH_WALK;
      aim.x = smoothDamp(aim.x, lookPoint.x, aimVelocity.x, aimSmooth, step);
      aim.y = smoothDamp(aim.y, lookPoint.y, aimVelocity.y, aimSmooth, step);
      aim.z = smoothDamp(aim.z, lookPoint.z, aimVelocity.z, aimSmooth, step);

      // A glance, not a crane shot: the tilt is limited to what a head does.
      aimTarget.copy(aim);
      const flat = Math.hypot(aim.x - camera.position.x, aim.z - camera.position.z);
      if (flat > 0.05) {
        const pitch = Math.atan2(aim.y - camera.position.y, flat);
        const limited = Math.max(-PITCH_DOWN, Math.min(PITCH_UP, pitch));
        if (limited !== pitch) aimTarget.y = camera.position.y + Math.tan(limited) * flat;
      }

      // Too close to draw the figure? Measured from the camera as it now is,
      // with a gap between hiding and showing so it cannot flicker.
      const toHead = camera.position.distanceTo(head);
      const nowCrowded = crowded ? toHead < SHOW_BEYOND : toHead < HIDE_WITHIN;
      if (nowCrowded !== crowded) {
        crowded = nowCrowded;
        showWalker();
      }

      stepFov(step);
      camera.lookAt(aimTarget);
    },
  };
}
