/**
 * Loads shop products and places them in a house.
 *
 * Reads `catalog.json`, written by `blender/houseluxe/export/catalog_json.py`.
 * That manifest is the contract: it lists every shop, every product it sells,
 * and where each one stands in each house.
 *
 * Two consequences worth knowing:
 *
 *  - Each product is fetched ONCE and cloned per placement. Ten dining chairs
 *    are one download and one geometry.
 *  - Positions come from the manifest already converted to three.js space, so
 *    nothing here does coordinate maths. Move a sofa in the Blender placement
 *    file, rebuild, and it moves in the app — no code change.
 *
 * Every mesh carries `userData` naming its shop and product, so a click
 * anywhere on a sofa can be traced back to the thing being advertised.
 */

import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

import {
  fetchSceneCatalog,
  STATIC_CATALOG_URL,
} from "../../../lib/catalog/repository";

export const CATALOG_URL = STATIC_CATALOG_URL;

/**
 * Fetch the catalogue.
 *
 * Goes through the repository, so this reads from Supabase when a database is
 * configured and from the Blender-generated catalog.json when it is not. The
 * shape is identical either way, which is the whole point -- nothing below
 * this line knows or cares where the data came from.
 */
export async function fetchCatalog(scene = "3bed") {
  return fetchSceneCatalog({ scene });
}

