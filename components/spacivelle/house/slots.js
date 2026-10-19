/**
 * Showing the empty slots.
 *
 * A slot is the thing being SOLD, and until now it could only be described. A
 * shop being offered "a position on the kitchen appliance run" has no way to
 * judge it; a shop shown the box it would fill, in the room, at the size it
 * would be, does.
 *
 * DRAWN IN THE BROWSER, NOT BUILT IN BLENDER, and that is deliberate for two
 * reasons. It is a view of the inventory rather than part of the house, so it
 * belongs to the thing doing the viewing -- and it is temporary, so it has to
 * be removable by not drawing it rather than by a rebuild and a re-export.
 *
 * OCCUPIED SLOTS ARE NOT DRAWN. A marker over a sofa hides the sofa and
 * teaches nobody anything; the point of a marker is that the position is
 * EMPTY. Which slots are taken comes from the catalogue, so the markers thin
 * out by themselves as the house fills up.
 *
 * The box sits ON the slot: `position` is the base, not the centre, because a
 * product stands on a worktop rather than floating through it.
 */

import * as THREE from "three";

export const SLOTS_MANIFEST_URL = "/models/house/slots.json";

/**
 * Colour by what the slot is for, so a glance reads as an inventory map
 * rather than as a room full of identical boxes.
 */
const TINTS = {
  floor_surface: 0x4f7fb5,
  wall_surface: 0x7d6fb0,
  ceiling_light: 0xd8a53c,
  default: 0x2f9e78,
};

/** Surfaces are drawn as a thin sheet, not a room-filling block. */
const SURFACE_TYPES = new Set(["floor_surface", "wall_surface"]);

export async function loadSlots(house, url = SLOTS_MANIFEST_URL) {
  if (!house) return null;

  let manifest;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.warn("[slots] no manifest:", error.message);
    return null;
  }

  const entries = manifest.slots ?? [];
  const group = new THREE.Group();
  group.name = "slot-markers";
  group.visible = false;          // off until somebody asks for it

  // One material per tint, shared. A hundred markers is a hundred draw calls
  // either way, but not a hundred materials.
  const materials = new Map();
  const materialFor = (type) => {
    const key = TINTS[type] !== undefined ? type : "default";
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        name: `slot_${key}`,
        color: TINTS[key],
        transparent: true,
        opacity: 0.28,
        roughness: 0.9,
        // Both sides: you are as likely to be standing inside a slot's
        // envelope as outside it, and a one-sided box vanishes when you are.
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
    }
    return materials.get(key);
  };

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55,
  });

  const markers = [];

  entries.forEach((entry) => {
    const [w, h, d] = entry.size;
    const surface = SURFACE_TYPES.has(entry.type);
    // A wall surface drawn at its true height fills the room and hides
    // everything in it; a floor drawn at 10mm is invisible. Both are shown as
    // a readable sheet instead of their literal envelope.
    const box = surface
      ? new THREE.BoxGeometry(w, entry.type === "wall_surface" ? 0.04 : 0.02, d)
      : new THREE.BoxGeometry(w, h, d);

    const mesh = new THREE.Mesh(box, materialFor(entry.type));
    // `position` is the BASE of the slot, so the box is lifted by half its
    // own height to stand on it rather than straddle it.
    const lift = surface ? 0.01 : h / 2;
    mesh.position.set(
      entry.position[0], entry.position[1] + lift, entry.position[2]
    );
    mesh.rotation.y = THREE.MathUtils.degToRad(entry.rotationY ?? 0);
    mesh.renderOrder = 2;

    // The wireframe is what makes a translucent box legible against a
    // translucent box behind it.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box), edgeMaterial
    );
    mesh.add(edges);

    // Everything the panel needs to describe the position, carried on the
    // mesh so a raycast needs no lookup -- the same contract the products use.
    mesh.userData = {
      slotId: entry.id,
      slotType: entry.type,
      slotLabel: entry.label,
      room: entry.room,
      roomLabel: entry.roomLabel,
      category: entry.category,
      priority: entry.priority,
      sizeMm: [Math.round(w * 1000), Math.round(h * 1000), Math.round(d * 1000)],
      isSlot: true,
    };

    group.add(mesh);
    markers.push({ mesh, entry });
  });

  house.add(group);
  console.info(`[slots] ${markers.length} advertising position(s) available to show`);

  return {
    group,

    get count() {
      return markers.length;
    },

    get visible() {
      return group.visible;
    },

    /** Every slot, house-local, as the manifest wrote them. */
    entries() {
      return entries;
    },

    /**
     * Every slot in WORLD metres.
     *
     * The markers are children of the house group, so their own positions are
     * house-local and correct as they are. The tour is not: the character
     * lives in the scene, and everything it aims at -- the route, the walls,
     * the door hinges -- carries the recentring offset. Converting here keeps
     * the showcase working in one space instead of being handed two.
     */
    worldEntries() {
      const dx = house.position?.x ?? 0;
      const dz = house.position?.z ?? 0;
      return entries.map((entry) => ({
        ...entry,
        position: [
          entry.position[0] + dx, entry.position[1], entry.position[2] + dz,
        ],
      }));
    },

    /**
     * Hide the markers for positions that already hold something.
     *
     * Matched on ROOM AND TYPE rather than on a slot id, because the
     * placements in this house predate the slot inventory and carry no id
     * yet. It is a coarse match -- one sofa hides one sofa marker in that
     * room -- and it is honest about being one: as placements gain slot ids
     * this becomes an exact lookup and nothing else changes.
     */
    hideOccupied(placements = []) {
      const taken = new Map();
      placements.forEach((p) => {
        if (!p.room) return;
        const key = `${p.room}`;
        taken.set(key, (taken.get(key) ?? 0) + 1);
      });

      let hidden = 0;
      const used = new Map();
      markers.forEach(({ mesh, entry }) => {
        if (SURFACE_TYPES.has(entry.type)) return;
        const budget = taken.get(entry.room) ?? 0;
        const spent = used.get(entry.room) ?? 0;
        if (spent < budget) {
          mesh.visible = false;
          used.set(entry.room, spent + 1);
          hidden += 1;
        } else {
          mesh.visible = true;
        }
      });
      return hidden;
    },

    setVisible(on) {
      group.visible = Boolean(on);
    },

    toggle() {
      group.visible = !group.visible;
      return group.visible;
    },

    dispose() {
      group.traverse((child) => {
        if (child.isMesh || child.isLineSegments) child.geometry?.dispose();
      });
      materials.forEach((m) => m.dispose());
      edgeMaterial.dispose();
      group.clear();
    },
  };
}
