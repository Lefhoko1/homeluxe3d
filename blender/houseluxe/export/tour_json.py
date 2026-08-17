"""The guided tour route.

A visitor should be able to press one button and be walked through the whole
house -- every room, in an order that makes sense, stopping long enough in
each to look at what is being advertised there.

THE ROUTE IS COMPUTED, NOT TYPED. Waypoints written by hand go stale the
moment a wall moves, and the failure is silent: the character walks into a
wall and stops, and nobody notices until someone takes the tour. So this
solves for a path over the actual plan -- the same walls, the same door
openings -- and any route it returns is walkable by construction.

HOW IT WORKS

1. Rasterise the plan onto a grid. A cell is blocked if it is within
   (wall thickness / 2 + shoulder clearance) of any wall.

2. Punch the openings back out. A door, doorway or sliding door is a real gap
   in the geometry -- that is how this house is built -- so its cells are
   cleared. A WINDOW is not: it has a sill, and you cannot walk through it.

3. Breadth-first search between consecutive stops. BFS on a uniform grid
   gives the shortest path in cells, which is all that is wanted here.

4. Straighten the result. Raw BFS output staircases along diagonals; a
   line-of-sight pass collapses each run to its endpoints, so the character
   walks in straight lines and turns at corners like a person.

The output is millimetres in the plan's own frame, converted to three.js
metres exactly as `trees.json` and `catalog.json` are, so nothing downstream
does axis maths.
"""

from __future__ import annotations

import json
import math
import os
from collections import deque

from ..config.plan import OpeningKind

#: Grid resolution. 100mm resolves an 820mm doorway into eight cells, which is
#: plenty to find the middle of it, and keeps a 13x11m house under 15k cells.
CELL = 100.0

#: How far a route is kept from a wall, in millimetres.
#:
#: Set by `build_manifest`, which tries these in order and keeps the FIRST
#: that can still reach every room. Bigger is better -- a route hugging a wall
#: looks like a machine following a wall -- but this house is tight: 110mm
#: internal walls and 770mm doors, so 380mm leaves a 10mm gap through a
#: bathroom door and cuts the master bedroom, its ensuite and the robe off
#: from the rest of the house entirely.
#:
#: Solving for it rather than picking one means a plan change cannot silently
#: strand a room. It gets reported instead.
CLEARANCE = 280.0

CLEARANCE_LADDER = (380.0, 340.0, 300.0, 280.0, 250.0, 220.0, 200.0, 170.0)

#: Openings you can walk through. A window has a sill and is not one of them.
WALKABLE_OPENINGS = {
    OpeningKind.DOOR_INTERNAL,
    OpeningKind.DOOR_EXTERNAL,
    OpeningKind.DOORWAY,
    OpeningKind.SLIDING_DOOR,
}


class Grid:
    """Blocked/free occupancy over the plan's bounding box."""

    def __init__(self, x0: float, y0: float, x1: float, y1: float):
        self.x0, self.y0 = x0, y0
        self.nx = int(math.ceil((x1 - x0) / CELL)) + 1
        self.ny = int(math.ceil((y1 - y0) / CELL)) + 1
        self.blocked = bytearray(self.nx * self.ny)
        #: Cells inside a door opening. Tracked because a route may not turn
        #: while it is in one -- see `_door_anchors`.
        self.doors: set[tuple[int, int]] = set()

    def index(self, ix: int, iy: int) -> int:
        return iy * self.nx + ix

    def to_cell(self, x: float, y: float) -> tuple[int, int]:
        return (
            min(self.nx - 1, max(0, int(round((x - self.x0) / CELL)))),
            min(self.ny - 1, max(0, int(round((y - self.y0) / CELL)))),
        )

    def to_mm(self, ix: int, iy: int) -> tuple[float, float]:
        return (self.x0 + ix * CELL, self.y0 + iy * CELL)

    def is_free(self, ix: int, iy: int) -> bool:
        if ix < 0 or iy < 0 or ix >= self.nx or iy >= self.ny:
            return False
        return not self.blocked[self.index(ix, iy)]

    def paint(self, x0, y0, x1, y1, value: int) -> None:
        """Set every cell overlapping an axis-aligned rectangle."""
        ax, ay = self.to_cell(min(x0, x1), min(y0, y1))
        bx, by = self.to_cell(max(x0, x1), max(y0, y1))
        for iy in range(ay, by + 1):
            row = iy * self.nx
            for ix in range(ax, bx + 1):
                self.blocked[row + ix] = value


