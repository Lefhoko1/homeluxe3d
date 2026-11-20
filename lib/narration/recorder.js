/**
 * Record one narration clip from the microphone, in the browser.
 *
 * Stops itself at the limit (MAX_CLIP_MS) so a shop that keeps talking gets
 * a clip that fits rather than an error after the fact. The duration is
 * TIMED, not read back from the file: a WebM from MediaRecorder often reports
 * its duration as Infinity until it has been played through.
 */

import { MAX_CLIP_MS } from "./NarrationService.js";

/** The first format this browser can record, Opus first (smallest, clearest). */
function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const wanted = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return wanted.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
}

export const canRecord = () =>
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== "undefined";

/**
 * Start recording. Resolves once the microphone is open and recording has
 * begun, with a handle to stop it.
 *
 * @param {object}   [options]
 * @param {number}   [options.maxMs]   stop automatically after this
 * @param {Function} [options.onTick]  (elapsedMs) about ten times a second
 * @returns {Promise<{stop: () => Promise<{blob: Blob, durationMs: number}>,
 *                    cancel: () => void, done: Promise}>}
 */
export async function startRecording({ maxMs = MAX_CLIP_MS, onTick = null } = {}) {
  if (!canRecord()) {
    throw new Error("This browser cannot record audio. Try Chrome, Edge, Firefox or Safari, or upload a file instead.");
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    throw new Error(
      error?.name === "NotAllowedError"
        ? "The microphone was blocked. Allow microphone access for this site and try again."
        : `The microphone could not be opened (${error?.message ?? error}).`
    );
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };

  let startedAt = 0;
  let stoppedAt = 0;
  let ticker = null;
  let limit = null;
  let cancelled = false;

  const release = () => {
    clearInterval(ticker);
    clearTimeout(limit);
    stream.getTracks().forEach((track) => track.stop());
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      release();
      if (cancelled) { resolve(null); return; }
      const durationMs = Math.min(maxMs, (stoppedAt || performance.now()) - startedAt);
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }),
        durationMs,
      });
    };
    recorder.onerror = (event) => { release(); reject(event.error ?? new Error("Recording failed.")); };
  });

  await new Promise((resolve) => {
    recorder.onstart = resolve;
    recorder.start(250);
  });
  startedAt = performance.now();
  ticker = setInterval(() => onTick?.(Math.min(maxMs, performance.now() - startedAt)), 100);
  limit = setTimeout(() => { if (recorder.state === "recording") { stoppedAt = performance.now(); recorder.stop(); } }, maxMs);

  return {
    done,
    async stop() {
      if (recorder.state === "recording") {
        stoppedAt = performance.now();
        recorder.stop();
      }
      return done;
    },
    cancel() {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      else release();
    },
  };
}

/**
 * How long an uploaded audio file is, in milliseconds. Uses the browser's
 * own decoder, so whatever it can play it can measure.
 */
export function measureAudioFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const finish = (fn) => { URL.revokeObjectURL(url); fn(); };
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        finish(() => resolve(Math.round(audio.duration * 1000)));
        return;
      }
      // Some files only know their length once read to the end.
      audio.currentTime = 1e7;
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        finish(() => resolve(Math.round(audio.duration * 1000)));
      };
    };
    audio.onerror = () => finish(() => reject(new Error("That file could not be read as audio.")));
    audio.src = url;
  });
}
