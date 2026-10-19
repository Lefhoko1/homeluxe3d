/**
 * Real lights in the rooms.
 *
 * The Blender build puts a fitting in every room's ceiling and writes down
 * where it put them. This hangs an actual light under each one.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A POOL AND NOT SIXTEEN LIGHTS
 *
 * There are sixteen fittings. In a forward renderer -- which is what three.js
 * uses by default -- every light is compiled into every material's shader and
 * evaluated for every fragment, whether or not it can possibly reach it. A
 * bathroom downlight still costs a calculation on the far side of the garden.
 * Sixteen of them roughly triples the fragment cost of the whole scene, which
 * a phone notices immediately.
 *
 * So there are six lights, and they are MOVED to whichever fittings are
 * nearest the camera. Each has a 6.5m range, and rooms in this house are 2-4m
 * across, so the ones being skipped could not have reached the viewer anyway:
 * the picture is the same and the shader is a third of the size.
 *
 * ---------------------------------------------------------------------------
 * DAYLIGHT, NOT LAMPLIGHT
 *
 * About 5000K. Warm light is pleasant in a photograph of a lounge and wrong
 * here, because it tints the merchandise -- a sofa advertised as grey has to
 * look grey. The colour comes from the manifest so it is one decision in one
 * place rather than a hex code repeated per light.
 */

import * as THREE from "three";

export const LIGHTS_MANIFEST_URL = "/models/house/lights.json";

/**
 * How many lights exist at once.
 *
 * Six covers the room you are in and its neighbours. Raising this is the
 * first thing to try if a doorway ever looks unlit from the far side, and the
 * first thing to lower if the scene is slow.
 */
const POOL_SIZE = 6;

/** How often the pool is re-pointed, in seconds. */
const REASSIGN_EVERY = 0.25;

export class RoomLights {
  constructor(fittings, { colour = 0xf4f7ff } = {}) {
    this.fittings = fittings;
    this.group = new THREE.Group();
    this.group.name = "room_lights";

    this.pool = [];
    for (let i = 0; i < Math.min(POOL_SIZE, fittings.length); i += 1) {
      // Decay 2 is physically correct falloff; `distance` cuts it off so a
      // bedroom light cannot wash across the hall.
      const light = new THREE.PointLight(colour, 0, 6.5, 2);
      light.castShadow = false;   // sixteen shadow maps is not a trade worth making
      this.pool.push(light);
      this.group.add(light);
    }

    this.since = REASSIGN_EVERY;   // assign on the first update
    this.probe = new THREE.Vector3();
  }

  /**
   * Point the pool at the fittings nearest the camera.
   *
   * `delta` in seconds. Re-pointing every frame would sort sixteen items
   * sixty times a second to change nothing; a quarter of a second is far
   * faster than anyone can walk between rooms.
   */
  update(delta, camera) {
    if (!camera || !this.pool.length) return;

    this.since += delta;
    if (this.since < REASSIGN_EVERY) return;
    this.since = 0;

    // Distance in the light's own parent frame, which is the house group --
    // so the camera's world position has to come back into it.
    this.group.parent?.updateMatrixWorld();
    this.probe.copy(camera.position);
    if (this.group.parent) this.group.parent.worldToLocal(this.probe);

    const ranked = this.fittings
      .map((fitting, index) => ({
        index,
        d: (fitting.position[0] - this.probe.x) ** 2 +
           (fitting.position[2] - this.probe.z) ** 2,
      }))
      .sort((a, b) => a.d - b.d);

    this.pool.forEach((light, slot) => {
      const chosen = ranked[slot];
      if (!chosen) {
        light.intensity = 0;
        return;
      }
      const fitting = this.fittings[chosen.index];
      light.position.fromArray(fitting.position);
      light.intensity = fitting.intensity;
      light.distance = fitting.distance ?? 6.5;
    });
  }

  dispose() {
    this.pool.forEach((light) => light.dispose?.());
    this.group.clear();
  }
}

/**
 * Load the manifest and build the pool.
 *
 * A CHILD of the house group, like the fittings themselves: that group
 * carries the recentring offset and the manifest is in its frame.
 *
 * Returns null when there is no manifest, which leaves the house lit by the
 * hemisphere and the sun as it was before -- dimmer, but not broken.
 */
export async function addRoomLights(house, url = LIGHTS_MANIFEST_URL) {
  if (!house) return null;

  let manifest;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.warn("[lights] no fitting manifest:", error.message);
    return null;
  }

  const fittings = manifest?.lights ?? [];
  if (!fittings.length) return null;

  const lights = new RoomLights(fittings, {
    colour: new THREE.Color(manifest.colour ?? "#f4f7ff"),
  });

  house.add(lights.group);
  console.info(
    `[lights] ${fittings.length} fitting(s), ${lights.pool.length} live at a time`
  );
  return lights;
}
