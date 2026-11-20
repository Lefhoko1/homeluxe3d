// The showroom music: fades in on the first tap, ducks under a shop's voice,
// comes back after, and the switch turns it off. Run: node lib/audio/ambientMusic.test.mjs
import assert from "node:assert/strict";
import { createAmbientMusic, MUSIC_LEVEL, DUCKED_LEVEL } from "./ambientMusic.js";

// Stand-ins for the browser: an <audio> element and a Web Audio graph that
// records where each fade is heading.
const played = [];
globalThis.Audio = class { constructor(src) { this.src = src; this.paused = true; } play() { this.paused = false; played.push(this.src); return Promise.resolve(); } pause() { this.paused = true; } };
const ramps = [];
globalThis.window = {
  AudioContext: class {
    constructor() { this.currentTime = 0; this.destination = {}; }
    resume() {} close() { return Promise.resolve(); }
    createGain() { const g = { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime: (v, t) => ramps.push({ v, t }) }, connect: (d) => d }; return g; }
    createMediaElementSource() { return { connect: (g) => g }; }
  },
};
const last = () => ramps[ramps.length - 1];

const music = createAmbientMusic("/media/music/calm-piano.mp3");
assert.equal(music.started, false);
music.duck(true);
assert.equal(played.length, 0, "nothing plays before the visitor's first tap");
console.log("  ok  silent until the first tap");

music.duck(false);
music.start();
assert.deepEqual(played, ["/media/music/calm-piano.mp3"]);
assert.equal(last().v, MUSIC_LEVEL, "fades in to the music level");
assert.ok(last().t >= 2, "gently, over a couple of seconds");
console.log(`  ok  first tap: plays, fading in to ${MUSIC_LEVEL} over ${last().t}s`);

music.duck(true);
assert.equal(last().v, DUCKED_LEVEL, "ducks under a voice");
music.duck(false);
assert.equal(last().v, MUSIC_LEVEL, "and comes back after");
assert.ok(last().t > 1, "coming back more slowly than it went down");
console.log(`  ok  a shop talks: down to ${DUCKED_LEVEL}, then back to ${MUSIC_LEVEL}`);

music.setEnabled(false);
assert.equal(last().v, 0, "switched off fades to silence");
music.duck(true); music.duck(false);
assert.equal(last().v, 0, "and a voice ending does not bring it back while off");
music.setEnabled(true);
assert.equal(last().v, MUSIC_LEVEL);
console.log("  ok  the switch turns it off, and a voice cannot turn it back on");

music.start();
assert.equal(played.length, 2, "start() again does not start a second copy (the replay is setEnabled's resume)");
music.dispose();
console.log("ambientMusic: ok");
