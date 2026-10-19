/**
 * Motion that is worth watching.
 *
 * ---------------------------------------------------------------------------
 * THE BUG AT THE BOTTOM OF ALL OF THIS: `lerp(a, b, 0.35)` PER FRAME
 *
 * It reads as "move 35% of the way there", and it is the single most common
 * mistake in real-time code. The step is per FRAME, so what it actually means
 * is "move 35% of the way there, however often you happen to be called". At
 * 60Hz that is 35% sixty times a second; on a 144Hz laptop it is 35% a
 * hundred and forty-four times, which is two and a half times faster; on a
 * loaded phone at 30Hz it is half as fast. The camera is therefore tuned for
 * exactly one refresh rate and is wrong on every other, and it changes speed
 * whenever the frame rate dips -- which is precisely when a camera should be
 * steady.
 *
 * The correct form is exponential decay over TIME:
 *
 *     remaining after t seconds  =  e^(-lambda * t)
 *
 * `damp` below. It gives an identical curve at every frame rate, and lambda
 * has a physical meaning: 1/lambda is the time constant, the number of
 * seconds to close about 63% of the gap.
 *
 * ---------------------------------------------------------------------------
 * WHY EXPONENTIAL DECAY IS STILL NOT ENOUGH FOR TURNING
 *
 * Decay eases OUT beautifully -- it slows as it arrives -- and does not ease
 * IN at all: it starts at full speed on the first frame. For a camera trailing
 * a character that is right, because the camera has no body. For a turn it is
 * wrong. A head that snaps to maximum angular velocity and then coasts to a
 * stop looks mechanical, and the house is full of turns.
 *
 * `smoothDampAngle` is the answer, and it is the same one Unity reaches for
 * (`Mathf.SmoothDampAngle`, which is what DOTween and LeanTween users mean by
 * a smooth rotate). It is a CRITICALLY DAMPED SPRING: it carries a velocity,
 * accelerates into the move, and settles without overshooting -- ever, which
 * is what "critically damped" buys and what makes it safe to point at a
 * heading that is itself moving. Accelerate, cruise, decelerate. That is what
 * a turn looks like when a person does it.
 *
 * The implementation is the standard one from Game Programming Gems 4: a
 * closed-form solution of the spring, so it is stable at any step size rather
 * than exploding when a frame runs long.
 */

/** Shortest way round from one heading to another, in radians. */
export function angleDelta(from, to) {
  let diff = (to - from) % (Math.PI * 2);

  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;

  return diff;
}

/**
 * Frame-rate independent approach: move `current` towards `target`.
 *
 * @param {number} lambda  1/lambda is the time constant, in seconds
 * @param {number} dt      seconds since the last call
 */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** The same, the short way round a circle. */
export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

/**
 * A lerp factor that means the same thing at every frame rate.
 *
 * For code that already has `thing.lerp(target, k)` and wants to keep its
 * feel: pass the old per-frame k and the rate it was tuned at, and this
 * returns the k to use for the frame actually being drawn.
 */
export function frameRateSafe(perFrame, dt, tunedAt = 60) {
  const lambda = -Math.log(Math.max(1e-6, 1 - perFrame)) * tunedAt;

  return 1 - Math.exp(-lambda * dt);
}

/**
 * Critically damped spring towards a target, carrying velocity.
 *
 * Accelerates in, decelerates out, never overshoots. `velocity` is state the
 * caller keeps between frames -- it is what distinguishes this from every
 * easing curve, which cannot start from a speed it is already travelling at.
 *
 * @param {number} current
 * @param {number} target
 * @param {{value: number}} velocity  mutated in place
 * @param {number} smoothTime   roughly how long the move takes, seconds
 * @param {number} dt
 * @param {number} maxSpeed     units per second, optional ceiling
 */
export function smoothDamp(current, target, velocity, smoothTime, dt, maxSpeed = Infinity) {
  // Guard: a smoothTime of zero is a snap, and dividing by it is not.
  const time = Math.max(0.0001, smoothTime);
  const omega = 2 / time;
  const x = omega * dt;

  // Rational approximation of e^-x, from Game Programming Gems 4. Cheaper
  // than Math.exp and, more to the point, stable for large x -- a frame that
  // runs long must not make the spring diverge.
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const limit = maxSpeed * time;
  const clamped = Math.min(Math.max(change, -limit), limit);
  const goal = current - clamped;

  const temp = (velocity.value + omega * clamped) * dt;

  velocity.value = (velocity.value - omega * temp) * exp;

  let result = goal + (clamped + temp) * exp;

  // Do not sail past the target: if we have crossed it, stop on it.
  if (target - current > 0 === result > target) {
    result = target;
    velocity.value = (result - target) / dt;
  }

  return result;
}

/** The same spring, taking the short way round a circle. */
export function smoothDampAngle(current, target, velocity, smoothTime, dt, maxSpeed = Infinity) {
  // Bring the target within half a turn of where we are, so the spring pulls
  // the short way rather than unwinding through the long one.
  const aim = current + angleDelta(current, target);

  return smoothDamp(current, aim, velocity, smoothTime, dt, maxSpeed);
}

/**
 * Move a value towards a target at a fixed rate, in units per second.
 *
 * For speed ramps, where a spring is wrong: a walker should reach cruising
 * pace and STAY there, not ease asymptotically towards it forever.
 */
export function approach(current, target, rate, dt) {
  const step = rate * dt;
  const gap = target - current;

  return Math.abs(gap) <= step ? target : current + Math.sign(gap) * step;
}

/* ===========================================================================
   Curves, for moves with a known start, end and duration
   =========================================================================== */

/** Slow out of the start, slow into the end. The default for a camera move. */
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;

/** Quick away, gentle arrival. Right when the move is a RESPONSE to a click. */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** Gentler still at the end, for long flights across the house. */
export const easeOutQuint = (t) => 1 - (1 - t) ** 5;

/** The classic smoothstep, for anything that must not look like a curve. */
export const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * A one-shot tween, driven by the caller's own clock.
 *
 * DELIBERATELY NOT SELF-DRIVING. Every animation in the showroom happens
 * inside one requestAnimationFrame loop that already exists, and a tween
 * library that starts its own loop would put the camera on a second clock --
 * so a move and the walk it interrupts would drift apart under load. This is
 * a value and a `step`; the render loop stays the only thing with a timer.
 *
 * @param {object} options
 * @param {number} options.seconds
 * @param {(t: number) => number} [options.ease]
 * @param {(v: number) => void} options.onUpdate  called with 0..1, eased
 * @param {() => void} [options.onDone]
 */
export function createTween({ seconds, ease = easeInOutCubic, onUpdate, onDone }) {
  let elapsed = 0;
  let done = false;

  return {
    get done() {
      return done;
    },

    /** @returns {boolean} whether it is still running */
    step(dt) {
      if (done) return false;

      elapsed += dt;

      const t = Math.min(1, elapsed / Math.max(0.0001, seconds));

      onUpdate?.(ease(t));

      if (t >= 1) {
        done = true;
        onDone?.();
      }

      return !done;
    },

    /** Jump to the end. For a second move arriving before the first lands. */
    finish() {
      if (done) return;
      done = true;
      onUpdate?.(1);
      onDone?.();
    },
  };
}