def _wall_rect(wall, pad: float) -> tuple[float, float, float, float]:
    """The wall's footprint, grown by `pad` ACROSS it but not along it.

    Padding a wall's ends as well as its faces plugs the gaps between walls.
    The master bedroom, its ensuite and the robe were all unreachable for
    exactly that reason: the padded end of the bedroom's east wall met the
    padded end of its north wall, and the 110mm gap between the hall and the
    circulation zone -- which is a real opening, not a wall -- disappeared
    under the two of them.

    Across the wall the clearance is real: it is the shoulder room a walker
    needs. Along it there is nothing to clear, because the wall has stopped.
    """
    (sx, sy), (ex, ey) = wall.start, wall.end
    half = wall.thickness / 2.0
    across = half + pad

    if wall.is_horizontal:
        px, py = half, across
    elif wall.is_vertical:
        px, py = across, half
    else:
        # Not axis-aligned: no cheap correct answer, so keep the safe one.
        px = py = across

    return (
        min(sx, ex) - px, min(sy, ey) - py,
        max(sx, ex) + px, max(sy, ey) + py,
    )


def _opening_rect(wall, opening, pad: float) -> tuple[float, float, float, float]:
    """The clear gap an opening leaves, in plan coordinates.

    Narrowed by `pad` along the wall so the route aims at the MIDDLE of a
    doorway rather than clipping its reveal, and widened across the wall so
    the gap punches right through the padded band.
    """
    (sx, sy), (ex, ey) = wall.start, wall.end
    length = math.hypot(ex - sx, ey - sy)
    if length <= 0:
        return (0.0, 0.0, 0.0, 0.0)

    ux, uy = (ex - sx) / length, (ey - sy) / length

    # CLAMP TO THE WALL. Several openings in this plan run off the end of the
    # wall they are declared on -- the servery is 2400 wide at offset 1800 on
    # a 3600 wall, so it claims 600mm of nothing. Unclamped, the gap is punched
    # into whatever is beyond, which is usually the wall that meets this one.
    start = max(0.0, opening.offset)
    end = min(length, opening.offset + opening.width)
    if end <= start:
        return (0.0, 0.0, 0.0, 0.0)

    a = start + pad
    b = end - pad
    if b <= a:                      # opening narrower than twice the pad
        a = b = (start + end) / 2.0

    ax, ay = sx + ux * a, sy + uy * a
    bx, by = sx + ux * b, sy + uy * b

    through = wall.thickness / 2.0 + CLEARANCE + CELL
    # Perpendicular to the wall.
    px, py = -uy * through, ux * through

    xs = [ax + px, ax - px, bx + px, bx - px]
    ys = [ay + py, ay - py, by + py, by - py]
    return (min(xs), min(ys), max(xs), max(ys))


def _opening_core(wall, opening) -> tuple[float, float, float, float]:
    """The gap an opening leaves in its own wall's SOLID body.

    Unlike `_opening_rect` this reaches only through the wall's thickness, not
    into the clearance band -- it exists to reopen a doorway after the wall
    cores are repainted, without reopening anything else.
    """
    (sx, sy), (ex, ey) = wall.start, wall.end
    length = math.hypot(ex - sx, ey - sy)
    if length <= 0:
        return (0.0, 0.0, 0.0, 0.0)

    ux, uy = (ex - sx) / length, (ey - sy) / length
    start = max(0.0, opening.offset)
    end = min(length, opening.offset + opening.width)
    if end <= start:
        return (0.0, 0.0, 0.0, 0.0)

    ax, ay = sx + ux * start, sy + uy * start
    bx, by = sx + ux * end, sy + uy * end

    through = wall.thickness / 2.0 + CELL
    px, py = -uy * through, ux * through

    xs = [ax + px, ax - px, bx + px, bx - px]
    ys = [ay + py, ay - py, by + py, by - py]
    return (min(xs), min(ys), max(xs), max(ys))


