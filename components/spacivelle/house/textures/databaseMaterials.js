/**
 * Surfaces textured from the database rather than from this repository.
 *
 * THE ONE PHOTOGRAPH IN THE HOUSE USED TO BE A CONSTANT:
 *
 *     tile_pyc61001: { url: "/textures/floor/pyc61001.jpg", tileMm: 600 }
 *
 * A real tile, from a real shop, committed to the repo and shipped in the
 * bundle. Which meant a shop supplying a photograph of their product was a
 * code change, a review and a deploy -- for a JPEG. `material_maps` has
 * existed since migration 0008 for exactly this and had never held a row,
 * because there was no way to put one there.
 *
 * Now there is. A material with an albedo map is drawn from the photograph;
 * one without is drawn by the procedure it always was. Both paths stay, and
 * that is the point -- the house has to look finished before anybody has
 * uploaded anything, which is what the procedural library is for.
 *
 * KEYED BY THE BLENDER MATERIAL NAME, like everything else in this folder.
 * Blender decides which surfaces are tile and which are paint and bakes those
 * names into the GLB; the database decides what tile looks like today. Neither
 * side knows about the other beyond the shared vocabulary of names.
 */

import * as THREE from "three";

/**
 * The maps, and what three.js calls each one.
 *
 * `metalness` and `roughness` maps are read from their own channel here
 * rather than packed into one texture. Packing is the right thing for a
 * shipped game and the wrong thing for an upload form: a shop supplies the
 * four files their texture vendor gave them, and asking them to combine
 * channels first is asking them not to bother.
 */
const CHANNELS = {
  albedo: "map",
  normal: "normalMap",
  roughness: "roughnessMap",
  metallic: "metalnessMap",
  ao: "aoMap",
  height: "bumpMap",
  opacity: "alphaMap",
};

/**
 * Colour maps are colour; everything else is data.
 *
 * Getting this wrong is the classic PBR mistake and it does not look like an
 * error -- it looks like a slightly wrong surface. A roughness map decoded as
 * sRGB is gamma-corrected data, so the shine lands in the wrong places and
 * the floor reads as plastic.
 */
const COLOUR_MAPS = new Set(["albedo"]);

/**
 * Read every material the database knows about.
 *
 * Returns [] when there is no database, which is not a fallback -- it means
 * "nothing has been uploaded", and the procedural library draws the house
 * exactly as it did before. A FAILED query is different and says so.
 */
export async function loadMaterialFinishes(supabase) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("v_material_finishes")
    .select("code, name, renderer, tile_width_mm, tile_height_mm, base_colour, roughness, metallic, maps");

  if (error) {
    // Loud, and then carry on with the procedural house. A missing texture is
    // a worse house; a blank one is no house at all.
    console.error(
      "[materials] could not read v_material_finishes, surfaces stay procedural:",
      error.message
    );
    return [];
  }
  return data ?? [];
}

/**
 * Build a three.js material from a row of `v_material_finishes`.
 *
 * Returns null when there is nothing photographic to build from, so the
 * caller leaves the surface alone rather than replacing a good procedural
 * material with a flat colour.
 */
export function buildDatabaseMaterial(finish, { publicUrl, anisotropy = 4 }) {
  const paths = finish.maps ?? {};
  if (!paths.albedo) return null;

  const loader = new THREE.TextureLoader();
  const material = new THREE.MeshStandardMaterial({
    name: finish.code,
    roughness: Number(finish.roughness ?? 0.7),
    metalness: Number(finish.metallic ?? 0),
  });

  // How many times the photograph repeats across a metre. A tile
  // photographed at 600mm has to be laid at 600mm or the floor is a lie --
  // this is the same number the tile is sold by.
  const tileMm = Number(finish.tile_width_mm ?? 0);
  const repeat = tileMm > 0 ? 1000 / tileMm : 1;

  let loaded = 0;
  for (const [type, path] of Object.entries(paths)) {
    const channel = CHANNELS[type];
    if (!channel || !path) continue;

    const texture = loader.load(publicUrl(path));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = anisotropy;
    if (COLOUR_MAPS.has(type)) texture.colorSpace = THREE.SRGBColorSpace;

    material[channel] = texture;
    loaded += 1;
  }

  // An ambient occlusion map is sampled from the SECOND uv set, which most
  // exported meshes do not have. Without this the map is silently ignored,
  // which is the sort of thing you spend an afternoon on.
  if (material.aoMap) material.aoMapIntensity = 1;

  material.needsUpdate = true;
  return loaded > 0 ? material : null;
}

/**
 * Swap in every database-supplied material the house is wearing.
 *
 * Walks the given roots once and replaces the material of any mesh whose
 * material name matches a code with maps. Meshes wearing anything else are
 * untouched, so the procedural house shows through wherever nothing has been
 * supplied.
 *
 * @returns {{applied: number, materials: THREE.Material[], codes: string[]}}
 */
export function applyDatabaseMaterials(roots, finishes, { publicUrl, anisotropy = 4 } = {}) {
  const usable = (finishes ?? []).filter((f) => f.maps && f.maps.albedo);
  if (!usable.length) return { applied: 0, materials: [], codes: [] };

  const built = new Map();
  for (const finish of usable) {
    try {
      const material = buildDatabaseMaterial(finish, { publicUrl, anisotropy });
      if (material) built.set(finish.code, material);
    } catch (error) {
      console.warn(`[materials] could not build ${finish.code}:`, error?.message);
    }
  }
  if (!built.size) return { applied: 0, materials: [], codes: [] };

  let applied = 0;
  const used = new Set();

  for (const root of roots ?? []) {
    root?.traverse?.((child) => {
      if (!child.isMesh) return;
      // A mesh can carry several materials, one per group. Both shapes are
      // handled, because the house has both.
      const current = child.material;
      if (Array.isArray(current)) {
        const next = current.map((m) => {
          const replacement = built.get(m?.name);
          if (replacement) { used.add(m.name); applied += 1; return replacement; }
          return m;
        });
        child.material = next;
      } else if (current && built.has(current.name)) {
        used.add(current.name);
        child.material = built.get(current.name);
        applied += 1;
      }
    });
  }

  // Anything built and never worn is a material somebody uploaded a texture
  // for that no surface in the house uses -- almost always a code that does
  // not match what Blender baked in. Worth saying; it is invisible otherwise.
  const orphans = [...built.keys()].filter((code) => !used.has(code));
  if (orphans.length) {
    console.warn(
      `[materials] ${orphans.length} uploaded texture(s) match no surface in the house:`,
      orphans.join(", "),
      "-- check the material code against the Blender material name."
    );
  }

  return { applied, materials: [...built.values()], codes: [...used] };
}

/** Free the textures when the scene goes away. */
export function disposeDatabaseMaterials(materials = []) {
  for (const material of materials) {
    for (const channel of Object.values(CHANNELS)) {
      material[channel]?.dispose?.();
    }
    material.dispose?.();
  }
}
