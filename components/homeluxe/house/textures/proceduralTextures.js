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

/**
 * A real tile photograph, laid out as tiles with grout joints.
 *
 * The supplied images are a single tile FACE with no joint, so repeating one
 * across a floor gives a continuous slab. This draws the photo at its true
 * module with a grout line around it, which is what turns a picture of a tile
 * into a tiled floor.
 *
 * Returns a texture immediately, filled with the grout colour, and paints the
 * photo in when it loads — so the material library can stay synchronous and
 * nothing has to await an image.
 *
 * SCALE: one canvas is one tile, so `repeat` must be set to
 * 1000 / tileMm per metre by the caller. It does NOT follow the
 * one-canvas-is-one-square-metre rule the procedural textures use.
 */
export function createTilePhotoTexture(url, options = {}) {
  const {
    tileMm = 600,
    groutMm = 3,
    grout = "#c9c7c2",
    anisotropy = 4,
    pixels = 512,
  } = options;

  const canvas = createCanvas(pixels);
  const ctx = canvas.getContext("2d");

  // Grout fills the canvas; the tile is drawn inset over it.
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, pixels, pixels);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;

  const inset = Math.max(1, Math.round((groutMm / tileMm) * pixels * 0.5));

  const image = new Image();
  image.onload = () => {
    ctx.drawImage(image, inset, inset, pixels - inset * 2, pixels - inset * 2);
    texture.needsUpdate = true;
  };
  image.onerror = () => {
    console.warn(`[textures] could not load tile image ${url}`);
  };
  image.src = url;

  return texture;
}

/**
 * Gamazine -- textured wall coating.
 *
 * Generated rather than photographed, because the product is ONE coating in
 * dozens of colours: a photograph would have to be reshot per shade, while a
 * generator takes the colour as an argument. The supplied image is a swatch
 * board, which is the right thing to show in the catalogue and the wrong
 * thing to tile across a wall.
 *
 * The look is a heavy stipple with directional drag, which is what a trowel
 * leaves behind.
 */
export function createGamazineTexture(options = {}) {
  const { base = "#e8e2d4", seed = 211, coarseness = 1.0 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const random = makeRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const { r, g, b } = hexToRgb(base);

  // Aggregate: thousands of small raised grains.
  const grains = Math.round(26000 * coarseness);
  for (let i = 0; i < grains; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const lift = Math.floor(random() * 54 - 22);
    ctx.fillStyle = `rgba(${clamp(r + lift)},${clamp(g + lift)},${clamp(b + lift)},0.55)`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + random() * 2.4 * coarseness, 0, Math.PI * 2);
    ctx.fill();
  }

  // Trowel drag: short vertical streaks, the giveaway of a hand-applied coat.
  for (let i = 0; i < 900; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const lift = Math.floor(random() * 30 - 15);
    ctx.strokeStyle = `rgba(${clamp(r + lift)},${clamp(g + lift)},${clamp(b + lift)},0.30)`;
    ctx.lineWidth = 1 + random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 6, y + 6 + random() * 16);
    ctx.stroke();
  }
  return canvas;
}

/** Smooth emulsion: almost flat, with just enough tooth to catch light. */
export function createPaintTexture(options = {}) {
  const { base = "#f2efe9", seed = 221 } = options;
  const size = PX_PER_M;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, { count: 9000, alpha: 0.035, spread: 12, seed });
  return canvas;
}

