/**
 * Three.js material library, keyed by BLENDER MATERIAL NAME.
 *
 * This is the seam between the two halves of the pipeline. Blender decides
 * which surfaces are brick and which are glass, and bakes those names into
 * the GLB. Three.js decides what brick and glass actually look like. Neither
 * side has to know about the other beyond the shared vocabulary of names.
 *
 * Practically: to retexture the house you edit this file only. To re-clad a
 * different surface in brick you change one material assignment in Blender.
 * Nothing needs re-exporting for a texture change.
 *
 * The names below must match `blender/houseluxe/materials/library.py`. Any
 * name present in a GLB but missing here keeps the material glTF shipped,
 * which is the flat Principled colour -- a visible but harmless fallback.
 */

import * as THREE from "three";

import {
  createBarkTexture,
  createBrickTexture,
  createBrickBumpTexture,
  createCarpetTexture,
  createConcreteTexture,
  createCorrugatedTexture,
  createFoliageTexture,
  createGrassTexture,
  createJuteTexture,
  createLeatherTexture,
  createMulchTexture,
  createPavingTexture,
  createPlasterTexture,
  createTilePhotoTexture,
  createTileTexture,
  createTimberTexture,
  toTexture,
} from "./proceduralTextures";
import { loadPhotoTexture } from "./photoTextures";

/**
 * Photographic finishes supplied by a shop.
 *
 * Keyed by the Blender material name, matching `Product.material` in the
 * catalogue — so the surface you see, the material in the .glb and the
 * product on sale all share one identifier.
 *
 * `tileMm` is the real tile module and sets the repeat, so the floor is to
 * scale rather than to taste.
 */
export const TILE_FINISHES = {
  // Tubod Enterprises PYC61001 Carrara polished porcelain, 600x600.
  tile_pyc61001: {
    url: "/textures/floor/pyc61001.jpg",
    tileMm: 600,
    groutMm: 3,
    grout: "#cfcdc8",
    roughness: 0.12,   // polished
    metalness: 0.0,
  },
};

/**
 * Build every house material.
 *
 * @param {object}  options
 * @param {number}  options.anisotropy  from renderer.capabilities.getMaxAnisotropy()
 * @returns {Map<string, THREE.Material>} keyed by Blender material name
 */
