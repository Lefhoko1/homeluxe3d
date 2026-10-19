/**
 * How the scene is lit.
 *
 * Pulled out of CanvasContainer, which had grown a `setupLighting` function at
 * the bottom doing five unrelated things. Lighting is its own concern: it is
 * tuned against the atmosphere's sun direction and against what the house
 * casts, and neither of those has anything to do with mounting a canvas.
 *
 * ---------------------------------------------------------------------------
 * WHY THE INTERIORS LOOKED FULL OF HOLES
 *
 * Three faults, compounding:
 *
 *  1. THE CEILING DID NOT CAST SHADOWS. That is the real one. The roof above
 *     blocked the sun and the ceiling below did not, so light poured through
 *     the ceiling plane and landed on the furniture. Fixed in houseConfig, not
 *     here, but it is the reason this file could be simplified.
 *
 *  2. THREE POINT LIGHTS were dropped into the middle of the house at fixed
 *     coordinates with a 9m range. They were there to stop the interiors going
 *     black once the roof was closed -- treating the symptom of (1). What they
 *     actually produced was three bright pools with dark ground between them,
 *     which reads as shadow even though a point light with castShadow off
 *     cannot cast one. They are gone.
 *
 *  3. THE SHADOW MAP covered the whole 30x40 yard at 2048 pixels: 2.5cm per
 *     texel, and the bias had to be opened up to 30mm of normal offset to stop
 *     that self-shadowing. At that setting a shadow detaches from whatever
 *     casts it, and small things -- a coffee table leg, a sofa arm -- shadow
 *     themselves in patches.
 *
 * ---------------------------------------------------------------------------
 * WHAT LIGHTS THE INSIDE NOW
 *
 * The hemisphere light, which is not occluded by geometry. That is the point:
 * once the ceiling casts properly, direct sun cannot reach an interior at all,
 * and something has to. A hemisphere light is the cheapest honest stand-in for
 * skylight bouncing in through the windows -- no shadow pass, no position, and
 * it cannot leave pools on the floor.
 */

import * as THREE from "three";

/** Shadow frustum half-width, metres. Covers the house and its near yard. */
const SHADOW_EXTENT = 26;

/**
 * Shadow map size.
 *
 * 4096 over a 52m frustum is 1.3cm per texel -- fine enough to keep a chair
 * leg's shadow attached to the leg, which 2048 was not. It costs about 64MB
 * of depth buffer, which is the single most expensive thing in this scene and
 * is spent deliberately.
 */
const SHADOW_MAP = 4096;

export function createLighting({ sunDirection } = {}) {
  const group = new THREE.Group();
  group.name = "lighting";

  // -- Ambient ------------------------------------------------------------
  // Sky above, ground bounce below. Unoccluded, so it reaches interiors --
  // this is what makes a room readable once its ceiling stops the sun.
  const hemisphere = new THREE.HemisphereLight(0xd3e6f7, 0x7d8468, 1.3);
  group.add(hemisphere);

  // A flat floor of light so nothing is ever pure black. Kept moderate:
  // raise this instead of the hemisphere and everything goes flat and chalky.
  group.add(new THREE.AmbientLight(0xffffff, 0.35));

  // -- Interior daylight --------------------------------------------------
  //
  // The problem this solves: once the ceiling casts shadows -- which it must,
  // or the sun pours through it -- NO direct light reaches an interior at
  // all. Physically right, and it left the furniture dim and shapeless. A
  // sofa lit only by ambient has no form; you cannot see that a cushion is a
  // cushion.
  //
  // The fix is not more point lights. Those were what made the interiors
  // blotchy in the first place: a lamp with a 9m range leaves a bright pool
  // and a dark edge, and moving the furniture moves the pools.
  //
  // These are two DIRECTIONAL lights with castShadow OFF. A directional light
  // reaches everywhere -- through the ceiling, since it casts nothing -- and
  // gives every surface shading that depends only on which way it faces. So a
  // sofa gets a lit top, a shaded front and a readable edge, in every room,
  // with no pools and nothing to keep in step with the layout.
  //
  // Aimed to agree with the sun rather than fight it, so an interior looks
  // like the same time of day as the garden.
  const keyDirection = (sunDirection ?? new THREE.Vector3(0.55, 0.62, 0.36))
    .clone().normalize();

  // NOTE ON THE BUDGET. These reach outdoors too, so the sun below was
  // brought down from 2.1 to 1.7 and the old cool fill removed entirely --
  // `interiorBounce` does that job now. Without rebalancing, adding two more
  // lights to a scene already carrying four blows the lawn out to white
  // under ACES.
  const interiorKey = new THREE.DirectionalLight(0xfff6ea, 0.8);
  interiorKey.position.copy(keyDirection).multiplyScalar(30);
  group.add(interiorKey);

  // Opposite and above, so the side facing away from the key is modelled
  // rather than black. This is also the scene's cool fill.
  const interiorBounce = new THREE.DirectionalLight(0xa9c8e8, 0.4);
  interiorBounce.position.set(
    -keyDirection.x * 30, 24, -keyDirection.z * 30
  );
  group.add(interiorBounce);

  // -- The sun ------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.7);
  sun.position.copy(sunDirection ?? new THREE.Vector3(0.55, 0.62, 0.36))
     .multiplyScalar(60);
  sun.castShadow = true;

  const shadow = sun.shadow;
  shadow.camera.left = -SHADOW_EXTENT;
  shadow.camera.right = SHADOW_EXTENT;
  shadow.camera.top = SHADOW_EXTENT;
  shadow.camera.bottom = -SHADOW_EXTENT;
  shadow.camera.near = 1;
  shadow.camera.far = 180;
  shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);

  // Bias pair, tuned to the texel size above.
  //
  // `bias` fights acne on surfaces facing the light; `normalBias` pushes the
  // sample along the surface normal and fights it on surfaces at a glancing
  // angle. Normal bias is the one that matters here because a house is mostly
  // vertical walls under a high sun -- but every millimetre of it also
  // detaches contact shadows, so it is kept to 12mm now that the finer map
  // no longer needs 30.
  shadow.bias = -0.0004;
  shadow.normalBias = 0.012;

  group.add(sun);
  group.add(sun.target);

  // The old cool fill light lived here. `interiorBounce` above replaced it:
  // same job -- keeping the shadowed side blue-grey rather than dead -- and
  // keeping both would have been paying twice for one effect.

  return {
    group,
    sun,

    /** Add to a scene. */
    applyTo(scene) {
      scene.add(group);
      return this;
    },

    /**
     * Keep the shadow frustum centred on what is being looked at.
     *
     * A directional light's shadow map covers a fixed box in world space. The
     * box here is 52m across, which is the whole property -- so this is a
     * no-op for the overview and only earns its keep when the camera is
     * somewhere far from the origin. Called from the render loop.
     */
    follow(target) {
      if (!target) return;
      sun.target.position.set(target.x, 0, target.z);
      sun.position.copy(sunDirection ?? new THREE.Vector3(0.55, 0.62, 0.36))
         .multiplyScalar(60)
         .add(new THREE.Vector3(target.x, 0, target.z));
    },

    dispose() {
      sun.shadow?.map?.dispose();
      group.clear();
    },
  };
}

export default createLighting;