def _furniture_rect(item, pad: float) -> tuple[float, float, float, float]:
    """A placed product's footprint, grown by `pad`.

    Rotation is quarter-turns in practice, so a 90 or 270 degree placement
    simply swaps width and depth. Anything else is treated as its own bounding
    square, which is conservative -- it may keep the route slightly further
    from a diagonally-placed chair than it strictly needs to.
    """
    turn = round((item.get("rotation", 0.0) % 180.0) / 90.0)
    width = item.get("width", 0.0)
    depth = item.get("depth", 0.0)
    if turn == 1:
        width, depth = depth, width
    elif abs((item.get("rotation", 0.0) % 90.0)) > 1.0:
        width = depth = max(width, depth)

    hx = width / 2.0 + pad
    hy = depth / 2.0 + pad
    x, y = item["x"], item["y"]
    return (x - hx, y - hy, x + hx, y + hy)


def build_grid(plan, furniture=()) -> Grid:
    """Occupancy for the whole plan: walls blocked, doorways open.

    `furniture` is blocked too. THE ROUTE HAS TO KNOW ABOUT THE FURNITURE
    because the walk collides with it: the living room's stop is its
    geometric centre, and the coffee table is placed within 200mm of that, so
    a route solved from walls alone sends the character to stand inside it and
    the tour stops there. Blocking the footprints moves the stop to somewhere
    a person could actually stand.
    """
    xs = [c for w in plan.walls for c in (w.start[0], w.end[0])]
    ys = [c for w in plan.walls for c in (w.start[1], w.end[1])]
    margin = 2000.0
    grid = Grid(min(xs) - margin, min(ys) - margin,
                max(xs) + margin, max(ys) + margin)

    for wall in plan.walls:
        grid.paint(*_wall_rect(wall, CLEARANCE), 1)

    # Openings AFTER every wall, or a wall drawn later re-blocks a doorway
    # its neighbour had already opened -- which is exactly what happens where
    # two walls meet at a door reveal.
    for wall in plan.walls:
        for opening in wall.openings:
            if opening.kind not in WALKABLE_OPENINGS:
                continue
            rect = _opening_rect(wall, opening, CLEARANCE * 0.5)
            grid.paint(*rect, 0)

            ax, ay = grid.to_cell(rect[0], rect[1])
            bx, by = grid.to_cell(rect[2], rect[3])
            for iy in range(ay, by + 1):
                for ix in range(ax, bx + 1):
                    grid.doors.add((ix, iy))

    # PUT THE WALLS BACK.
    #
    # An opening has to be punched deeper than its own wall is thick, or the
    # clearance band either side of the wall seals the gap again. That depth
    # is the problem: where two walls meet, one wall's doorway punch reaches
    # into the BODY of the other. The servery is 455mm deep and the kitchen's
    # east wall is 250mm away, so the route was handed a hole through a wall
    # with no opening in it -- and the tour walked into it and stopped, every
    # time, just after the kitchen.
    #
    # So every wall's solid core is repainted afterwards, and then only its
    # OWN openings are cleared from it. A punch can no longer open anything
    # but the wall it belongs to.
    for wall in plan.walls:
        grid.paint(*_wall_rect(wall, 0.0), 1)

    for wall in plan.walls:
        for opening in wall.openings:
            if opening.kind not in WALKABLE_OPENINGS:
                continue
            grid.paint(*_opening_core(wall, opening), 0)

    # Furniture last, and never over a doorway: a sofa is not a door, but a
    # rug placed across a threshold should not seal the room off either.
    #
    # FULL clearance, not a fraction of it. At 0.6 the route ran within 180mm
    # of a sofa while the walk's obstacle ray reached 300mm, so the character
    # was stopped by furniture the route considered cleared -- the same
    # mistake as padding walls less than the ray reaches, and it stuck the
    # tour in the kitchen.
    for item in furniture:
        grid.paint(*_furniture_rect(item, CLEARANCE), 1)
    for cell in grid.doors:
        if 0 <= cell[0] < grid.nx and 0 <= cell[1] < grid.ny:
            grid.blocked[grid.index(*cell)] = 0

    return grid


