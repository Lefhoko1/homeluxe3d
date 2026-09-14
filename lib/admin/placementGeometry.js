/**
 * Where things stand, measured -- the geometry behind AI placement.
 *
 * WHY THIS EXISTS. An AI can decide that a decoder belongs on the TV stand, or
 * that a sofa should back onto the window wall and face the television. It is
 * not reliable at the millimetres: this house has already had a kitchen unit
 * stood across a 2,325mm sliding door, a console that jammed the front door at
 * 19 degrees, and a decoder left floating above its stand where it looked
 * seated from one side only. So the assistant does the deciding and this does
 * the measuring. Every candidate position is checked here before it reaches
 * the admin, and the result says exactly what is wrong, in millimetres.
 *
 * NOTHING HERE IS GENERATED OR STORED. It reads the same files the 3D view
 * already loads -- collision.json, doors.json, tour.json -- and the live
 * placements from the database, at the moment of asking. There is no second
 * copy of the house to fall out of step with the first.
 *
 * UNITS: plan millimetres. x grows east, y grows north, z is height above the
 * floor. The files store three.js metres with -z pointing north; that
 * conversion happens once, in `planRect` and `doorway`, and nowhere else.
 *
 * Pure functions, no browser and no network, so the API route and the tests
 * both import it directly.
 */

/** A person's radius, the same number the tour and the clearance test use. */
export const WALK_RADIUS_MM = 260;

/** Anything this low is walked over, not around: rugs, mats. */
export const STEP_OVER_MM = 120;

/** Anything starting this high is walked under. */
export const HEAD_MM = 2000;

/** How far off its surface something may sit before it reads as floating. */
const SIT_TOLERANCE_MM = 15;

/** A surface can hold something only if it is below, or at most this far above, its base. */
const SUPPORT_REACH_MM = 150;

/** Wall pieces this close to a room's edge count as that edge's wall. */
const WALL_NEAR_MM = 350;

/** Gaps in a wall shorter than this are pier joints, not openings. */
const OPENING_MIN_MM = 300;

/** Doors this close to a room are listed with it. */
const DOOR_NEAR_ROOM_MM = 400;

const round = (n) => Math.round(n);
const round2 = (n) => Math.round(n * 100) / 100;

/** A three.js [x0, z0, x1, z1] rectangle in metres, as plan millimetres. */
export function planRect([x0, z0, x1, z1]) {
  return { x0: x0 * 1000, x1: x1 * 1000, y0: -z1 * 1000, y1: -z0 * 1000 };
}

/**
 * The compass direction a product faces at a given rotation.
 *
 * At 0 the front faces north. The mapping from rotation.y to a direction is
 * (-sin, cos) in plan terms, which is why -90 is east and 90 is west -- the
 * opposite of what people guess, and the source of more than one sofa facing
 * the wall.
 */
export function facing(rotationDeg = 0) {
  const r = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const angle = ((Math.atan2(-Math.sin(r), Math.cos(r)) * 180) / Math.PI + 360) % 360;
  const names = [
    "north", "north-east", "east", "south-east",
    "south", "south-west", "west", "north-west",
  ];
  return names[Math.round(angle / 45) % 8];
}

/**
 * The floor area a product covers, as an axis-aligned rectangle.
 *
 * Width runs along the product's own left-right axis and depth front-to-back,
 * so at rotation 0 width is east-west. For angles that are not quarter turns
 * the rectangle is the bounding box of the turned footprint, which is slightly
 * generous -- the right direction to be wrong in for a clearance check.
 */
