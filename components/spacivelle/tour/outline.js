/**
 * A glossy line round whatever is being shown -- the exact shape of it, from
 * wherever the camera is.
 *
 * WHY THIS AND NOT ONLY THE PIN. The pin (tour/marker.js) marks a point; as
 * the camera turns round a piece -- and a shop's narration turns it a lot --
 * a point stops saying which thing it means. A line traced round the piece's
 * silhouette says it from every angle.
 *
 * HOW: A STENCIL OUTLINE, the technique games use for "selected".
 *
 *   1. The piece is drawn as normal, by the scene.
 *   2. MASK: its meshes again, colour off, stamping 1 into the stencil buffer
 *      wherever the piece is VISIBLE (depth-tested, so what stands in front of
 *      it is not stamped).
 *   3. LINE: its meshes again, pushed outward along their normals by a fixed
 *      number of PIXELS in the vertex shader, drawn only where the stencil is
 *      not 1. What is left is a ring of constant width round the silhouette,
 *      at any distance. Depth-tested too, so a coffee table in front of the
 *      sofa hides the line behind it, as it would hide the sofa.
 *
 * SMOOTH NORMALS FOR THE PUSH. A boxy piece has hard edges -- each face its
 * own normals -- and pushing those apart opens gaps at every corner. So the
 * line is drawn from a copy of the geometry with coincident vertices welded
 * and normals averaged, made once per geometry and cached.
 *
 * A LIGHT THAT TRAVELS, NOT A RING. A solid line all the way round framed
 * the piece like a sticker and changed how it looked. So the line is lit
 * one stretch at a time: a bright head with a fading tail runs round the
 * silhouette, a lap every few seconds, and the rest of the outline is clear.
 * Where the light is, is decided by the ANGLE round the piece's centre on
 * screen -- so it runs round any shape, following it exactly.
 *
 * SURFACES TOO -- a floor tile, a wall's paint. Those meshes are FLAT
 * sheets, and a flat sheet's normal points at the camera, not sideways, so
 * pushing along it opens no ring. For a surface the line is pushed instead
 * AWAY FROM THE POINT BEING LOOKED AT, on screen: the floor's far edges move
 * up onto the walls, a wall's top edge onto the ceiling. The light then runs
 * round the room's floor, or along the painted walls' edges.
 *
 * The renderer must be created with `stencil: true` (three.js turned the
 * stencil buffer off by default); without one, the line is drawn round the
 * whole piece, over it -- still a highlight, just not a crisp one.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Line width in CSS pixels, and how much it breathes. */
const WIDTH = 3.4;
const PULSE = 0.6;
/** Seconds for the light to go once round the piece. */
const LAP_SECONDS = 3.2;
/** How much of the way round the lit stretch reaches, head to end of tail. */
const ARC = Math.PI * 0.7;
/** Gold, and the white of the shine that runs along it. */
const GOLD = new THREE.Color(0xe0a63a);
const SHINE = new THREE.Color(0xfff6dc);
/** Seconds to fade in when a new piece is outlined. */
const FADE = 0.3;

const STENCIL_REF = 1;

const outlineGeometries = new WeakMap();

/**
 * The geometry the line is drawn from: positions only, coincident vertices
 * welded, normals averaged -- so pushing out along them never opens a crack.
 * Exported for the tests.
 */
export function outlineGeometryFor(geometry) {
  const cached = outlineGeometries.get(geometry);
  if (cached) return cached;

  const source = geometry.attributes.position;
  // Copied out as plain floats: a model may store positions quantised,
  // normalised or interleaved, and welding needs the real numbers.
  const positions = new Float32Array(source.count * 3);
  for (let i = 0; i < source.count; i += 1) {
    positions[i * 3] = source.getX(i);
    positions[i * 3 + 1] = source.getY(i);
    positions[i * 3 + 2] = source.getZ(i);
  }
  let plain = new THREE.BufferGeometry();
  plain.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (geometry.index) plain.setIndex(geometry.index.clone());

  // A tolerance relative to the piece's size: a millimetre on a sofa.
  plain.computeBoundingBox();
  const size = plain.boundingBox.getSize(new THREE.Vector3()).length() || 1;
  const welded = mergeVertices(plain, size * 1e-4);
  welded.computeVertexNormals();
  plain.dispose();
  plain = null;

  outlineGeometries.set(geometry, welded);
  return welded;
}

