/**
 * Applying a shop's finish to a surface in the house.
 *
 * THE POINT: which product dresses which surface is DATA, not code.
 *
 * Blender bakes a surface name into the mesh -- `wall.living`, `floors.master`
 * -- and a finish product declares the material it supplies. A placement joins
 * the two. This module reads that join and rebuilds the surface's material to
 * look like the product.
 *
 * So "paint the bedroom sky-blue gamazine" is a row in `placements`, not an
 * edit here. An admin screen writing that row is all that stands between this
 * and a shop repainting the house itself.
 *
 * A surface with no placement keeps whatever Blender gave it, which is why the
 * house still looks finished before anyone has bought anything.
 */

import * as THREE from "three";

import {
  createDiamondMeshTexture,
  createGamazineTexture,
  createPaintTexture,
  createScreenWallTexture,
  createTilePhotoTexture,
  createTileTexture,
  toTexture,
} from "./proceduralTextures";

/**
 * How a product category is rendered.
 *
 * Keyed by the CATEGORY, so a new gamazine colour or a new paint brand needs
 * no entry -- only a genuinely new KIND of finish does.
 */
const RENDERERS = {
  paint: (spec, anisotropy) => {
    // Gamazine is a textured coating; ordinary paint is smooth. Both are
    // category `paint`, so the material name distinguishes them.
    const textured = /gamazine/i.test(spec.material ?? "");
    const canvas = textured
      ? createGamazineTexture({ base: spec.swatch ?? "#e8e2d4", seed: hash(spec.material) })
      : createPaintTexture({ base: spec.swatch ?? "#f2efe9", seed: hash(spec.material) });

    return new THREE.MeshStandardMaterial({
      name: spec.material,
      map: toTexture(canvas, { anisotropy }),
      roughness: textured ? 0.95 : 0.82,
      metalness: 0,
    });
  },

  /**
   * The boundary infill: diamond mesh, or a screen wall.
   *
   * ONE CATEGORY, TWO VERY DIFFERENT SURFACES, told apart the same way paint
   * tells gamazine from emulsion -- by the material name. They share a
   * category because they are the same PURCHASE (something to fill the bay
   * between two fence posts) and they fill the same slot; they share almost
   * nothing else, because one is four-fifths holes.
   *
   * ALPHA TEST RATHER THAN TRANSPARENCY. A chain-link panel is thousands of
   * small openings; drawn as a transparent material it would have to be
   * depth-sorted against everything behind it every frame, and the fence
   * would flicker in front of the pool. `alphaTest` cuts the holes out
   * before depth is written, so the mesh sorts like any solid object, costs
   * nothing, and casts a shadow with holes in it -- which is most of what
   * makes a wire fence look like one.
   *
   * DOUBLE SIDED, because a fence has two sides and the visitor walks past
   * both. A single-sided plane vanishes from the garden.
   */
  fencing: (spec, anisotropy) => {
    const solid = /screen|wall|precast|block/i.test(spec.material ?? "");

    if (solid) {
      return new THREE.MeshStandardMaterial({
        name: spec.material,
        map: toTexture(
          createScreenWallTexture({ base: spec.swatch ?? "#b6b2a9", seed: hash(spec.material) }),
          { anisotropy }
        ),
        roughness: 0.93,
        metalness: 0,
      });
    }

    // The aperture is the product: 25mm to 150mm, one inch to six.
    const apertureMm = Math.min(150, Math.max(25, spec.tileMm ?? 50));
    const canvas = createDiamondMeshTexture({
      apertureMm,
      wire: spec.swatch ?? "#b9bfc4",
      seed: hash(spec.material),
    });
    const map = toTexture(canvas, { anisotropy });
    // The canvas covers a whole number of DIAMONDS rather than a whole metre
    // -- 150mm does not divide 1000 -- so the repeat comes from how much of
    // a metre it actually drew. This is what puts the mesh at its true size.
    const perMetre = 1 / (canvas.metresPerTile || 0.42);

    map.repeat.set(perMetre, perMetre);

    return new THREE.MeshStandardMaterial({
      name: spec.material,
      map,
      transparent: false,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      // Galvanised steel: bright, but nothing like a mirror after a season.
      metalness: 0.72,
      roughness: 0.44,
    });
  },

  tile: (spec, anisotropy) => {
    // A photographed tile is laid at its real module; a described one is drawn.
    const tileMm = spec.tileMm ?? 600;
    const map = spec.texture
      ? createTilePhotoTexture(spec.texture, { tileMm, anisotropy })
      : toTexture(createTileTexture({ tileMm }), { anisotropy });
    const perMetre = 1000 / tileMm;
    map.repeat.set(perMetre, perMetre);

    return new THREE.MeshStandardMaterial({
      name: spec.material,
      map,
      roughness: 0.18,
      metalness: 0,
    });
  },
};

/** Stable seed from a material name, so a colour looks the same every load. */
function hash(text = "") {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

/**
 * Build a material for one finish placement.
 *
 * Returns null for a category with no renderer, which is deliberate: an
 * unknown finish leaves the surface as Blender built it rather than painting
 * it an arbitrary colour.
 */
export function buildFinishMaterial(spec, { anisotropy = 4 } = {}) {
  const renderer = RENDERERS[spec.category];
  if (!renderer) return null;
  try {
    return renderer(spec, anisotropy);
  } catch (error) {
    console.warn(`[finishes] could not build ${spec.material}:`, error?.message);
    return null;
  }
}

/**
 * Apply placed finishes to the house.
 *
 * `finishes` is a list of `{ surface, category, material, texture, swatch }`,
 * where `surface` is the material name Blender baked into the mesh and the
 * rest describe the product now dressing it.
 *
 * Walks the given roots and swaps the material of any mesh wearing `surface`.
 */
export function applyFinishes(roots, finishes, { anisotropy = 4 } = {}) {
  if (!finishes?.length) return { applied: 0, materials: [] };

  const bySurface = new Map();
  const built = [];

  finishes.forEach((spec) => {
    const surface = spec.surface ?? spec.material;
    if (!surface || bySurface.has(surface)) return;
    const material = buildFinishMaterial(spec, { anisotropy });
    if (material) {
      bySurface.set(surface, material);
      built.push(material);
    }
  });

  let applied = 0;
  roots.filter(Boolean).forEach((root) => {
    root.traverse((child) => {
      if (!child.isMesh) return;
      const replacement = bySurface.get(child.material?.name);
      if (replacement) {
        child.material = replacement;
        applied += 1;
      }
    });
  });

  return { applied, materials: built };
}
