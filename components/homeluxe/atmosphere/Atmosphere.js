/**
 * Sky, clouds and fog.
 *
 * Three layers that have to agree with each other or the illusion breaks:
 *
 *   1. A sky DOME carrying a vertical gradient. Painted, not lit, so it never
 *      darkens when the sun moves.
 *   2. Two CLOUD DOMES inside it, drifting at different speeds.
 *   3. FOG whose colour matches the sky at the horizon.
 *
 * Clouds are domes rather than flat planes on purpose. A plane only shows
 * when you look up, and the default view of a house looks DOWN — so a plane
 * puts clouds exactly where nobody is looking, and its straight edge cuts
 * across the sky when they do. Domes put cloud across the whole sky
 * including the band just above the horizon, which is the part actually in
 * frame most of the time.
 *
 * The domes are flattened on Y so the texture is not pinched into a knot at
 * the zenith, which is the usual giveaway of a spherical cloud map.
 */

import * as THREE from "three";

import { createCloudTexture } from "../house/textures/proceduralTextures";

/** Sky colours, bottom to top. */
export const SKY_HORIZON = new THREE.Color(0xbcd2e8);
export const SKY_ZENITH = new THREE.Color(0x4a7fc1);

/**
 * Fog applies to scene geometry only -- the sky and cloud domes opt out.
 * It starts past the far side of the yard so nothing you are looking at is
 * washed out, and only softens the boundary fence at full zoom-out.
 */
const FOG_NEAR = 60;
const FOG_FAR = 320;

const DOME_RADIUS = 700;

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
  dome.renderOrder = -2;   // behind the clouds, and behind everything else
  return dome;
}

/**
 * One cloud dome.
 *
 * `speed` is in texture-units per second; because the texture tiles, a slow
 * constant offset reads as wind and never visibly repeats.
 *
 * `flatten` squashes the hemisphere toward a layer. Values near 1 give an
 * obvious dome with a pinched zenith; low values read as high cloud.
 */
function createCloudDome({ texture, radius, flatten, repeatU, repeatV,
                           opacity, speed }) {
  const map = texture.clone();
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatU, repeatV);

  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity,
    depthWrite: false,       // never occlude anything
    side: THREE.BackSide,    // seen from inside
    fog: false,              // the sky is not in the fog
  });

  // Upper hemisphere only; nothing below the horizon needs cloud.
  const geometry = new THREE.SphereGeometry(
    radius, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2
  );

  const dome = new THREE.Mesh(geometry, material);
  dome.scale.y = flatten;
  dome.renderOrder = -1;
  dome.userData.speed = speed;
  return dome;
}

/**
 * Build the atmosphere.
 *
 * @returns {{group: THREE.Group, sunDirection: THREE.Vector3,
 *            applyTo: Function, update: Function, dispose: Function}}
 */
export function createAtmosphere(options = {}) {
  const { cloudSeed = 1337, coverage = 0.46 } = options;

  const group = new THREE.Group();
  group.name = "atmosphere";

  group.add(createSkyDome());

  const cloudCanvas = createCloudTexture({ seed: cloudSeed, coverage });
  const base = new THREE.CanvasTexture(cloudCanvas);
  base.colorSpace = THREE.SRGBColorSpace;

  // Two domes at different radii and speeds: the parallax between them is
  // what stops the sky reading as a single sliding wallpaper.
  const layers = [
    createCloudDome({
      texture: base, radius: 620, flatten: 0.30,
      repeatU: 4, repeatV: 2, opacity: 0.80, speed: 0.0035,
    }),
    createCloudDome({
      texture: base, radius: 560, flatten: 0.22,
      repeatU: 2.4, repeatV: 1.2, opacity: 0.45, speed: 0.0016,
    }),
  ];
  layers.forEach((layer) => group.add(layer));

  // `base` is deliberately NOT disposed here. Each layer holds a clone, and
  // clones share the original's Source -- disposing it can free the GPU
  // texture out from under them. It is released by dispose() below.

  /** Direction the sun shines FROM, matching the sky's bright quarter. */
  const sunDirection = new THREE.Vector3(0.55, 0.62, 0.36).normalize();

  return {
    group,
    layers,
    sunDirection,

    /** Set the scene's fog and clear colour to match the sky. */
    applyTo(scene) {
      scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), FOG_NEAR, FOG_FAR);
      scene.background = SKY_HORIZON.clone();
      scene.add(group);
    },

    /** Drift the clouds. `delta` in seconds. */
    update(delta) {
      layers.forEach((layer) => {
        const { map } = layer.material;
        if (!map) return;
        map.offset.x += layer.userData.speed * delta;
        map.offset.y += layer.userData.speed * 0.35 * delta;
      });
    },

    dispose() {
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
      base.dispose();
    },
  };
}
