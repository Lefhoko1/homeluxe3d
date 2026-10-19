import * as THREE from "three";

/**
 * Making the televisions in the house actually show something.
 *
 * ---------------------------------------------------------------------------
 * A YOUTUBE VIDEO CANNOT BE PUT ON A 3D SURFACE, and it is worth writing down
 * why rather than leaving somebody to discover it.
 *
 * YouTube is delivered as an `<iframe>` player. The pixels inside a
 * cross-origin iframe are not readable by the page that embeds it -- that is
 * the whole point of the origin model, not an oversight -- so there is no way
 * to get a frame out of it and onto a texture. `drawImage` on it fails, and
 * the canvas would be tainted even if it did not. Anything that appears to do
 * it is extracting the underlying stream, which YouTube's terms forbid.
 *
 * WHAT DOES WORK is an ordinary `<video>` element, which the browser will
 * happily hand to `THREE.VideoTexture` frame by frame. So the screen plays a
 * video FILE -- an mp4 or an HLS playlist -- from a URL the shop controls,
 * carried on the product exactly as a tile's photograph is.
 *
 * ---------------------------------------------------------------------------
 * WITH NO VIDEO SET IT IS NOT A BLACK RECTANGLE.
 *
 * A television in a showroom that is switched off is a worse advert than no
 * television. With nothing to play, the screen gets a slow synthetic colour
 * field -- obviously not broadcast, but plainly ON, and cheap: one 8x8 canvas
 * pushed to the GPU a few times a second.
 */

/** How many times a second the standby pattern is redrawn. */
const STANDBY_FPS = 8;

/** The material name Blender bakes onto the picture. See catalog/.../media.py */
const SCREEN_MATERIAL = "tv_screen";

/**
 * A muted, looping, inline video element.
 *
 * MUTED IS NOT A PREFERENCE, it is the only way this plays at all: every
 * browser blocks autoplay with sound until the visitor has interacted with
 * the page, and a showroom television that waits for a click is a television
 * that is off in every screenshot.
 */
function videoElement(url) {
  const video = document.createElement("video");

  video.src = url;
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  // Never in the document: it exists only to decode frames for the texture.
  video.style.display = "none";

  return video;
}

/**
 * The standby pattern: a slow wash of colour, redrawn on a tiny canvas.
 *
 * Eight pixels square and scaled up by the GPU's own bilinear filter, which
 * is what makes it a soft gradient rather than a grid -- and means the whole
 * animation costs 64 pixels a frame.
 */
function standbyTexture() {
  const size = 8;
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  let t = 0;

  const draw = () => {
    t += 0.02;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const a = Math.sin(t + x * 0.5) * 0.5 + 0.5;
        const b = Math.sin(t * 0.7 + y * 0.4) * 0.5 + 0.5;

        ctx.fillStyle = `rgb(${20 + a * 40},${50 + b * 70},${110 + a * 90})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    texture.needsUpdate = true;
  };

  draw();

  return { texture, draw };
}

/**
 * Give every television in the scene something to play.
 *
 * @param {THREE.Object3D} group     the products group
 * @param {Map} products             id -> product, from loadProducts
 * @returns {{dispose: () => void, screens: number}}
 */
export function attachScreens(group, products) {
  if (!group) return { dispose: () => {}, screens: 0 };

  const created = [];
  let timer = null;
  const standbys = [];
  // COUNTED SEPARATELY FROM `created`, which holds cleanup closures and
  // not screens: a screen playing a video pushes two of them and one on
  // standby pushes one, so reporting its length said the house had four
  // televisions the moment the two it has were given something to play.
  let screens = 0;

  group.traverse((child) => {
    if (!child.isMesh) return;

    const wearing = Array.isArray(child.material) ? child.material : [child.material];

    if (!wearing.some((m) => m?.name === SCREEN_MATERIAL)) return;

    const product = products?.get(child.userData?.productId);
    // The shop's own clip, carried the same way a tile carries its
    // photograph. A YouTube link here will not play -- see the note above.
    const source = product?.video ?? product?.texture ?? null;

    let map;

    if (source && /\.(mp4|webm|m3u8)(\?|$)/i.test(source)) {
      const video = videoElement(source);

      map = new THREE.VideoTexture(video);
      map.colorSpace = THREE.SRGBColorSpace;
      // Autoplay can still be refused; a screen that fails to start should
      // say so in the console rather than sit black with no explanation.
      video.play().catch((error) => {
        console.warn(`[screens] ${source} would not play:`, error?.message);
      });
      created.push(() => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
    } else {
      if (source) {
        console.info(
          `[screens] ${child.userData?.productId}: "${source}" is not a video ` +
          "file (mp4, webm or m3u8), so the screen is on standby. A YouTube " +
          "page cannot be used as a texture -- see products/screens.js."
        );
      }
      const standby = standbyTexture();

      map = standby.texture;
      standbys.push(standby);
    }

    const lit = new THREE.MeshBasicMaterial({
      name: SCREEN_MATERIAL,
      map,
      // BASIC, NOT STANDARD. A screen emits its own light; shading it by the
      // room's would make the television dimmer in the corner it is standing
      // in, which is the opposite of how a television behaves.
      toneMapped: false,
    });

    child.material = lit;
    screens += 1;
    created.push(() => {
      map.dispose();
      lit.dispose();
    });
  });

  if (standbys.length) {
    timer = setInterval(
      () => standbys.forEach((s) => s.draw()),
      1000 / STANDBY_FPS
    );
  }

  return {
    screens,
    dispose() {
      if (timer) clearInterval(timer);
      created.forEach((fn) => fn());
    },
  };
}