export function createHouseMaterials({ anisotropy = 4 } = {}) {
  const color = (canvas) => toTexture(canvas, { anisotropy, isColor: true });
  const data = (canvas) => toTexture(canvas, { anisotropy, isColor: false });

  const materials = new Map();

  // -- Structure ----------------------------------------------------------
  const brickBump = data(createBrickBumpTexture());
  materials.set(
    "brick_face",
    new THREE.MeshStandardMaterial({
      name: "brick_face",
      map: color(createBrickTexture()),
      bumpMap: brickBump,
      bumpScale: 0.4,
      roughness: 0.95,
      metalness: 0.0,
    })
  );

  materials.set(
    "concrete_slab",
    new THREE.MeshStandardMaterial({
      name: "concrete_slab",
      map: color(createConcreteTexture()),
      roughness: 0.9,
      metalness: 0.0,
    })
  );

  materials.set(
    "plaster_white",
    new THREE.MeshStandardMaterial({
      name: "plaster_white",
      map: color(createPlasterTexture()),
      roughness: 0.85,
      metalness: 0.0,
    })
  );

  materials.set(
    "ceiling_white",
    new THREE.MeshStandardMaterial({
      name: "ceiling_white",
      map: color(createPlasterTexture({ base: "#f2f1ee", seed: 43 })),
      roughness: 0.95,
      metalness: 0.0,
    })
  );

  // -- Roof ---------------------------------------------------------------
  // Lightened from the original near-black. The elevation schedule calls
  // this "Colorbond Dark Grey"; at metalness 0.55 the darker stops read as
  // black under a bright sky.
  materials.set(
    "roof_metal",
    new THREE.MeshStandardMaterial({
      name: "roof_metal",
      map: color(createCorrugatedTexture({ light: "#6e747d", dark: "#41464e" })),
      roughness: 0.55,
      metalness: 0.35,
    })
  );

  materials.set(
    "fascia_gutter",
    new THREE.MeshStandardMaterial({
      name: "fascia_gutter",
      color: 0x2b2f36,
      roughness: 0.45,
      metalness: 0.5,
    })
  );

  // -- Joinery ------------------------------------------------------------
  materials.set(
    "alu_dark",
    new THREE.MeshStandardMaterial({
      name: "alu_dark",
      color: 0x1b1e23,
      roughness: 0.35,
      metalness: 0.85,
    })
  );

  // Transmission gives real refraction through the glazing. It costs more
  // than a transparent MeshStandardMaterial, but there are only ~15 panes.
  materials.set(
    "glass",
    new THREE.MeshPhysicalMaterial({
      name: "glass",
      color: 0xcfe0e6,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.92,
      thickness: 0.02,
      ior: 1.5,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
  );

  materials.set(
    "timber_door",
    new THREE.MeshStandardMaterial({
      name: "timber_door",
      map: color(createTimberTexture({ base: "#4a2a16", boardMm: 300, seed: 13 })),
      roughness: 0.45,
      metalness: 0.0,
    })
  );

  materials.set(
    "door_painted",
    new THREE.MeshStandardMaterial({
      name: "door_painted",
      color: 0xece9e3,
      roughness: 0.6,
      metalness: 0.0,
    })
  );

  materials.set(
    "porch_column",
    new THREE.MeshStandardMaterial({
      name: "porch_column",
      map: color(createPlasterTexture({ base: "#efece5", seed: 47 })),
      roughness: 0.7,
      metalness: 0.0,
    })
  );

  // -- Floor finishes -----------------------------------------------------
  materials.set(
    "tile",
    new THREE.MeshStandardMaterial({
      name: "tile",
      map: color(createTileTexture()),
      roughness: 0.25,
      metalness: 0.0,
    })
  );

  materials.set(
    "carpet",
    new THREE.MeshStandardMaterial({
      name: "carpet",
      map: color(createCarpetTexture()),
      roughness: 1.0,
      metalness: 0.0,
    })
  );

  materials.set(
    "timber",
    new THREE.MeshStandardMaterial({
      name: "timber",
      map: color(createTimberTexture()),
      roughness: 0.4,
      metalness: 0.0,
    })
  );

  // -- Site / landscaping -------------------------------------------------
  // Names match `blender/houseluxe/materials/library.py`, same contract as
  // the house: Blender says what a surface is, this says what it looks like.
  // The lawn is a photograph, and it is NOT TILED.
  //
  // Tiled at 3m it was unusable: a photograph of a real lawn carries the same
  // blades, the same bare patch and the same bright corner in every copy, so
  // the eye finds the grid instantly however well the seams are levelled --
  // and levelling the seams is exactly what makes each copy identical.
  //
  // So one copy is stretched over the whole site. `fitLawnToYard` sets the
  // repeat and offset once the yard is loaded and its extent is known; until
  // then this is just an unfitted clamped texture. Resampled larger than the
  // other surfaces because it has thirty metres to cover rather than three.
  //
  // The drawn grass stays as the fallback if the file is missing -- a lawn
  // that is the wrong green beats a lawn that is white.
  materials.set(
    "lawn",
    new THREE.MeshStandardMaterial({
      name: "lawn",
      map: loadPhotoTexture("/lawnTexture.png", {
        metresPerTile: null,      // fitted, not tiled
        size: 2048,
        anisotropy,
        fallback: createGrassTexture(),
      }),
      roughness: 1.0,
      metalness: 0.0,
    })
  );

  // The ground beyond the property line. Flat colour, not the photograph:
  // stretching one copy across seven hundred metres would be a smear, and
  // tiling it there brings back the grid this whole change is removing. The
  // colour is the photograph's own mean once levelled, so the join at the
  // fence is a change of detail rather than a change of hue -- and the fog
  // has washed it halfway to sky by the time it is far enough to notice.
  materials.set(
    "far_ground",
    new THREE.MeshStandardMaterial({
      name: "far_ground",
      color: 0x51aa10,
      roughness: 1.0,
      metalness: 0.0,
    })
  );

  // -- Ceiling lights -----------------------------------------------------
  // The bezel is ordinary white plastic. The LENS is what sells it: an
  // emissive material glows regardless of the light falling on it, so the
  // fitting reads as switched on even though the point light beneath it
  // cannot illuminate the fitting it is inside.
  materials.set(
    "light_fitting",
    new THREE.MeshStandardMaterial({
      name: "light_fitting",
      color: 0xe6e9ee,
      roughness: 0.35,
      metalness: 0.1,
    })
  );

  materials.set(
    "light_lens",
    new THREE.MeshStandardMaterial({
      name: "light_lens",
      color: 0xffffff,
      emissive: 0xf4f7ff,      // the daylight colour from lights.json
      emissiveIntensity: 1.6,
      roughness: 0.9,
      metalness: 0.0,
      // Not lit by anything else: a lens that darkens when the sun moves off
      // it looks switched off.
      toneMapped: true,
    })
  );

  materials.set(
    "soil",
    new THREE.MeshStandardMaterial({
      name: "soil",
      map: color(createMulchTexture({ base: "#4a3423", seed: 99 })),
      roughness: 1.0,
    })
  );

  materials.set(
    "paving",
    new THREE.MeshStandardMaterial({
      name: "paving",
      map: color(createPavingTexture()),
      roughness: 0.8,
    })
  );

  materials.set(
    "paving_concrete",
    new THREE.MeshStandardMaterial({
      name: "paving_concrete",
      map: color(createPavingTexture({ base: "#9d9a92", joint: "#7c7972" })),
      roughness: 0.85,
    })
  );

  materials.set(
    "mulch",
    new THREE.MeshStandardMaterial({
      name: "mulch",
      map: color(createMulchTexture()),
      roughness: 1.0,
    })
  );

  materials.set(
    "coping",
    new THREE.MeshStandardMaterial({
      name: "coping",
      map: color(createPavingTexture({ base: "#ded9cf", joint: "#c3bdb2" })),
      roughness: 0.5,
    })
  );

  materials.set(
    "pool_tile",
    new THREE.MeshStandardMaterial({
      name: "pool_tile",
      map: color(createTileTexture({ base: "#2f83ad", grout: "#256a8d", tileMm: 250 })),
      roughness: 0.15,
      metalness: 0.0,
    })
  );

  // Water reads best as a smooth, lightly transparent surface over the
  // tiled shell -- the shell supplies the colour, this supplies the sheen.
  materials.set(
    "pool_water",
    new THREE.MeshPhysicalMaterial({
      name: "pool_water",
      color: 0x2f8fc4,
      roughness: 0.06,
      metalness: 0.0,
      transmission: 0.55,
      thickness: 0.4,
      ior: 1.33,
      transparent: true,
      opacity: 0.78,
    })
  );

  materials.set(
    "foliage",
    new THREE.MeshStandardMaterial({
      name: "foliage",
      map: color(createFoliageTexture()),
      roughness: 0.92,
    })
  );

  materials.set(
    "foliage_light",
    new THREE.MeshStandardMaterial({
      name: "foliage_light",
      map: color(createFoliageTexture({ base: "#3d6b28", seed: 93 })),
      roughness: 0.9,
    })
  );

  materials.set(
    "hedge",
    new THREE.MeshStandardMaterial({
      name: "hedge",
      map: color(createFoliageTexture({ base: "#22461a", seed: 95 })),
      roughness: 0.95,
    })
  );

  materials.set(
    "trunk",
    new THREE.MeshStandardMaterial({
      name: "trunk",
      map: color(createBarkTexture()),
      roughness: 0.9,
    })
  );

  materials.set(
    "fence_timber",
    new THREE.MeshStandardMaterial({
      name: "fence_timber",
      map: color(createTimberTexture({ base: "#6b4a2c", boardMm: 150, seed: 17 })),
      roughness: 0.85,
    })
  );

  // -- Shop-supplied photographic finishes --------------------------------
  // Built from real product images rather than drawn, and scaled to the tile's
  // true module so a 600mm tile measures 600mm on the floor.
  Object.entries(TILE_FINISHES).forEach(([name, spec]) => {
    const map = createTilePhotoTexture(spec.url, {
      tileMm: spec.tileMm,
      groutMm: spec.groutMm,
      grout: spec.grout,
      anisotropy,
    });
    // One canvas is one tile, so repeat is tiles-per-metre — unlike the
    // procedural textures, where one canvas is one square metre.
    const perMetre = 1000 / spec.tileMm;
    map.repeat.set(perMetre, perMetre);

    materials.set(
      name,
      new THREE.MeshStandardMaterial({
        name,
        map,
        roughness: spec.roughness ?? 0.2,
        metalness: spec.metalness ?? 0.0,
      })
    );
  });

  // -- Retail products ----------------------------------------------------
  materials.set(
    "leather_taupe",
    new THREE.MeshStandardMaterial({
      name: "leather_taupe",
      map: color(createLeatherTexture()),
      roughness: 0.55,
      metalness: 0.0,
    })
  );

  materials.set(
    "furniture_foot",
    new THREE.MeshStandardMaterial({
      name: "furniture_foot",
      color: 0x1b140e,
      roughness: 0.45,
    })
  );

  materials.set(
    "timber_dark",
    new THREE.MeshStandardMaterial({
      name: "timber_dark",
      map: color(createTimberTexture({ base: "#3a1f11", boardMm: 220, seed: 29 })),
      roughness: 0.35,
    })
  );

  materials.set(
    "cushion_teal",
    new THREE.MeshStandardMaterial({
      name: "cushion_teal",
      map: color(createCarpetTexture({ base: "#1a443f", seed: 51 })),
      roughness: 0.85,
    })
  );

  materials.set(
    "cushion_sage",
    new THREE.MeshStandardMaterial({
      name: "cushion_sage",
      map: color(createCarpetTexture({ base: "#5a6950", seed: 53 })),
      roughness: 0.85,
    })
  );

  materials.set(
    "jute",
    new THREE.MeshStandardMaterial({
      name: "jute",
      map: color(createJuteTexture()),
      roughness: 0.95,
    })
  );

  return materials;
}

/** Free every texture and material in a library. Call on unmount. */
export function disposeHouseMaterials(materials) {
  if (!materials) return;
  materials.forEach((material) => {
    ["map", "bumpMap", "normalMap", "roughnessMap"].forEach((slot) => {
      if (material[slot]) material[slot].dispose();
    });
    material.dispose();
  });
  materials.clear();
}