def nearest_free(grid: Grid, x: float, y: float, radius: int = 24):
    """The closest walkable cell to a point, or None.

    Room centres are usually free, but a small room whose centre is inside the
    padded band around its own walls -- a 1.1m WC, say -- would otherwise have
    no reachable stop at all.
    """
    cx, cy = grid.to_cell(x, y)
    if grid.is_free(cx, cy):
        return (cx, cy)

    for r in range(1, radius + 1):
        best = None
        best_d = None
        for iy in range(cy - r, cy + r + 1):
            for ix in range(cx - r, cx + r + 1):
                if max(abs(ix - cx), abs(iy - cy)) != r:
                    continue
                if not grid.is_free(ix, iy):
                    continue
                d = (ix - cx) ** 2 + (iy - cy) ** 2
                if best_d is None or d < best_d:
                    best, best_d = (ix, iy), d
        if best:
            return best
    return None


def bfs(grid: Grid, start, goal):
    """Shortest cell path from start to goal, or None."""
    if start == goal:
        return [start]

    came = {start: None}
    queue = deque([start])
    # 8-connected: a house has diagonal routes across rooms, and restricting
    # to 4 makes the character walk in visible right angles across open floor.
    steps = ((1, 0), (-1, 0), (0, 1), (0, -1),
             (1, 1), (1, -1), (-1, 1), (-1, -1))

    while queue:
        cell = queue.popleft()
        if cell == goal:
            break
        cx, cy = cell
        for dx, dy in steps:
            nxt = (cx + dx, cy + dy)
            if nxt in came or not grid.is_free(*nxt):
                continue
            # No cutting corners diagonally through a doorway jamb.
            if dx and dy and not (grid.is_free(cx + dx, cy) and grid.is_free(cx, cy + dy)):
                continue
            came[nxt] = cell
            queue.append(nxt)

    if goal not in came:
        return None

    path = []
    cell = goal
    while cell is not None:
        path.append(cell)
        cell = came[cell]
    path.reverse()
    return path


def _clear_line(grid: Grid, a, b) -> bool:
    """Is every cell on the straight line between two cells free?

    Sampled at HALF-CELL steps. Stepping cell by cell can hop diagonally over
    the corner of a blocked cell and call the line clear when a walker
    following it would clip that corner -- which is how a leg through a door
    reveal survives this check and then jams the walk.
    """
    (x0, y0), (x1, y1) = a, b
    steps = max(abs(x1 - x0), abs(y1 - y0)) * 4
    if steps == 0:
        return True
    for i in range(steps + 1):
        t = i / steps
        ix = int(round(x0 + (x1 - x0) * t))
        iy = int(round(y0 + (y1 - y0) * t))
        if not grid.is_free(ix, iy):
            return False
    return True


#: How far either side of a doorway the route must run straight, in cells.
DOOR_RUN = 7      # 700mm


def _door_anchors(grid: Grid, path) -> set[int]:
    """Path indices that must survive straightening, because of doorways.

    A GEOMETRICALLY CLEAR LINE IS NOT ALWAYS A WALKABLE ONE. The straightener
    only asks whether the cells between two points are free, and a line that
    enters a door and immediately turns 55 degrees for the room beyond passes
    that test -- the corner it cuts happens to be free. But the character is
    not a point: it turns first and then walks, so it makes that turn WHILE
    STANDING IN THE DOORWAY, and the new heading takes it straight into the
    jamb. The front door stalled the whole tour this way.

    So a run through a door is pinned: the cell before entering and the cell
    after leaving are kept, which forces the crossing to be a straight
    perpendicular segment with the turns safely inside the rooms.
    """
    anchors = set()
    inside = False
    for i, cell in enumerate(path):
        here = cell in grid.doors
        if here and not inside:
            # About to enter: pin a point back inside the room behind.
            anchors.add(max(0, i - DOOR_RUN))
        elif inside and not here:
            # Just left: pin a point inside the room ahead.
            anchors.add(min(len(path) - 1, i + DOOR_RUN))
        inside = here
    return anchors