export function footprint({ x_mm, y_mm, rotation_deg = 0, width_mm, depth_mm, scale = 1 }) {
  const s = Number(scale) || 1;
  const hw = ((Number(width_mm) || 0) * s) / 2;
  const hd = ((Number(depth_mm) || 0) * s) / 2;
  const r = ((Number(rotation_deg) || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const sn = Math.abs(Math.sin(r));
  const ex = hw * c + hd * sn;
  const ey = hw * sn + hd * c;
  const x = Number(x_mm) || 0;
  const y = Number(y_mm) || 0;
  return { x0: x - ex, x1: x + ex, y0: y - ey, y1: y + ey };
}

function contains(rect, x, y) {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function area(rect) {
  return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
}

/** How far two rectangles overlap, along their shallower axis. 0 if they do not. */
function overlapMm(a, b) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
}

function pointRectGap(x, y, rect) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dy = Math.max(rect.y0 - y, 0, y - rect.y1);
  return Math.hypot(dx, dy);
}

function pointSegmentGap(px, py, [x0, y0, x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * Distance from a door opening to a footprint.
 *
 * Sampled along the footprint's edges rather than at its corners: a long sofa
 * lying across a short doorway has every corner far from it and the middle of
 * an edge sitting in it. An end of the opening inside the footprint is 0.
 */
function segmentRectGap(segment, rect) {
  const [x0, y0, x1, y1] = segment;
  if (contains(rect, x0, y0) || contains(rect, x1, y1)) return 0;
  let nearest = Infinity;
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const xs = rect.x0 + (rect.x1 - rect.x0) * t;
    const ys = rect.y0 + (rect.y1 - rect.y0) * t;
    nearest = Math.min(
      nearest,
      pointSegmentGap(xs, rect.y0, segment),
      pointSegmentGap(xs, rect.y1, segment),
      pointSegmentGap(rect.x0, ys, segment),
      pointSegmentGap(rect.x1, ys, segment),
    );
  }
  return nearest;
}

/** A door's opening as a line on the wall, in plan millimetres. */
function doorway(door) {
  const [ax, az] = door.along;
  let ends;
  if (door.motion === "swing") {
    const [hx, hz] = door.hinge;
    ends = [hx, hz, hx + ax * door.width_m, hz + az * door.width_m];
  } else {
    // A sash slides over a fixed panel: the opening is both of them.
    const [cx, cz] = door.centre;
    const half = (door.width_m + (door.travel_m ?? 0)) / 2;
    ends = [cx - ax * half, cz - az * half, cx + ax * half, cz + az * half];
  }
  const [a, b, c, d] = ends;
  return {
    label: door.label,
    motion: door.motion,
    exterior: Boolean(door.exterior),
    into: door.into ?? null,
    segment: [a * 1000, -b * 1000, c * 1000, -d * 1000],
  };
}

/** One live placement, with what it covers and how tall it stands. */
function itemFromRow(row) {
  const scale = Number(row.scale) || 1;
  const base = Number(row.z_mm) || 0;
  const height = (Number(row.height_mm) || 0) * scale;
  const transform = {
    x_mm: Number(row.x_mm),
    y_mm: Number(row.y_mm),
    rotation_deg: Number(row.rotation_deg) || 0,
    width_mm: row.width_mm,
    depth_mm: row.depth_mm,
    scale,
  };
  return {
    placementId: row.placement_id ?? null,
    name: row.product_name,
    category: row.category_code ?? null,
    ...transform,
    height_mm: height,
    z_base_mm: base,
    z_top_mm: base + height,
    footprint: footprint(transform),
    stepOver: base + height <= STEP_OVER_MM,
  };
}

/**
 * Everything a placement is measured against, read from what is live now.
 *
 * @param {object} sources
 * @param {object} sources.collision   public/models/house/collision.json
 * @param {object} sources.doors       public/models/house/doors.json
 * @param {object} [sources.tour]      public/models/tour/tour.json
 * @param {Array}  sources.placements  rows from v_live_placements
 */
export function buildHouse({ collision, doors, tour, placements = [] }) {
  return {
    rooms: (collision?.rooms ?? []).map((room) => ({
      code: room.room,
      label: room.label ?? room.room,
      type: room.type ?? null,
      ...planRect(room.rect),
    })),
    walls: (collision?.walls ?? []).map((wall) => ({
      name: `${wall.wall}/${wall.part}`,
      window: /sill/.test(wall.part ?? ""),
      ...planRect(wall.rect),
    })),
    doorways: (doors?.doors ?? []).map(doorway),
    waypoints: (tour?.waypoints ?? []).map((point, index) => ({
      index,
      x: point.position[0] * 1000,
      y: -point.position[1] * 1000,
    })),
    items: placements
      .filter((row) => row.model_url && row.x_mm != null && row.y_mm != null)
      .map(itemFromRow),
  };
}

/** The room a point is in. Where rooms share an edge, the smaller one wins. */
export function roomAt(house, x, y) {
  return (
    house.rooms
      .filter((room) => contains(room, x, y))
      .sort((a, b) => area(a) - area(b))[0] ?? null
  );
}

/** One line per room: enough to choose which one to look at. */
export function describeHouse(house) {
  return house.rooms.map((room) => ({
    code: room.code,
    label: room.label,
    type: room.type,
    x_mm: [round(room.x0), round(room.x1)],
    y_mm: [round(room.y0), round(room.y1)],
    size_mm: `${round(room.x1 - room.x0)} x ${round(room.y1 - room.y0)}`,
    items: house.items.filter((item) => contains(room, item.x_mm, item.y_mm)).length,
  }));
}

/**
 * What stands along one side of a room: solid wall, window, or open.
 *
 * Windows are reported separately from wall because a window is where a tall
 * unit must NOT go, and an open side is where the room runs into the next one.
 */
function sideOfRoom(house, room, side) {
  const horizontal = side === "north" || side === "south";
  const line =
    side === "north" ? room.y1 : side === "south" ? room.y0 : side === "east" ? room.x1 : room.x0;
  const lo = horizontal ? room.x0 : room.y0;
  const hi = horizontal ? room.x1 : room.y1;

  const pieces = house.walls
    .filter((wall) => {
      const [p0, p1] = horizontal ? [wall.y0, wall.y1] : [wall.x0, wall.x1];
      const [q0, q1] = horizontal ? [wall.x0, wall.x1] : [wall.y0, wall.y1];
      return p0 <= line + WALL_NEAR_MM && p1 >= line - WALL_NEAR_MM && q1 > lo && q0 < hi;
    })
    .map((wall) => ({
      window: wall.window,
      from: Math.max(horizontal ? wall.x0 : wall.y0, lo),
      to: Math.min(horizontal ? wall.x1 : wall.y1, hi),
    }))
    .filter((piece) => piece.to > piece.from)
    .sort((a, b) => a.from - b.from);

  const merge = (list) =>
    list.reduce((runs, piece) => {
      const last = runs[runs.length - 1];
      if (last && piece.from <= last.to + 20) last.to = Math.max(last.to, piece.to);
      else runs.push({ from: piece.from, to: piece.to });
      return runs;
    }, []);

  const solid = merge(pieces.filter((p) => !p.window));
  const windows = merge(pieces.filter((p) => p.window));
  const covered = merge([...pieces].sort((a, b) => a.from - b.from));

  const open = [];
  let cursor = lo;
  for (const run of covered) {
    if (run.from - cursor >= OPENING_MIN_MM) open.push({ from: cursor, to: run.from });
    cursor = Math.max(cursor, run.to);
  }
  if (hi - cursor >= OPENING_MIN_MM) open.push({ from: cursor, to: hi });

  const span = (run) => ({ from: round(run.from), to: round(run.to), length: round(run.to - run.from) });
  return {
    along: horizontal ? "x_mm" : "y_mm",
    at: round(line),
    solid_wall: solid.map(span),
    windows: windows.map(span),
    open: open.map(span),
  };
}

function describeItem(item) {
  return {
    placement_id: item.placementId,
    name: item.name,
    category: item.category,
    centre_mm: [round(item.x_mm), round(item.y_mm)],
    footprint_mm: {
      x: [round(item.footprint.x0), round(item.footprint.x1)],
      y: [round(item.footprint.y0), round(item.footprint.y1)],
    },
    z_base_mm: round(item.z_base_mm),
    z_top_mm: round(item.z_top_mm),
    rotation_deg: round2(item.rotation_deg),
    facing: facing(item.rotation_deg),
    walked_over: item.stepOver,
  };
}

/** Everything about one room that a placement decision needs. */
export function describeRoom(house, code) {
  const room = house.rooms.find((r) => r.code === code);
  if (!room) {
    return {
      error: `There is no room "${code}". Rooms: ${house.rooms.map((r) => r.code).join(", ")}.`,
    };
  }

  const near = {
    x0: room.x0 - 300, x1: room.x1 + 300, y0: room.y0 - 300, y1: room.y1 + 300,
  };
  const route = [];
  const seen = new Set();
  for (const point of house.waypoints) {
    if (!contains(near, point.x, point.y)) continue;
    const key = `${Math.round(point.x / 100)}:${Math.round(point.y / 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    route.push([round(point.x), round(point.y)]);
  }

  return {
    code: room.code,
    label: room.label,
    type: room.type,
    x_mm: [round(room.x0), round(room.x1)],
    y_mm: [round(room.y0), round(room.y1)],
    size_mm: { east_west: round(room.x1 - room.x0), north_south: round(room.y1 - room.y0) },
    sides: {
      north: sideOfRoom(house, room, "north"),
      south: sideOfRoom(house, room, "south"),
      east: sideOfRoom(house, room, "east"),
      west: sideOfRoom(house, room, "west"),
    },
    doors: house.doorways
      .filter((door) => segmentRectGap(door.segment, room) <= DOOR_NEAR_ROOM_MM)
      .map((door) => ({
        label: door.label,
        motion: door.motion,
        exterior: door.exterior,
        from_mm: [round(door.segment[0]), round(door.segment[1])],
        to_mm: [round(door.segment[2]), round(door.segment[3])],
      })),
    items: house.items.filter((item) => contains(room, item.x_mm, item.y_mm)).map(describeItem),
    walking_route_points_mm: route.slice(0, 40),
  };
}

/**
 * Measure one candidate position for a product.
 *
 * @param {object} house          from buildHouse
 * @param {object} args
 * @param {object} args.product   {name, width_mm, depth_mm, height_mm, room_types}
 * @param {object} args.transform {x_mm, y_mm, z_mm, rotation_deg, scale}
 * @param {string|null} [args.excludePlacementId]  the product's own saved row, when moving it
 */
export function checkPlacement(house, { product, transform, excludePlacementId = null }) {
  const scale = Number(transform.scale) || 1;
  const t = {
    x_mm: Number(transform.x_mm) || 0,
    y_mm: Number(transform.y_mm) || 0,
    rotation_deg: Number(transform.rotation_deg) || 0,
    width_mm: product.width_mm,
    depth_mm: product.depth_mm,
    scale,
  };
  const fp = footprint(t);
  const base = Number(transform.z_mm) || 0;
  const top = base + (Number(product.height_mm) || 0) * scale;
  const others = house.items.filter(
    (item) => !(excludePlacementId && item.placementId === excludePlacementId),
  );

  const issues = [];
  const notes = [];

  // -- the room, and whether the product may be in it --------------------
  const room = roomAt(house, t.x_mm, t.y_mm);
  if (!room) {
    issues.push({ kind: "outside", message: "Its centre is not inside any room." });
  } else if (
    Array.isArray(product.room_types) &&
    product.room_types.length &&
    room.type &&
    !product.room_types.includes(room.type)
  ) {
    issues.push({
      kind: "scope",
      message:
        `${product.name} is only allowed in ${product.room_types.join(", ")} rooms, and ` +
        `${room.label} is a ${room.type}. The database will refuse to save it there.`,
    });
  }

  // -- what it is sitting on ---------------------------------------------
  // The decoder problem. The highest surface under the product's centre that
  // is at or below its underside is what it stands on; anything else is the
  // floor. A gap is floating, a negative gap is sunk, and both come back with
  // the height that fixes them.
  let support = null;
  for (const item of others) {
    if (item.stepOver || !contains(item.footprint, t.x_mm, t.y_mm)) continue;
    if (item.z_top_mm > base + SUPPORT_REACH_MM) continue;
    if (!support || item.z_top_mm > support.z_top_mm) support = item;
  }
  const surface = support ? support.z_top_mm : 0;
  const gap = base - surface;
  const surfaceName = support ? `the top of ${support.name}` : "the floor";
  if (gap > SIT_TOLERANCE_MM) {
    issues.push({
      kind: "floating",
      mm: round(gap),
      message: `Floating ${round(gap)}mm above ${surfaceName}. Set z_mm to ${round(surface)}.`,
    });
  } else if (gap < -SIT_TOLERANCE_MM) {
    issues.push({
      kind: "sunk",
      mm: round(-gap),
      message: `Sunk ${round(-gap)}mm into ${surfaceName}. Set z_mm to ${round(surface)}.`,
    });
  }
  if (support) {
    const f = support.footprint;
    const over = Math.max(f.x0 - fp.x0, fp.x1 - f.x1, f.y0 - fp.y0, fp.y1 - f.y1, 0);
    if (over > 20) notes.push(`Overhangs the edge of ${support.name} by ${round(over)}mm.`);
  }

  // -- walls ----------------------------------------------------------------
  if (base < HEAD_MM) {
    const hits = house.walls
      .map((wall) => ({ wall, mm: overlapMm(fp, wall) }))
      .filter((hit) => hit.mm > 5)
      .sort((a, b) => b.mm - a.mm)
      .slice(0, 3);
    for (const { wall, mm } of hits) {
      issues.push({
        kind: "wall",
        mm: round(mm),
        message: `Goes ${round(mm)}mm into ${wall.window ? "the wall under a window" : "a wall"} (${wall.name}).`,
      });
    }
  }

  // -- other furniture ------------------------------------------------------
  // Only where they share height as well as floor: a decoder on a stand
  // shares the stand's footprint and not its height, and that is not a clash.
  for (const item of others) {
    if (item.stepOver) continue;
    const mm = overlapMm(fp, item.footprint);
    const vertical = Math.min(top, item.z_top_mm) - Math.max(base, item.z_base_mm);
    if (mm > 5 && vertical > 5) {
      issues.push({ kind: "furniture", mm: round(mm), message: `Overlaps ${item.name} by ${round(mm)}mm.` });
    }
  }

  // -- doorways and the walking route --------------------------------------
  // A standing object only. Something on top of other furniture cannot block
  // a path the furniture under it was not already blocking.
  if (base < HEAD_MM && top > STEP_OVER_MM && !support) {
    for (const door of house.doorways) {
      const clear = segmentRectGap(door.segment, fp);
      if (clear < WALK_RADIUS_MM) {
        issues.push({
          kind: "doorway",
          mm: round(clear),
          message:
            `Stands in the doorway ${door.label}: ${round(clear)}mm clear, ` +
            `a person needs ${WALK_RADIUS_MM}mm.`,
        });
      }
    }

    const blocked = house.waypoints
      .map((point) => pointRectGap(point.x, point.y, fp))
      .filter((clear) => clear < WALK_RADIUS_MM);
    if (blocked.length) {
      issues.push({
        kind: "walkway",
        mm: round(Math.min(...blocked)),
        message:
          `Blocks the visitors' walking route at ${blocked.length} point(s); the nearest ` +
          `is ${round(Math.min(...blocked))}mm away and a person needs ${WALK_RADIUS_MM}mm.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    room: room ? { code: room.code, label: room.label, type: room.type } : null,
    transform: {
      x_mm: round(t.x_mm),
      y_mm: round(t.y_mm),
      z_mm: round(base),
      rotation_deg: round2(t.rotation_deg),
      scale,
    },
    facing: facing(t.rotation_deg),
    footprint_mm: { x: [round(fp.x0), round(fp.x1)], y: [round(fp.y0), round(fp.y1)] },
    height_mm: { base: round(base), top: round(top) },
    sits_on: support ? support.name : "floor",
    surface_z_mm: round(surface),
    issues,
    notes,
  };
}
