/**
 * The focus marker: a pin that floats over whatever is being looked at.
 *
 * WHY A PIN AND NOT A GLOW. Products are placed by the admin and come in any
 * shape -- a sofa, a floor lamp, a television on a console -- so an outline
 * or a ring traced round the piece would have to understand its geometry, and
 * on a complex model it reads as noise. A marker above it needs to know only
 * one thing: where the top of the piece is. That is measured LIVE, every
 * frame, from the object's bounding box as it stands in the scene, so it is
 * right wherever the admin put the product and follows it if it is moved.
 *
 * Drawn over everything (no depth test), so a chair back or a wall corner can
 * never hide it, and unlit, so it is the same colour in every room.
 *
 * Usage: `aim()` it at an Object3D, at a spot `{x, y, z}` (the top of the
 * thing), or at null to hide it; call `update(dt)` once per frame.
 */

import * as THREE from "three";

/** Brand accent -- the same gold as the showroom's --accent. */
const COLOUR = 0xc08a2e;

/** How far above the top of the piece the tip of the pin floats, metres. */
const LIFT = 0.16;
/** How far the pin bobs up and down, metres. */
const BOB = 0.05;
/** Seconds to grow in and shrink away. */
const FADE_SECONDS = 0.25;

/** A soft round glow, drawn once into a canvas. Null without a DOM. */
function glowTexture() {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255, 226, 160, 0.9)");
  g.addColorStop(0.35, "rgba(232, 176, 76, 0.45)");
  g.addColorStop(1, "rgba(192, 138, 46, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createFocusMarker() {
  const group = new THREE.Group();
  group.name = "focus-marker";
  group.visible = false;
  // Last, over everything: see the note at the top.
  group.renderOrder = 1000;

  const onTop = (material) => {
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;
    return material;
  };

  // A map pin, upside down: a cone pointing at the piece with a ball on top.
  // Built so its TIP is at the group's origin, which is what gets placed.
  const solid = onTop(new THREE.MeshBasicMaterial({ color: COLOUR }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 20), solid);
  tip.rotation.x = Math.PI;            // point down
  tip.position.y = 0.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), solid);
  head.position.y = 0.19;
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 12, 8),
    onTop(new THREE.MeshBasicMaterial({ color: 0xfffaf0 }))
  );
  dot.position.y = 0.19;
  [tip, head, dot].forEach((mesh, i) => {
    mesh.renderOrder = 1001 + i;
    mesh.frustumCulled = false;
  });

  const pin = new THREE.Group();
  pin.add(tip, head, dot);

  // The glow behind it is what catches the eye from across the room.
  const glowMap = glowTexture();
  if (glowMap) {
    const glow = new THREE.Sprite(onTop(new THREE.SpriteMaterial({
      map: glowMap,
      blending: THREE.AdditiveBlending,
    })));
    glow.scale.setScalar(0.55);
    glow.position.y = 0.17;
    glow.renderOrder = 1000;
    pin.add(glow);
    pin.userData.glow = glow;
  }

  group.add(pin);

  let aimed = null;          // Object3D or {x, y, z}
  let shown = 0;             // 0 hidden .. 1 fully grown
  let clock = 0;
  const box = new THREE.Box3();
  const spot = new THREE.Vector3();
  let haveSpot = false;

  /** Where the tip goes: centred on the piece, just above its top. */
  function measure() {
    if (!aimed) return false;
    if (aimed.isObject3D) {
      if (!aimed.parent || aimed.visible === false) return false;
      aimed.updateWorldMatrix(true, true);
      box.setFromObject(aimed);
      if (box.isEmpty()) return false;
      spot.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      return true;
    }
    spot.set(aimed.x, aimed.y, aimed.z);
    return true;
  }

  return {
    group,

    /**
     * Point at something, or at nothing.
     * @param {THREE.Object3D|{x:number,y:number,z:number}|null} what
     */
    aim(what) {
      aimed = what ?? null;
    },

    /** Call once per frame. */
    update(dt) {
      clock += dt;
      // No fallback to the last spot: a product withdrawn or hidden while it
      // is being looked at must take its pin with it.
      haveSpot = measure();

      const want = aimed && haveSpot ? 1 : 0;
      const step = dt / FADE_SECONDS;
      shown = want > shown ? Math.min(1, shown + step) : Math.max(0, shown - step);

      group.visible = shown > 0.001;
      if (!group.visible) return;

      group.position.set(spot.x, spot.y + LIFT + Math.sin(clock * 2.6) * BOB, spot.z);
      // Grows in with a slight overshoot, so its arrival is noticed.
      const grow = shown < 1 ? Math.sin(shown * Math.PI * 0.5) * (1 + 0.15 * Math.sin(shown * Math.PI)) : 1;
      pin.scale.setScalar(grow);
      pin.rotation.y = clock * 1.4;
      const glow = pin.userData.glow;
      if (glow) glow.material.opacity = 0.65 + 0.35 * Math.sin(clock * 3.2);
    },

    dispose() {
      group.traverse((child) => {
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
    },
  };
}

/**
 * What the marker should stand over for one showcase target, or null.
 *
 * A product is marked over its live bounding box. An empty position for sale
 * and a door fitting have no object of their own, so they get a spot: the
 * top of the slot's box, or just above the hinge. Floors, walls, ceilings and
 * the opening look round a room are surfaces, not things -- a pin hanging in
 * the middle of the room would point at nothing -- so they get no marker.
 */
export function markerAimFor(target) {
  if (!target) return null;
  if (target.object) return target.object;
  if (target.kind === "slot" && target.slot) {
    const [x, y, z] = target.slot.position;
    return { x, y: y + (target.slot.size?.[1] ?? 0), z };
  }
  if (target.kind === "fitting" && target.point) {
    return { x: target.point.x, y: target.point.y + 0.1, z: target.point.z };
  }
  return null;
}
