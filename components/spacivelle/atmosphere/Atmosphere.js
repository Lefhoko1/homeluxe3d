/**
 * Sky, horizon and fog.
 *
 * Three layers that have to agree with each other or the illusion breaks:
 *
 *   1. A sky DOME carrying a vertical gradient. Painted, not lit, so it never
 *      darkens when the sun moves.
 *   2. A BACKDROP cylinder just inside it, carrying a photographed horizon --
 *      distant fields below, cloud above.
 *   3. FOG whose colour matches the sky at the horizon.
 *
 * The backdrop replaced two drifting cloud domes built from a noise texture.
 * Drawn cloud is convincing looked at directly and much less so at the
 * horizon, which is the part actually in frame: the default view of a house
 * looks slightly DOWN, so most of the visible sky is the band just above the
 * skyline, and that band is exactly where a noise texture reads as fog rather
 * than weather. A photograph carries real cloud shape AND the far ground the
 * yard should appear to continue into.
 *
 * The trade is that the sky no longer moves. Drifting a photographed sky
 * means sliding recognisable clouds sideways, which reads as a moving
 * backdrop rather than as wind.
 */

import * as THREE from "three";

import { loadBackdropTexture } from "../house/textures/photoTextures";

/**
 * Sky colours, bottom to top, sampled from the backdrop image itself so the
 * dome and the photograph meet without a visible change of blue.
 */
export const SKY_HORIZON = new THREE.Color(0xb9dcf3);
export const SKY_ZENITH = new THREE.Color(0x3182b9);

/**
 * Fog applies to scene geometry only -- the sky and the backdrop opt out.
 * It starts past the far side of the yard so nothing you are looking at is
 * washed out, and only softens the boundary fence at full zoom-out.
 */
const FOG_NEAR = 60;
const FOG_FAR = 320;

const DOME_RADIUS = 700;

/** The backdrop, well outside the 30x40 yard but inside the sky dome. */
const BACKDROP_RADIUS = 260;
const BACKDROP_HEIGHT = 200;

/**
 * Where ground meets sky in backgroundimage.png, measured from the top.
 * Sampled from the file rather than guessed: the first row where green
 * overtakes blue is 218 of 417.
 *
 * Textures are addressed from the BOTTOM, so the horizon sits at 1 - this.
 */
const HORIZON_FROM_TOP = 0.523;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 horizonColor;
  uniform vec3 zenithColor;
  uniform float exponent;
  varying vec3 vWorldPosition;

  void main() {
    // Height above the viewer, normalised over the dome radius.
    float h = normalize(vWorldPosition).y;
    float t = pow(clamp(h, 0.0, 1.0), exponent);
    gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0);
  }
`;

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(DOME_RADIUS, 32, 20);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      horizonColor: { value: SKY_HORIZON.clone() },
      zenithColor: { value: SKY_ZENITH.clone() },
      exponent: { value: 0.62 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const dome = new THREE.Mesh(geometry, material);
  dome.name = "sky";
  dome.renderOrder = -2;   // behind the backdrop, and behind everything else
  return dome;
}

/**
 * The photographed horizon, wrapped around the world.
 *
 * An open cylinder rather than a dome: the image is a horizon strip, and
 * projecting a strip onto a sphere pinches it at the poles. A cylinder keeps
 * the skyline straight and level, which is what a distant horizon is.
 *
 * `repeat` copies it around the circumference. Four copies keep each one
 * about 400m wide, which is sharp enough at this distance; mirrored wrapping
 * turns the joins into reflections rather than seams.
 */
function createBackdrop({ anisotropy }) {
  const map = loadBackdropTexture("/backgroundimage.png", { anisotropy });
  map.repeat.set(4, 1);

  const geometry = new THREE.CylinderGeometry(
    BACKDROP_RADIUS, BACKDROP_RADIUS, BACKDROP_HEIGHT, 64, 1, true
  );

  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,       // the top of the sky fades into the dome
    side: THREE.BackSide,    // seen from inside
    depthWrite: false,       // never occlude anything
    fog: false,              // a painted backdrop is not in the fog
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "backdrop";
  mesh.renderOrder = -1;

  // Line the photographed skyline up with the ground plane. Cylinder v runs
  // 0 at the bottom to 1 at the top, so the horizon sits at 1 - 0.523.
  const horizonV = 1 - HORIZON_FROM_TOP;
  mesh.position.y = BACKDROP_HEIGHT * (0.5 - horizonV);

  return mesh;
}

/**
 * Build the atmosphere.
 *
 * @returns {{group: THREE.Group, sunDirection: THREE.Vector3,
 *            applyTo: Function, update: Function, dispose: Function}}
 */
export function createAtmosphere(options = {}) {
  const { anisotropy = 4 } = options;

  const group = new THREE.Group();
  group.name = "atmosphere";

  group.add(createSkyDome());
  group.add(createBackdrop({ anisotropy }));

  /** Direction the sun shines FROM, matching the sky's bright quarter. */
  const sunDirection = new THREE.Vector3(0.55, 0.62, 0.36).normalize();

  return {
    group,
    sunDirection,

    /** Set the scene's fog and clear colour to match the sky. */
    applyTo(scene) {
      scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), FOG_NEAR, FOG_FAR);
      scene.background = SKY_HORIZON.clone();
      scene.add(group);
    },

    /**
     * Kept in the interface, and deliberately empty.
     *
     * The drifting cloud domes are gone, so there is nothing to animate. The
     * render loop still calls this every frame; leaving the method here means
     * a future moving element -- a sun that tracks, a day cycle -- has an
     * obvious home, and the caller does not need changing twice.
     */
    update() {},

    dispose() {
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
    },
  };
}
