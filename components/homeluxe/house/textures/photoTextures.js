/**
 * Photographic textures, as opposed to the drawn ones next door.
 *
 * A photograph is not a texture. It is a picture of a thing taken from one
 * place under one light, and using it as a tiling surface needs two problems
 * dealt with first:
 *
 *   1. LIGHTING GRADIENT. Any photograph of ground taken by a standing person
 *      is brighter far away and darker near the feet -- lawnTexture.png runs
 *      from luminance 194 at the top to 61 at the bottom. Tile that and the
 *      lawn reads as horizontal stripes, because every tile boundary is a
 *      step from dark to bright. `levelVertically` flattens it.
 *
 *   2. SIZE AND SHAPE. Photos are rectangular and large. A square power-of-two
 *      keeps the repeat isotropic -- otherwise the grass is stretched along
 *      one axis -- and keeps a 3.5MB PNG from becoming an equally large
 *      texture in video memory.
 *
 * Both are done once, on load, into a canvas. The file on disk is never
 * modified, so replacing the image is still a drop-in.
 */

import * as THREE from "three";

/**
 * Load an image as a tiling surface texture.
 *
 * @param {string} url
 * @param {object} options
 * @param {number} options.metresPerTile  how much ground one copy covers. UVs
 *        from `uv_project_box` are in metres, so repeat is its reciprocal.
 * @param {number} options.anisotropy
 * @param {boolean} options.level         flatten the vertical light gradient
 * @param {number} options.size           square resample size
 * @param {HTMLCanvasElement} options.fallback  used if the file cannot load
 */
export function loadPhotoTexture(url, options = {}) {
  const {
    metresPerTile = 2,
    anisotropy = 4,
    level = true,
    size = 1024,
    fallback = null,
  } = options;

  // TextureLoader returns the texture immediately and fills in the image when
  // it arrives, so this stays synchronous for the material library.
  const texture = new THREE.TextureLoader().load(
    url,
    (loaded) => {
      loaded.image = prepare(loaded.image, { size, level });
      loaded.needsUpdate = true;
    },
    undefined,
    () => {
      // A missing file must not leave a white lawn. The drawn texture is a
      // poorer likeness but an honest one.
      console.warn(`[textures] ${url} could not be loaded; using the drawn fallback`);
      if (fallback) {
        texture.image = fallback;
        texture.needsUpdate = true;
      }
    }
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / metresPerTile, 1 / metresPerTile);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Load an image as the distant backdrop wrapped around the world.
 *
 * The image is a horizon: ground below, sky above. `horizonFromTop` says
 * where the two meet, so the caller can line that up with y = 0 rather than
 * guessing.
 *
 * The top of the sky is faded to transparent, so the backdrop blends into the
 * gradient dome behind it instead of ending at a hard horizontal edge part
 * way up the sky.
 */
export function loadBackdropTexture(url, options = {}) {
  const { anisotropy = 4, fadeTop = 0.22, width = 1024 } = options;

  const texture = new THREE.TextureLoader().load(url, (loaded) => {
    loaded.image = fadeTopToTransparent(loaded.image, { width, fadeTop });
    loaded.needsUpdate = true;
  });

  // Mirrored so the joins between copies are reflections rather than seams:
  // a hard vertical edge in the sky is far more noticeable than a cloud that
  // happens to be symmetrical.
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Square-resample, and optionally flatten the vertical light gradient. */
function prepare(image, { size, level }) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  if (level) levelVertically(ctx, size);
  return canvas;
}

/**
 * Remove the top-to-bottom brightness ramp.
 *
 * Each row is scaled so its mean luminance matches the image's overall mean.
 * That keeps the blades, the colour variation and the local detail -- all the
 * things that make it look like grass -- while removing the one property that
 * makes it impossible to tile.
 *
 * Scaling is clamped: a row three times too dark, scaled all the way, turns
 * into noise rather than grass.
 */
function levelVertically(ctx, size) {
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;

  const rowMean = new Float32Array(size);
  let total = 0;

  for (let y = 0; y < size; y += 1) {
    let sum = 0;
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    }
    rowMean[y] = sum / size;
    total += rowMean[y];
  }

  const target = total / size;

  for (let y = 0; y < size; y += 1) {
    if (rowMean[y] < 1) continue;
    const gain = Math.min(2.2, Math.max(0.45, target / rowMean[y]));
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      px[i] = Math.min(255, px[i] * gain);
      px[i + 1] = Math.min(255, px[i + 1] * gain);
      px[i + 2] = Math.min(255, px[i + 2] * gain);
    }
  }

  ctx.putImageData(data, 0, 0);
}

/** Fade the top of the image out, so it can blend into the sky above it. */
function fadeTopToTransparent(image, { width, fadeTop }) {
  const height = Math.round((width * image.height) / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);

  // destination-out subtracts alpha: opaque at the top of the gradient means
  // fully erased there, tapering to untouched further down.
  const gradient = ctx.createLinearGradient(0, 0, 0, height * fadeTop);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height * fadeTop);
  ctx.globalCompositeOperation = "source-over";

  return canvas;
}