def straighten(grid: Grid, path):
    """Collapse a staircase into the fewest straight runs that still fit.

    BFS returns a cell-by-cell path that zigzags along every diagonal. Walked
    literally it looks like a machine following a grid. Keeping only the
    corners makes the character cross a room in one line and turn once.
    """
    if len(path) < 3:
        return list(path)

    forced = _door_anchors(grid, path)

    out = [path[0]]
    anchor = 0
    for i in range(2, len(path)):
        if i - 1 in forced:
            out.append(path[i - 1])
            anchor = i - 1
        elif not _clear_line(grid, path[anchor], path[i]):
            out.append(path[i - 1])
            anchor = i - 1
    out.append(path[-1])
    return out


#: How far in front of the front door the tour begins, in millimetres.
APPROACH = 2600.0


def _approach_cell(grid: Grid, plan):
    """A walkable point outside the front door.

    Found rather than typed: the external door is located in the plan, and the
    approach is placed along the wall's outward normal. Which side is outward
    is decided by whichever is further from the middle of the building, so
    this works for a door on any wall without a hardcoded compass direction.
    """
    door = None
    for wall in plan.walls:
        if not wall.exterior:
            continue
        for opening in wall.openings:
            if opening.kind is OpeningKind.DOOR_EXTERNAL:
                door = (wall, opening)
                break
        if door:
            break

    if door is None:
        return None

    wall, opening = door
    (sx, sy), (ex, ey) = wall.start, wall.end
    length = math.hypot(ex - sx, ey - sy)
    if length <= 0:
        return None

    ux, uy = (ex - sx) / length, (ey - sy) / length
    along = opening.offset + opening.width / 2.0
    dx, dy = sx + ux * along, sy + uy * along

    # Wall normal, pointed away from the centre of the plan.
    nx, ny = -uy, ux
    cx = sum(r.x0 + r.x1 for r in plan.rooms) / (2 * len(plan.rooms))
    cy = sum(r.y0 + r.y1 for r in plan.rooms) / (2 * len(plan.rooms))
    if (dx - cx) * nx + (dy - cy) * ny < 0:
        nx, ny = -nx, -ny

    return nearest_free(grid, dx + nx * APPROACH, dy + ny * APPROACH)


def _solve(plan, order, clearance, furniture=()):
    """Grid and stops at one clearance, plus how many stops link up."""
    global CLEARANCE
    CLEARANCE = clearance

    grid = build_grid(plan, furniture)
    rooms = {room.name: room for room in plan.rooms}

    stops = []
    for name in order:
        room = rooms.get(name)
        if room is None:
            continue
        cx = (room.x0 + room.x1) / 2.0
        cy = (room.y0 + room.y1) / 2.0
        cell = nearest_free(grid, cx, cy)
        if cell is None:
            continue
        stops.append({"room": name, "label": room.label, "cell": cell})

    linked = sum(
        1 for i in range(1, len(stops))
        if bfs(grid, stops[i - 1]["cell"], stops[i]["cell"]) is not None
    )
    return grid, stops, linked


#: Seconds paused in each room.
#:
#: Long enough to actually look. Three seconds was chosen as "a pause" and is
#: not one: the visitor arrives, the room name appears, and they are moving
#: again before they have found what is in it.
#:
#: This is also the DENOMINATOR OF THE LOOK-AROUND SPEED. The character
#: spends the whole pause sweeping its heading across the room, so the pause
#: length and SURVEY_ARC in components/homeluxe/tour/TourController.js decide
#: between them how fast the view turns. 6s gave about 40 degrees a second and
#: 9s about 20; both read as the camera being swung rather than someone
#: looking. 10s with a narrower arc gives about 13. Change one, check the
#: other.
DWELL = 10.0