function maskMaterial(side) {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: true,
    side,
    stencilWrite: true,
    stencilRef: STENCIL_REF,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
  });
}

function lineMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Pulled a hair towards the camera: where a floor meets a wall, the line
    // lies at the same depth as the wall it is drawn over and would flicker.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: STENCIL_REF,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
    vertexShader: /* glsl */ `
      uniform vec2 resolution;
      uniform float width;
      uniform float radial;      // 1: a flat surface, pushed away from the centre
      uniform vec2 centerNdc;    // that centre, on screen (-1..1)
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 dir;
        if (radial > 0.5) {
          // Away from the point being looked at, on screen.
          dir = clip.xy / clip.w - centerNdc;
        } else {
          // The normal's direction ON SCREEN, so the push is in pixels.
          vec3 n = normalize(normalMatrix * normal);
          vec4 tip = projectionMatrix * vec4((modelViewMatrix * vec4(position, 1.0)).xyz + n * 0.01, 1.0);
          dir = tip.xy / tip.w - clip.xy / clip.w;
        }
        float len = length(dir);
        dir = len > 1e-6 ? dir / len : vec2(0.0);
        clip.xy += dir * width * 2.0 / resolution * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 gold;
      uniform vec3 shine;
      uniform float opacity;
      uniform vec2 center;   // the piece's middle, in drawing-buffer pixels
      uniform float head;    // radians: where the light is now
      uniform float arc;     // radians: head to the end of the tail
      void main() {
        // How far behind the head this bit of the outline is, going round
        // the piece's centre. Past the tail, the outline is not drawn.
        vec2 p = gl_FragCoord.xy - center;
        float behind = mod(head - atan(p.y, p.x), 6.2831853);
        float tail = 1.0 - behind / arc;
        if (tail <= 0.0) discard;
        // Bright, nearly white at the head; gold and fading along the tail.
        float glow = pow(tail, 1.7);
        vec3 colour = mix(gold, shine, smoothstep(0.72, 1.0, tail));
        gl_FragColor = vec4(colour, opacity * glow);
        // three.js keeps colours linear; back to the screen's colour space,
        // or the gold comes out dull.
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * @param {THREE.WebGLRenderer} renderer  for the size of the drawing buffer
 */
export function createFocusOutline(renderer = null) {
  const uniforms = {
    resolution: { value: new THREE.Vector2(1, 1) },
    width: { value: WIDTH },
    gold: { value: GOLD.clone() },
    shine: { value: SHINE.clone() },
    opacity: { value: 0 },
    center: { value: new THREE.Vector2() },
    head: { value: 0 },
    arc: { value: ARC },
    radial: { value: 0 },
    centerNdc: { value: new THREE.Vector2() },
  };
  const line = lineMaterial(uniforms);
  // The same line for a flat surface: shares every uniform but `radial`.
  const flatLine = lineMaterial({ ...uniforms, radial: { value: 1 } });
  const masks = new Map();       // side -> material
  const maskFor = (side) => {
    if (!masks.has(side)) masks.set(side, maskMaterial(side));
    return masks.get(side);
  };

  let aimed = null;
  let surface = false;           // a flat surface (floor, wall paint)?
  let around = null;             // world point the light goes round, if given
  let helpers = [];              // the meshes added to the outlined piece
  let clock = 0;
  const size = new THREE.Vector2();
  const box = new THREE.Box3();
  const middle = new THREE.Vector3();

  const noRaycast = () => {};

  function detach() {
    helpers.forEach((helper) => helper.parent?.remove(helper));
    helpers = [];
  }

  function attach(object) {
    const sources = [];
    object.traverse((child) => {
      if (child.isMesh && !child.isSkinnedMesh && child.visible !== false && child.geometry?.attributes?.position && !child.userData.outlineHelper) {
        sources.push(child);
      }
    });
    sources.forEach((mesh) => {
      const side = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.side ?? THREE.FrontSide;
      const mask = new THREE.Mesh(mesh.geometry, maskFor(side));
      const ring = new THREE.Mesh(
        surface ? mesh.geometry : outlineGeometryFor(mesh.geometry),
        surface ? flatLine : line
      );
      // Children of the mesh, so they move with it -- an admin dragging the
      // piece drags its outline -- and never in the way of anything else:
      // not clickable, not in a shadow, not in the bounds of the piece.
      for (const [helper, order] of [[mask, 900], [ring, 901]]) {
        helper.userData.outlineHelper = true;
        helper.raycast = noRaycast;
        helper.castShadow = false;
        helper.receiveShadow = false;
        helper.frustumCulled = mesh.frustumCulled;
        helper.renderOrder = order;
        mesh.add(helper);
        helpers.push(helper);
      }
    });
  }

  return {
    /**
     * Outline this piece, or nothing. Cheap to call every frame.
     *
     * @param {THREE.Object3D|null} object
     * @param {object} [options]
     * @param {boolean} [options.surface]  a flat surface -- a floor, a wall's
     *        paint -- rather than a piece of furniture
     * @param {THREE.Vector3} [options.center]  the world point the light runs
     *        round: for a surface, the patch being looked at
     */
    aim(object, { surface: flat = false, center = null } = {}) {
      const next = object && object.isObject3D ? object : null;
      around = center;
      if (next === aimed && flat === surface) return;
      detach();
      aimed = next;
      surface = flat;
      uniforms.opacity.value = 0;
      if (aimed) attach(aimed);
    },

    /**
     * Call once per frame, before rendering. `camera` places the centre the
     * light runs round; without one it runs round the middle of the screen.
     */
    update(dt, camera = null) {
      clock += dt;
      uniforms.head.value = (uniforms.head.value + (dt * Math.PI * 2) / LAP_SECONDS) % (Math.PI * 2);
      if (aimed && (!aimed.parent || aimed.visible === false)) {
        // Withdrawn or hidden while outlined: the line goes with it.
        detach();
        aimed = null;
      }
      const want = aimed ? 1 : 0;
      uniforms.opacity.value += Math.sign(want - uniforms.opacity.value) *
        Math.min(Math.abs(want - uniforms.opacity.value), dt / FADE);
      uniforms.width.value = WIDTH + Math.sin(clock * 2.2) * PULSE * 0.5 + PULSE * 0.5;
      if (renderer) {
        renderer.getDrawingBufferSize(size);
        const ratio = renderer.getPixelRatio?.() ?? 1;
        uniforms.resolution.value.set(size.x / ratio, size.y / ratio);
      } else {
        size.copy(uniforms.resolution.value);
      }
      // The middle of the piece on screen, in the same pixels as
      // gl_FragCoord. Measured every frame: the camera moves round it.
      // A surface goes round the point being looked at: the middle of a
      // room's walls can be behind the camera.
      if (aimed && camera) {
        let ok = true;
        if (around) {
          middle.copy(around).project(camera);
        } else {
          box.setFromObject(aimed);
          ok = !box.isEmpty();
          if (ok) box.getCenter(middle).project(camera);
        }
        if (ok) {
          uniforms.center.value.set((middle.x * 0.5 + 0.5) * size.x, (middle.y * 0.5 + 0.5) * size.y);
          uniforms.centerNdc.value.set(middle.x, middle.y);
        }
      } else {
        uniforms.center.value.set(size.x / 2, size.y / 2);
      }
    },

    get aimed() { return aimed; },

    dispose() {
      detach();
      line.dispose();
      flatLine.dispose();
      masks.forEach((m) => m.dispose());
    },
  };
}