/** Flatten the manifest's shops into a product lookup keyed by product id. */
export function indexProducts(catalog) {
  const byId = new Map();
  (catalog.shops ?? []).forEach((shop) => {
    (shop.products ?? []).forEach((product) => {
      byId.set(product.id, { ...product, shopName: shop.name });
    });
  });
  return byId;
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Tag every mesh with what it is and who sells it.
 *
 * This is what makes the scene shoppable: a raycast hit anywhere on the
 * geometry can name the product, its price and its shop without a lookup
 * table on the side.
 */
/**
 * Everything the advert panel shows, carried on the mesh itself -- so a
 * raycast hit needs no lookup to become an advert.
 *
 * Exported because this mapping is the contract between the catalogue and the
 * advert, and is worth testing without a browser.
 */
export function advertFor(product, placement) {
  return {
    productId: product.id,
    name: product.name,
    shop: product.shop,
    shopName: product.shopName,
    category: product.category,
    description: product.description,
    price: product.price,
    effectivePrice: product.effectivePrice ?? product.price,
    currency: product.currency,
    sku: product.sku,
    colour: product.colour,
    madeOf: product.madeOf,
    dimensions: product.dimensions,
    promotion: product.promotion ?? null,
    roomTypes: product.roomTypes ?? [],
    isActive: product.isActive !== false,
    // The pictures. Without these on the mesh, clicking a sofa in the 3D
    // scene produced an advert with no photograph even once the panel could
    // show one -- the panel reads what the raycast hands it, not the
    // catalogue.
    thumbnail: product.thumbnail ?? null,
    media: product.media ?? null,
    room: placement.room,
    placementId: placement.placementId,
    // Which row a save should update. A placement is edited; a variant is
    // what gets placed.
    variantId: placement.variantId ?? product.variantId ?? null,
    clickable: true,
  };
}

/**
 * Wrap a model so its origin is where the placement system expects it.
 *
 * Products built by blender/houseluxe already have their footprint centre on
 * the origin and their base on the floor. An uploaded .glb has whatever its
 * exporter left behind, so the correction measured at upload time is applied
 * here, as an offset on a wrapper Group.
 *
 * A wrapper rather than a baked offset because the transform gizmo, the
 * rotation and the saved coordinates all address the OUTER object -- so the
 * thing being rotated turns about its own centre, whatever the file says.
 */
export function anchored(scene, anchor) {
  if (!anchor || (!anchor.dx && !anchor.dy && !anchor.dz)) return scene;

  const pivot = new THREE.Group();
  scene.position.set(anchor.dx ?? 0, anchor.dy ?? 0, anchor.dz ?? 0);
  pivot.add(scene);
  return pivot;
}

function tag(root, product, placement) {
  const info = advertFor(product, placement);

  root.userData = { ...root.userData, ...info };
  root.traverse((child) => {
    if (child.isMesh) {
      child.userData = { ...child.userData, ...info };
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/**
 * Load every product placed in `house` and return them in one group.
 *
 * @returns {Promise<{group: THREE.Group, placed: Array, errors: Array,
 *                    catalog: object, products: Map}>}
 */
export async function loadProducts(options = {}) {
  const {
    house = "3bed",
    materials = null,
    dracoLoader = null,
  } = options;

  const group = new THREE.Group();
  group.name = "products";

  const errors = [];
  const placed = [];
  const inactive = [];

  let catalog;
  try {
    catalog = await fetchCatalog(house);
  } catch (error) {
    errors.push({ stage: "catalog", error });
    return { group, placed, errors, catalog: null, products: new Map() };
  }
  console.info(`[catalog] source: ${catalog.source ?? "static"}`);

  const products = indexProducts(catalog);

  // Skip anything that is not being advertised right now. A product whose
  // promotion has ended simply stops appearing in the house -- that is the
  // point of dating a special, and it must be enforced here as well as in
  // the database, because the static fallback has no policies.
  const allPlacements = catalog.houses?.[house] ?? [];
  const placements = allPlacements.filter((p) => {
    // Finishes are advertised but not PLACED -- they dress a surface the
    // house already has, and the texture is applied by the material library.
    // They still appear in the room lists; they just have nothing to load.
    // Kept in `placed` (the caller applies them to surfaces) but never
    // loaded as geometry -- a finish has no model.
    if (p.isFinish) {
      const product = products.get(p.product);
      if (product && product.isActive !== false) {
        placed.push({ ...p, product, isFinish: true });
      }
      return false;
    }

    const product = products.get(p.product);
    if (product && product.isActive === false) {
      inactive.push(p.product);
      return false;
    }
    return true;
  });

  if (!placements.length) {
    errors.push({
      stage: "placements",
      error: new Error(`no placements for house '${house}'`),
    });
  }

  const loader = new GLTFLoader();
  if (dracoLoader) loader.setDRACOLoader(dracoLoader);

  // One fetch per distinct product, however many times it is placed.
  const needed = [...new Set(placements.map((p) => p.product))];
  const scenes = new Map();

  await Promise.all(
    needed.map(async (productId) => {
      const product = products.get(productId);
      if (!product?.model) {
        errors.push({
          stage: "product",
          productId,
          error: new Error("not in catalogue, or has no model"),
        });
        return;
      }
      try {
        scenes.set(productId, await loadGltf(loader, product.model));
      } catch (error) {
        errors.push({ stage: "model", productId, error });
      }
    })
  );

  placements.forEach((placement) => {
    const source = scenes.get(placement.product);
    if (!source) return;

    const product = products.get(placement.product);
    // Clone so repeated placements share geometry but not transforms, then
    // apply the model's own anchor correction if it needs one.
    const instance = anchored(source.clone(true), product?.anchor);

    instance.position.fromArray(placement.position);
    instance.rotation.y = THREE.MathUtils.degToRad(placement.rotationY ?? 0);
    if (placement.scale && placement.scale !== 1) {
      instance.scale.setScalar(placement.scale);
    }
    instance.name = `${placement.product}@${placement.room}`;

    if (materials) applyMaterials(instance, materials);
    tag(instance, product, placement);

    group.add(instance);
    placed.push({ ...placement, product });
  });

  if (inactive.length) {
    console.info(
      `[products] ${inactive.length} not advertised (inactive or promotion ended):`,
      [...new Set(inactive)].join(', ')
    );
  }

  return { group, placed, errors, catalog, products, inactive };
}

/**
 * Swap glTF materials for the app's textured ones, matching on name.
 *
 * Same contract as the house: Blender names the surface, three.js decides
 * what it looks like. A product material with no override keeps whatever
 * Blender shipped.
 */
function applyMaterials(root, materials) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const override = materials.get(child.material?.name);
    if (override) child.material = override;
  });
}

/**
 * Load ONE model, for the admin placing something that is not in the scene
 * yet.
 *
 * Deliberately separate from `loadProducts`: that function's job is to build
 * the whole advertised scene from the manifest, and it would be the wrong
 * shape for "put this single thing in front of the camera". The two share
 * `anchored` and `tag`, which is where the actual contract lives.
 *
 * The returned object carries the same userData as anything else in the
 * scene, so it is clickable, selectable and shows an advert immediately --
 * before it has ever been saved.
 */
export async function loadOneProduct({
  modelUrl,
  anchor = null,
  advert = {},
  dracoLoader = null,
  materials = null,
}) {
  const loader = new GLTFLoader();
  if (dracoLoader) loader.setDRACOLoader(dracoLoader);

  const scene = await loadGltf(loader, modelUrl);
  const instance = anchored(scene, anchor);
  if (materials) applyMaterials(instance, materials);

  const info = { ...advert, clickable: true };
  instance.userData = { ...instance.userData, ...info };
  instance.traverse((child) => {
    if (child.isMesh) {
      child.userData = { ...child.userData, ...info };
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return instance;
}

/** Release product geometry. Materials are owned by the material library. */
export function disposeProducts(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.isMesh) child.geometry?.dispose();
  });
}
