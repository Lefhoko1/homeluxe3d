/**
 * Public surface of the house module.
 *
 * Consumers should import from here, not from the files inside -- it keeps
 * the internal layout free to change.
 */

export {
  loadHouse,
  setPartVisible,
  getPartVisibility,
  disposeHouse,
  getDracoLoader,
  disposeDracoLoader,
} from "./HouseLoader";

export {
  HOUSE_BASE_PATH,
  HOUSE_PARTS,
  SITE_BASE_PATH,
  SITE_PARTS,
  HOUSE_VIEWS,
  LIVING_ZONE_CENTRE,
} from "./houseConfig";

export {
  createHouseMaterials,
  disposeHouseMaterials,
} from "./textures/materialLibrary";

export { loadDoors, DOORS_MANIFEST_URL } from "./doors";
export { loadSlots, SLOTS_MANIFEST_URL } from "./slots";