def build_manifest(plan, order=None, dwell: float = DWELL, furniture=()) -> dict:
    """Solve the whole tour.

    `order` is the list of room names to visit, in order. It is a DESIGNED
    route rather than a shortest-path solve -- the point is a sensible tour of
    a home, which is not the travelling-salesman answer.

    Clearance is solved for, widest first: a route that keeps its distance
    from the walls looks like a person walking, one that hugs them looks like
    a machine following them. See CLEARANCE_LADDER.
    """
    order = order or [r.name for r in plan.rooms]

    grid = stops = None
    clearance = CLEARANCE_LADDER[-1]
    for candidate in CLEARANCE_LADDER:
        grid, stops, linked = _solve(plan, order, candidate, furniture)
        if stops and linked == len(stops) - 1:
            clearance = candidate
            break
    else:
        # Nothing linked everything: keep the most permissive attempt and let
        # the unreachable list below say which rooms were stranded.
        grid, stops, _ = _solve(plan, order, CLEARANCE_LADDER[-1], furniture)

    # THE TOUR STARTS OUTSIDE. The visitor is dropped on the driveway, and
    # every stop is indoors, so without an approach the character sets off
    # towards the living room and walks into the front of the house. Routing
    # from a point in front of the door means the first thing the tour does is
    # what a visitor does: walk up and go in.
    approach = _approach_cell(grid, plan)
    if approach:
        stops.insert(0, {"room": None, "label": "Front door", "cell": approach})

    waypoints = []
    unreachable = []

    for i, stop in enumerate(stops):
        if i == 0:
            waypoints.append({**_point(grid, stop["cell"]),
                              "room": stop["room"], "label": stop["label"],
                              "dwell": dwell})
            continue

        legs = bfs(grid, stops[i - 1]["cell"], stop["cell"])
        if legs is None:
            unreachable.append(stop["room"])
            continue

        legs = straighten(grid, legs)
        # Drop the first cell: it is the previous stop, already recorded.
        for cell in legs[1:-1]:
            waypoints.append({**_point(grid, cell), "dwell": 0.0})
        waypoints.append({**_point(grid, legs[-1]),
                          "room": stop["room"], "label": stop["label"],
                          "dwell": dwell})

    return {
        "version": 1,
        "scene": plan.name,
        "clearance_mm": clearance,
        "waypoints": _drop_tiny_hops(grid, waypoints),
        "stops": [w["label"] for w in waypoints if w.get("label")],
        "unreachable": unreachable,
    }


#: Below this, a waypoint is not a corner -- it is grid noise.
MIN_HOP = 0.35


def _drop_tiny_hops(grid: Grid, waypoints):
    """Remove waypoints too close to the one before to be worth walking.

    The straightener works in whole cells, so it leaves 100-300mm stubs where
    a run changes direction. Walked literally each one is a stop, a turn and a
    start, which reads as a stumble. Stops are always kept: those are the
    point of the tour.

    A DROPPED POINT MUST NOT OPEN A LEG THROUGH A WALL. A stub is often the
    corner that takes the path round a door reveal, and removing it leaves a
    straight line from before the corner to after it -- straight through the
    jamb. Three legs of this house's route did exactly that. So each removal
    is checked against the grid, and refused if it is not still clear.
    """
    out = []
    for point in waypoints:
        if out and not point.get("label") and not _near_door(grid, point):
            ax, az = out[-1]["position"]
            bx, bz = point["position"]
            if math.hypot(bx - ax, bz - az) < MIN_HOP:
                continue
        out.append(point)
    return _verify_legs(grid, out)