function hexToRgb(hex) {
  const v = hex.replace("#", "");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

export { toTexture, PX_PER_M };

/**
 * Upholstery weave -- the charcoal fabric a divan base and mattress band wear.
 *
 * Drawn rather than photographed, and the reason is in the photographs. Bears'
 * close-ups (`public/bearsFurnitures/Beds/2.png`, `3.png`) are the right
 * fabric shot the wrong way for a texture: each has a vent button in the
 * middle of the frame, and each falls off into depth-of-field blur toward one
 * corner. Tiled, the button repeats across the whole base every 300mm and the
 * blur reads as dirt. So the photographs are the reference and this is what
 * gets laid on the mesh -- and they are still the ADVERT, where a picture
 * taken from one place under one light is exactly right.
 *
 * MELANGE IS THE POINT. The fabric is not grey; it is dark and light threads
 * woven together, which is why it reads as cloth from across a room and why a
 * flat fill reads as plastic. Each thread gets its own brightness and holds it
 * along its length, so the surface breaks up the way a real weave does.
 *
 * @param {object} options
 * @param {string} options.warp        the darker thread
 * @param {string} options.weft        the lighter thread
 * @param {string|null} options.pinstripe  colour of the woven stripe, or null
 * @param {number} options.pinstripePitchMm  spacing, centre to centre
 */
export function createUpholsteryWeaveTexture(options = {}) {
  const {
    warp = "#2b3038",
    weft = "#454c57",
    pinstripe = null,
    pinstripePitchMm = 26,
    threadMm = 1.6,
    seed = 71,
    // Finer than the 512 the walls use: at 512 a 1.6mm thread is under a
    // pixel and the weave averages out to the flat fill it is meant to
    // replace.
    size = 1024,
  } = options;

  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  const rgb = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const dark = rgb(warp);
  const light = rgb(weft);

  const thread = Math.max(1, Math.round((threadMm / 1000) * size));
  const random = makeRandom(seed);

  // One brightness per thread, held along its whole length. Rolling a new
  // number per PIXEL gives television static; per thread gives cloth.
  const threads = Math.ceil(size / thread) + 1;
  const warpShade = new Int8Array(threads);
  const weftShade = new Int8Array(threads);
  for (let i = 0; i < threads; i += 1) {
    warpShade[i] = Math.round(random() * 44 - 22);
    weftShade[i] = Math.round(random() * 44 - 22);
  }

  // Pixels rather than fillRect: a 1024 canvas at 1.6mm threads is 400k
  // little rectangles, which is a visible pause on a phone.
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    const ty = (y / thread) | 0;
    for (let x = 0; x < size; x += 1) {
      const tx = (x / thread) | 0;
      // Plain weave: over, under, over.
      const over = ((tx + ty) & 1) === 0;
      const source = over ? light : dark;
      const shade = (over ? weftShade[tx] : warpShade[ty])
        // The thread crossing under catches less light than the one on top.
        + (over ? 7 : -7);

      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, source[0] + shade));
      data[i + 1] = Math.max(0, Math.min(255, source[1] + shade));
      data[i + 2] = Math.max(0, Math.min(255, source[2] + shade));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // The pinstripe. Horizontal in the canvas, which the box UV projection puts
  // horizontally round the bed on every vertical face -- `uv_project_box`
  // maps V to world Z on anything upright.
  if (pinstripe) {
    const pitch = (pinstripePitchMm / 1000) * size;
    ctx.strokeStyle = pinstripe;
    ctx.lineWidth = Math.max(1, size / 900);
    ctx.globalAlpha = 0.55;
    for (let y = pitch / 2; y < size; y += pitch) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  return canvas;
}


/**
 * The quilted knit on a pillow top.
 *
 * From `public/bearsFurnitures/Beds/4.png` and `5.png`: a white stretch knit
 * quilted in a serpentine LATTICE -- wavy lines running both ways, meeting in
 * rounded diamond figures -- with a chevron rib filling each figure, over a
 * fine vertical knit rib.
 *
 * THE QUILTING LIVES HERE, NOT IN THE MESH. The crown was first built as a
 * grid of puffed pads, on the theory that stitching pulls the cover down and
 * the filling puffs up between. That is true of how a quilt is MADE and it is
 * the wrong model of this one: the photographs show figures about 120mm
 * across, and pads that small mean a hundred and twenty bevelled boxes on
 * every bed. Worse, the pads came out at 280mm and the quilt pattern is at
 * 120mm, so the two grids were visibly at odds -- a pattern fighting a
 * pattern.
 *
 * A relief this fine is shading and not silhouette at any distance a visitor
 * stands, so it belongs in a bump map. The mesh keeps only what IS silhouette:
 * the inset gusset and the lip that says pillow top.
 *
 * Returns a canvas usable as both colour and bump -- the pattern is drawn as
 * light and dark, which is what a height field wants anyway.
 */
export function createQuiltedKnitTexture(options = {}) {
  const {
    base = "#e9ebe9",
    stitch = "#c4cac7",
    // Measured off 4.png against the 1,520mm bed in BedFull.png: about eight
    // figures across the width.
    figureMm = 125,
    seed = 91,
    size = 1024,
  } = options;

  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // -- The knit rib -------------------------------------------------------
  // Fine vertical ribbing, about 1.5mm. This is what makes a white surface
  // read as knitted cloth rather than as paper, and it has to be drawn
  // opaque: at low alpha over a light base it disappears entirely, which is
  // exactly what happened to the first version of this.
  const rib = Math.max(1, Math.round((1.5 / 1000) * size));
  ctx.fillStyle = "#dfe3e1";
  for (let x = 0; x < size; x += rib * 2) {
    ctx.fillRect(x, 0, rib, size);
  }

  // -- The lattice --------------------------------------------------------
  // A serpentine run, repeated both ways. Two sets of waves crossing is what
  // closes the pattern into figures; one set alone is a squiggle.
  const cell = (figureMm / 1000) * size;
  const wave = (from, to, along, sign) => {
    // A half-period cosine hump, sampled -- the shape the quilting machine
    // actually sews.
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 1 / 32) {
      const d = from + (to - from) * t;
      const off = Math.sin(t * Math.PI * 2) * cell * 0.22 * sign;
      const [px, py] = along === "x" ? [d, off] : [off, d];
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  ctx.strokeStyle = stitch;
  ctx.lineWidth = Math.max(1.5, size / 512);

  for (let row = 0; row <= size / cell + 1; row += 1) {
    ctx.save();
    ctx.translate(0, row * cell);
    wave(-cell, size + cell, "x", row % 2 === 0 ? 1 : -1);
    ctx.restore();
  }
  for (let col = 0; col <= size / cell + 1; col += 1) {
    ctx.save();
    ctx.translate(col * cell, 0);
    wave(-cell, size + cell, "y", col % 2 === 0 ? 1 : -1);
    ctx.restore();
  }

  // -- The chevron fill ---------------------------------------------------
  // Short paired diagonals inside each figure, as in 4.png. Lighter than the
  // lattice: it is a rib in the cloth, not a seam through it.
  ctx.strokeStyle = "#dde2df";
  ctx.lineWidth = Math.max(1, size / 900);
  const step = cell / 7;
  for (let cy = 0; cy < size + cell; cy += cell) {
    for (let cx = 0; cx < size + cell; cx += cell) {
      for (let k = -2; k <= 2; k += 1) {
        const y = cy + k * step;
        ctx.beginPath();
        ctx.moveTo(cx - cell * 0.28, y + cell * 0.16);
        ctx.lineTo(cx, y - cell * 0.1);
        ctx.lineTo(cx + cell * 0.28, y + cell * 0.16);
        ctx.stroke();
      }
    }
  }

  addGrain(ctx, size, { count: 24000, alpha: 0.05, spread: 14, seed });
  return canvas;
}
