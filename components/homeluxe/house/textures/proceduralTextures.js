/**
 * Procedural textures, drawn on canvas at load time.
 *
 * No image files to fetch, nothing to keep in sync with the repo, and every
 * surface stays crisp at any zoom. When you have real photographic textures,
 * swap the generator for a TextureLoader call in `materialLibrary.js` -- the
 * rest of the pipeline does not care where a texture came from.
 *
 * SCALE CONTRACT: the Blender exporter UV-projects at 1 UV unit per metre, so
 * every canvas here depicts exactly ONE SQUARE METRE of material and tiles
 * with repeat (1, 1). Draw to real millimetre sizes and the result is to
 * scale in the scene.
 */

import * as THREE from "three";

/** Pixels per metre. 512 gives ~2mm detail, enough for brick joints. */
const PX_PER_M = 512;

/**
 * Deterministic PRNG so the same wall looks the same on every reload.
 * Math.random() would reshuffle noise on each mount, which reads as flicker
 * when a texture is regenerated.
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createCanvas(size = PX_PER_M) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Wrap a canvas as a tiling texture. `isColor` flags sRGB decoding. */
function toTexture(canvas, { anisotropy = 4, isColor = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = anisotropy;
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Sprinkle fine grain over the whole canvas. Used by most surfaces. */
function addGrain(ctx, size, { count, alpha, spread = 26, seed = 1 }) {
  const random = makeRandom(seed);
  for (let i = 0; i < count; i += 1) {
    const shade = Math.floor(random() * spread * 2 - spread);
    ctx.fillStyle = `rgba(${128 + shade},${128 + shade},${128 + shade},${alpha})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
}

/**
 * Face brick in stretcher bond -- 230x76 bricks with 10mm joints, so roughly
 * 4.2 bricks and 11.6 courses to the metre, alternate courses offset by half
 * a brick. Those are the real dimensions from the elevation notes.
 */
export function createBrickTexture(options = {}) {
  const { base = "#b9ab92", joint = "#9c937f", seed = 7 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  const brickW = (230 / 1000) * size;
  const brickH = (76 / 1000) * size;
  const jointPx = (10 / 1000) * size;
  const courseH = brickH + jointPx;

  ctx.fillStyle = joint;
  ctx.fillRect(0, 0, size, size);

  const courses = Math.ceil(size / courseH) + 1;
  for (let row = 0; row < courses; row += 1) {
    const y = row * courseH;
    const offset = row % 2 === 0 ? 0 : -(brickW + jointPx) / 2;

    for (let x = offset; x < size; x += brickW + jointPx) {
      // Per-brick colour variation is what stops brickwork reading as plastic.
      const tint = Math.floor(random() * 26 - 13);
      const r = Math.min(255, Math.max(0, 185 + tint));
      const g = Math.min(255, Math.max(0, 171 + tint));
      const b = Math.min(255, Math.max(0, 146 + tint));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, brickW, brickH);
    }
  }

  addGrain(ctx, size, { count: 5000, alpha: 0.05, seed: seed + 1 });
  return canvas;
}

/** Greyscale height version of the brick bond, for bump relief. */
export function createBrickBumpTexture() {
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const brickW = (230 / 1000) * size;
  const brickH = (76 / 1000) * size;
  const jointPx = (10 / 1000) * size;
  const courseH = brickH + jointPx;

  ctx.fillStyle = "#404040"; // recessed joint
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#e0e0e0"; // proud brick face

  const courses = Math.ceil(size / courseH) + 1;
  for (let row = 0; row < courses; row += 1) {
    const offset = row % 2 === 0 ? 0 : -(brickW + jointPx) / 2;
    for (let x = offset; x < size; x += brickW + jointPx) {
      ctx.fillRect(x, row * courseH, brickW, brickH);
    }
  }
  return canvas;
}

/**
 * Corrugated steel roofing. Ribs run at a 76mm pitch; the gradient across each
 * rib is what catches the light and makes the roof read as metal rather than
 * a flat grey plane.
 */
export function createCorrugatedTexture(options = {}) {
  const { light = "#4a4f57", dark = "#22262c", ribPitchMm = 76 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const ribW = (ribPitchMm / 1000) * size;
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += ribW) {
    const gradient = ctx.createLinearGradient(x, 0, x + ribW, 0);
    gradient.addColorStop(0, dark);
    gradient.addColorStop(0.45, light);
    gradient.addColorStop(0.55, light);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, ribW, size);
  }
  return canvas;
}

/** Square floor tiles with grout joints. `tileMm` sets the module. */
export function createTileTexture(options = {}) {
  const { base = "#d5d1c9", grout = "#a9a49a", tileMm = 500, seed = 3 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const tilePx = (tileMm / 1000) * size;
  const joint = Math.max(2, (4 / 1000) * size);

  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = base;

  for (let y = 0; y < size; y += tilePx) {
    for (let x = 0; x < size; x += tilePx) {
      ctx.fillRect(x + joint / 2, y + joint / 2, tilePx - joint, tilePx - joint);
    }
  }

  addGrain(ctx, size, { count: 2600, alpha: 0.04, seed });
  return canvas;
}

/** Timber flooring: boards running along X, with grain streaks. */
export function createTimberTexture(options = {}) {
  const { base = "#7a5230", boardMm = 130, seed = 11 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  const boardPx = (boardMm / 1000) * size;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += boardPx) {
    const tint = Math.floor(random() * 30 - 15);
    ctx.fillStyle = `rgb(${122 + tint},${82 + tint},${48 + tint})`;
    ctx.fillRect(0, y, size, boardPx - 1);

    // grain
    ctx.strokeStyle = `rgba(60,38,20,${0.10 + random() * 0.14})`;
    ctx.lineWidth = 1;
    for (let g = 0; g < 9; g += 1) {
      const gy = y + random() * boardPx;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.3, gy + random() * 5 - 2.5,
                        size * 0.7, gy + random() * 5 - 2.5, size, gy);
      ctx.stroke();
    }

    // board joint
    ctx.fillStyle = "rgba(40,26,14,0.55)";
    ctx.fillRect(0, y + boardPx - 2, size, 2);
  }
  return canvas;
}

/** Dense short-pile carpet. Pure noise -- carpet has no structure at 1m. */
export function createCarpetTexture(options = {}) {
  const { base = "#736d63", seed = 23 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, { count: 90000, alpha: 0.16, spread: 40, seed });
  return canvas;
}

/** Broom-finished concrete. */
export function createConcreteTexture(options = {}) {
  const { base = "#8b8a85", seed = 31 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, { count: 30000, alpha: 0.10, spread: 34, seed });
  return canvas;
}

/** Painted plasterboard -- barely-there tooth so walls are not dead flat. */
export function createPlasterTexture(options = {}) {
  const { base = "#e8e5df", seed = 41 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, { count: 12000, alpha: 0.05, spread: 18, seed });
  return canvas;
}

/** Mown lawn: fine blade noise plus broader mower banding. */
export function createGrassTexture(options = {}) {
  const { base = "#4a6b32", seed = 61 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Blades: short strokes rather than dots, so it does not read as sand.
  for (let i = 0; i < 26000; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const shade = Math.floor(random() * 46 - 20);
    ctx.strokeStyle = `rgba(${74 + shade},${107 + shade},${50 + shade},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 3);
    ctx.stroke();
  }
  return canvas;
}

/** Broom-finished concrete paving with control joints on a 1m grid. */
export function createPavingTexture(options = {}) {
  const { base = "#b4b0a6", joint = "#8f8b82", seed = 71 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, { count: 18000, alpha: 0.07, spread: 24, seed });

  ctx.strokeStyle = joint;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  return canvas;
}

/** Bark: vertical fissures. */
export function createBarkTexture(options = {}) {
  const { base = "#3e2b1c", seed = 83 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 160; i += 1) {
    const x = random() * size;
    const shade = Math.floor(random() * 40 - 20);
    ctx.strokeStyle = `rgba(${62 + shade},${43 + shade},${28 + shade},0.75)`;
    ctx.lineWidth = 1 + random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + (random() - 0.5) * 20, size * 0.33,
      x + (random() - 0.5) * 20, size * 0.66,
      x + (random() - 0.5) * 12, size
    );
    ctx.stroke();
  }
  return canvas;
}

/** Foliage: clumpy light/dark mottle so a canopy is not one flat green. */
export function createFoliageTexture(options = {}) {
  const { base = "#2c5420", seed = 91 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2200; i += 1) {
    const shade = Math.floor(random() * 70 - 28);
    ctx.fillStyle = `rgba(${44 + shade},${84 + shade},${32 + shade},0.6)`;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 2 + random() * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** Bark-and-chip mulch. */
export function createMulchTexture(options = {}) {
  const { base = "#3a2416", seed = 97 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4200; i += 1) {
    const shade = Math.floor(random() * 54 - 24);
    ctx.fillStyle = `rgba(${68 + shade},${44 + shade},${26 + shade},0.85)`;
    const w = 4 + random() * 12;
    const h = 2 + random() * 5;
    ctx.fillRect(random() * size, random() * size, w, h);
  }
  return canvas;
}

/**
 * Soft cloud sheet for the sky.
 *
 * Value-noise fBm written into the ALPHA channel: the clouds are white and
 * only their opacity varies, which is what lets one texture sit over any sky
 * colour without tinting it. Returns a square power-of-two canvas so it can
 * tile across the sky plane.
 */
export function createCloudTexture(options = {}) {
  const { size = 512, seed = 1337, coverage = 0.46, softness = 0.34 } = options;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const random = makeRandom(seed);

  // Lattice of random values, wrapping so the texture tiles seamlessly.
  const LATTICE = 16;
  const lattice = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();

  const at = (ix, iy) =>
    lattice[((iy % LATTICE) + LATTICE) % LATTICE * LATTICE +
            (((ix % LATTICE) + LATTICE) % LATTICE)];

  const smooth = (t) => t * t * (3 - 2 * t);

  const noise = (x, y, freq) => {
    const fx = x * freq;
    const fy = y * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;

      // Four octaves of fBm gives billow without looking like static.
      let value = 0;
      let amplitude = 0.5;
      let frequency = LATTICE / 4;
      for (let octave = 0; octave < 4; octave += 1) {
        value += noise(u, v, frequency) * amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      // Threshold into cloud / clear, with a soft edge.
      const alpha = Math.min(
        1,
        Math.max(0, (value - coverage) / softness)
      );

      const index = (y * size + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Bonded leather: fine pebble grain.
 *
 * Upholstery at this scale is read almost entirely from how it catches light,
 * so the grain is deliberately subtle — enough to break a flat fill, not
 * enough to look like orange peel.
 */
export function createLeatherTexture(options = {}) {
  const { base = "#877a6b", seed = 131 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Pebbles: overlapping soft blobs, alternately lighter and darker.
  for (let i = 0; i < 9000; i += 1) {
    const shade = Math.floor(random() * 30 - 15);
    ctx.fillStyle = `rgba(${135 + shade},${122 + shade},${107 + shade},0.35)`;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 1.5 + random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  addGrain(ctx, size, { count: 14000, alpha: 0.05, spread: 16, seed: seed + 1 });
  return canvas;
}

/** Woven jute: coarse basket weave. */
export function createJuteTexture(options = {}) {
  const { base = "#b4956a", seed = 137, strandMm = 12 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const strand = Math.max(4, (strandMm / 1000) * size);

  // Alternating over/under blocks read as a weave from a metre away.
  for (let y = 0; y < size; y += strand) {
    for (let x = 0; x < size; x += strand) {
      const over = ((x / strand | 0) + (y / strand | 0)) % 2 === 0;
      const shade = Math.floor(random() * 26 - 13) + (over ? 12 : -12);
      ctx.fillStyle = `rgb(${180 + shade},${149 + shade},${106 + shade})`;
      ctx.fillRect(x, y, strand - 1, strand - 1);
    }
  }

  addGrain(ctx, size, { count: 20000, alpha: 0.08, spread: 22, seed: seed + 1 });
  return canvas;
}

export { toTexture, PX_PER_M };