def _near_door(grid: Grid, point) -> bool:
    """Is this waypoint in or beside a doorway?

    Such points are the ones that keep a door crossing straight, so they are
    never dropped as stubs -- see `_door_anchors`.
    """
    cx, cy = grid.to_cell(point["position"][0] * 1000, -point["position"][1] * 1000)
    # Two cells, not DOOR_RUN: this only has to protect the pinned points
    # themselves, and a wider net keeps every grid stub near a door.
    for iy in range(cy - 2, cy + 3):
        for ix in range(cx - 2, cx + 3):
            if (ix, iy) in grid.doors:
                return True
    return False


def _verify_legs(grid: Grid, waypoints):
    """Reinstate any leg that is not a clear straight line.

    Belt and braces over the pass above: whatever simplification happened
    earlier, the walk can only follow straight lines between consecutive
    points, so every one of them has to be clear. A leg that is not gets its
    midpoint put back, recursively, until it is.
    """
    out = [waypoints[0]] if waypoints else []

    for point in waypoints[1:]:
        a = grid.to_cell(out[-1]["position"][0] * 1000, -out[-1]["position"][1] * 1000)
        b = grid.to_cell(point["position"][0] * 1000, -point["position"][1] * 1000)

        if not _clear_line(grid, a, b):
            legs = bfs(grid, a, b)
            if legs:
                for cell in straighten(grid, legs)[1:-1]:
                    out.append({**_point(grid, cell), "dwell": 0.0})
        out.append(point)

    return out


def _point(grid: Grid, cell) -> dict:
    """A cell as a three.js position, house-local metres, y left to the walk."""
    x_mm, y_mm = grid.to_mm(*cell)
    return {"position": [x_mm / 1000.0, -y_mm / 1000.0]}


def verify(plan, manifest: dict, furniture=()) -> list[str]:
    """Check every leg against the TRUE geometry, not the padded grid.

    THIS IS THE GUARANTEE THE WALK RELIES ON. While following a route the
    controller no longer tests the walls at all -- it cannot, because a ray
    from a point and a padded 2D grid disagree about what "clear" means, and
    every attempt to reconcile them moved where the tour stuck rather than
    removing it. Instead the route is asserted walkable here, once, against
    the real wall and furniture footprints with no padding at all.

    So this is not a nicety. If it ever fails, the tour walks into a wall.
    """
    global CLEARANCE
    remembered = CLEARANCE
    try:
        CLEARANCE = 1.0                     # ~no padding: true footprints
        solid = build_grid(plan, furniture)
    finally:
        CLEARANCE = remembered

    def free(x_m, z_m):
        return solid.is_free(*solid.to_cell(x_m * 1000.0, -z_m * 1000.0))

    problems = []
    points = manifest.get("waypoints", [])

    for i, point in enumerate(points):
        if not free(*point["position"]):
            problems.append(f"waypoint {i} stands inside geometry")

    for i in range(1, len(points)):
        ax, az = points[i - 1]["position"]
        bx, bz = points[i]["position"]
        steps = max(2, int(math.hypot(bx - ax, bz - az) / 0.02))
        for k in range(steps + 1):
            t = k / steps
            if not free(ax + (bx - ax) * t, az + (bz - az) * t):
                problems.append(f"leg {i - 1}->{i} passes through geometry")
                break

    return problems


def write_manifest(plan, path: str, order=None, furniture=()) -> dict:
    manifest = build_manifest(plan, order=order, furniture=furniture)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict, problems=None) -> str:
    stops = manifest.get("stops", [])
    points = manifest.get("waypoints", [])
    missed = manifest.get("unreachable", [])
    line = (
        f"tour: {len(stops)} stop(s) over {len(points)} waypoint(s), "
        f"{manifest.get('clearance_mm', 0):.0f}mm clear of walls"
    )
    if missed:
        line += f"\n  ! UNREACHABLE: {', '.join(missed)}"

    if problems:
        line += f"\n  ! ROUTE IS NOT WALKABLE -- {len(problems)} problem(s):"
        for problem in problems[:6]:
            line += f"\n      {problem}"
    elif problems is not None:
        line += "\n  verified walkable against the true wall and furniture geometry"

    return line
