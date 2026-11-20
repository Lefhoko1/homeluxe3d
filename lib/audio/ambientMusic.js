/**
 * Background music for the showroom, that steps aside when a shop talks.
 *
 * A calm piano loop plays under the whole visit. When a shop's narration
 * plays (lib/narration), the music DUCKS -- fades down to a murmur -- and
 * comes back up when the shop stops, the way a radio ad dips the music under
 * the voice.
 *
 * WHY WEB AUDIO, NOT `audio.volume`. Safari on iPhone and iPad ignores
 * `volume` on media elements entirely, so a duck done that way would leave the
 * music at full volume over the shop's voice on exactly the devices most
 * visitors use. A GainNode works everywhere, and ramps smoothly without a
 * timer of our own.
 *
 * BROWSERS DO NOT ALLOW SOUND BEFORE A TAP. `start()` must be called from a
 * click or key press (the showroom calls it on the visitor's first one). Until
 * then nothing plays, and nothing breaks.
 */

/** Full level for the music, 0..1. Background, not foreground. */
export const MUSIC_LEVEL = 0.32;
/** While a shop is talking. Audible as a bed, never over the voice. */
export const DUCKED_LEVEL = 0.06;
/** Seconds to fade down for a voice, and back up after. */
const DUCK_DOWN = 0.5;
const DUCK_UP = 1.4;
/** Seconds to fade in at the start, and out when switched off. */
const FADE_IN = 2.5;
const FADE_OUT = 0.6;

export function createAmbientMusic(src, { level = MUSIC_LEVEL, ducked = DUCKED_LEVEL } = {}) {
  let audio = null;
  let context = null;
  let gain = null;
  let started = false;
  let enabled = true;
  let ducking = false;

  const target = () => (!enabled ? 0 : ducking ? ducked : level);

  /** Ramp to the current target over `seconds`. */
  function ramp(seconds) {
    if (gain && context) {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(target(), now + seconds);
    } else if (audio) {
      // No Web Audio: the element's own volume, where the browser honours it.
      audio.volume = target();
    }
  }

  return {
    /** Begin playing. Call from a user gesture. Safe to call repeatedly. */
    start() {
      if (started || typeof window === "undefined") return;
      started = true;
      audio = new Audio(src);
      audio.loop = true;
      audio.preload = "auto";
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          context = new Ctx();
          gain = context.createGain();
          gain.gain.value = 0;
          context.createMediaElementSource(audio).connect(gain).connect(context.destination);
        }
      } catch {
        context = null;
        gain = null;
      }
      if (!gain) audio.volume = 0;
      if (enabled) {
        context?.resume?.();
        audio.play().catch(() => { started = false; });
        ramp(FADE_IN);
      }
    },

    /** A shop started (true) or stopped (false) talking. */
    duck(on) {
      if (ducking === on) return;
      ducking = on;
      if (started) ramp(on ? DUCK_DOWN : DUCK_UP);
    },

    /** The visitor's music switch. Remembered by the caller. */
    setEnabled(on) {
      enabled = on;
      if (!started) return;
      if (on) {
        context?.resume?.();
        audio.play().catch(() => {});
        ramp(FADE_IN / 2);
      } else {
        ramp(FADE_OUT);
        setTimeout(() => { if (!enabled) audio?.pause(); }, FADE_OUT * 1000 + 50);
      }
    },

    /** Tab hidden: stop entirely rather than play to nobody. */
    suspend(hidden) {
      if (!started || !enabled) return;
      if (hidden) audio.pause();
      else {
        context?.resume?.();
        audio.play().catch(() => {});
      }
    },

    get started() { return started; },
    get enabled() { return enabled; },
    get level() { return target(); },

    dispose() {
      audio?.pause();
      if (audio) audio.src = "";
      context?.close?.().catch?.(() => {});
      audio = null;
      context = null;
      gain = null;
      started = false;
    },
  };
}
