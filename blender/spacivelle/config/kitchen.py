"""Kitchen joinery dimensions.

Shared, because two programs need them and neither may import the other.
`components/kitchen.py` builds the carcasses from these; `config/slots_3bed.py`
places the countertop slots on top of them -- and a slot manifest that thinks
the worktop is at 850 while the worktop is at 900 puts every kettle in the
house floating fifty millimetres in the air.

That failure has already happened once in this codebase, with the door hinge
axis, and the fix was the same: one home for the numbers. See
`config/joinery.py`.

Every value is a real kitchen dimension. 600 deep base units, 900 to the
worktop, 320 deep wall units at 1,500 to their underside, 600 of splashback
between the two.
"""

from __future__ import annotations

BASE_DEPTH = 600.0
BASE_HEIGHT = 870.0          # carcass; the worktop sits on top
WORKTOP_THICKNESS = 30.0
WORKTOP_OVERHANG = 20.0      # proud of the door fronts
WORKTOP_HEIGHT = BASE_HEIGHT + WORKTOP_THICKNESS      # 900

PLINTH_HEIGHT = 100.0        # the recessed kick under the carcass
PLINTH_SETBACK = 50.0

WALL_UNIT_DEPTH = 320.0
WALL_UNIT_BOTTOM = 1500.0    # 600 clear above the worktop
WALL_UNIT_HEIGHT = 700.0

SPLASHBACK_HEIGHT = WALL_UNIT_BOTTOM - WORKTOP_HEIGHT  # 600

DOOR_GAP = 4.0               # the shadow line between door fronts
MODULE = 600.0               # one unit




#: How close a wall has to be to a room edge to count as backing it.
_EDGE_TOL = 200.0

#: How far a run stops short of an opening, in millimetres.
#:
#: You do not build a worktop flush into a doorway -- the run stops and the
#: end panel is finished. Doing it flush here left the bedroom corridor a
#: 1,000mm gap, and once the route solver padded the cabinets by its own
#: clearance that became 240mm of free floor. The solver did what it is meant
#: to and dropped its clearance to 170mm to squeeze through, which makes the
#: route hug walls everywhere else in the house to pay for one doorway.
#: 300mm each side restores it.
END_MARGIN = 300.0


def backed_spans(plan, room, side: str) -> list[tuple[float, float]]:
    """Where one side of a room actually has a wall behind it.

    UNITS NEED A WALL BEHIND THEM, and a room edge is not always one. The
    kitchen's north edge carries the opening to the bedroom corridor -- a
    metre of nothing -- and the first version of this component built cabinets
    straight across it. The geometry looked fine; what it did was seal the
    only route to bedroom 2, the WC and the garage, and the route solver said
    so by declaring three rooms unreachable.

    So the runs are laid along the spans that are BACKED, and the gaps stay
    gaps. Derived from the plan's walls, so a door moved tomorrow moves the
    cabinets with it.
    """
    if side == "n":
        line, lo, hi, horizontal = room.y1, room.x0, room.x1, True
    elif side == "s":
        line, lo, hi, horizontal = room.y0, room.x0, room.x1, True
    elif side == "e":
        line, lo, hi, horizontal = room.x1, room.y0, room.y1, False
    else:
        line, lo, hi, horizontal = room.x0, room.y0, room.y1, False

    covered: list[tuple[float, float]] = []
    holes: list[tuple[float, float]] = []

    for wall in plan.walls:
        (sx, sy), (ex, ey) = wall.start, wall.end
        if horizontal and wall.is_horizontal and abs(sy - line) <= _EDGE_TOL + wall.thickness:
            a, b = sorted((sx, ex))
            origin, sign = (sx, 1.0 if ex >= sx else -1.0)
        elif not horizontal and wall.is_vertical and abs(sx - line) <= _EDGE_TOL + wall.thickness:
            a, b = sorted((sy, ey))
            origin, sign = (sy, 1.0 if ey >= sy else -1.0)
        else:
            continue

        # A WALL WITH A DOOR IN IT IS NOT A WALL YOU CAN BUILD AGAINST.
        #
        # This is the fault that isolated the WC. The kitchen's north edge is
        # backed by the bedroom corridor wall, which carries the WC's door at
        # x 6,300 -- so the run was laid straight across the doorway. The
        # geometry was fine and the route solver reported the WC and bedroom 2
        # unreachable, because the only way into them was behind a bank of
        # cabinets.
        for opening in wall.openings:
            half = opening.width / 2.0
            o0 = origin + sign * (opening.offset - half)
            o1 = origin + sign * (opening.offset + half)
            holes.append((min(o0, o1) - END_MARGIN, max(o0, o1) + END_MARGIN))

        a, b = max(a, lo), min(b, hi)
        if b > a:
            covered.append((a, b))

    # Merge, then pull each end back from an opening.
    covered.sort()
    merged: list[list[float]] = []
    for a, b in covered:
        if merged and a <= merged[-1][1] + 1.0:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])

    # Cut the doorways out, then pull the remaining ends back from openings.
    pieces: list[tuple[float, float]] = []
    for a, b in merged:
        current = [(a, b)]
        for h0, h1 in holes:
            nxt = []
            for c0, c1 in current:
                if h1 <= c0 or h0 >= c1:
                    nxt.append((c0, c1))
                    continue
                if c0 < h0:
                    nxt.append((c0, h0))
                if h1 < c1:
                    nxt.append((h1, c1))
            current = nxt
        pieces.extend(current)

    out = []
    for a, b in pieces:
        # An end landing on the room's own corner is a corner, not an opening:
        # a run may finish hard against a return wall. Ends that came from a
        # doorway cut already carry their margin.
        if abs(a - lo) > 1.0 and not any(abs(a - h1) < 1.0 for _, h1 in holes):
            a += END_MARGIN
        if abs(b - hi) > 1.0 and not any(abs(b - h0) < 1.0 for h0, _ in holes):
            b -= END_MARGIN
        if b - a >= MODULE:
            out.append((a, b))
    return out


def joinery_footprints(plan, room) -> list[tuple[float, float, float, float]]:
    """The plan footprint of the runs, as (x0, y0, x1, y1) in millimetres.

    THE CABINETS ARE SOLID AND NOTHING KNEW IT. `collision_json` reads the
    plan's WALLS and the route solver reads the walls and the catalogue's
    furniture; joinery is neither, so the walking character would have gone
    straight through a kitchen full of units -- the same class of fault as
    walking through a door, and just as invisible from a screenshot.

    Derived from the same `backed_spans` the geometry is built from, so the
    cabinets you can see and the cabinets you cannot walk through are the
    same cabinets. That is the whole reason this lives beside the dimensions
    rather than in either exporter.
    """
    n_y0 = room.y1 - BASE_DEPTH
    e_x0 = room.x1 - BASE_DEPTH

    rects = []
    for a, b in backed_spans(plan, room, "e"):
        rects.append((e_x0, a, room.x1, b))
    for a, b in backed_spans(plan, room, "n"):
        b = min(b, e_x0)
        if b - a >= MODULE:
            rects.append((a, n_y0, b, room.y1))
    for a, b in backed_spans(plan, room, "s"):
        b = min(b, e_x0)
        if b - a >= MODULE:
            rects.append((a, room.y0, b, room.y0 + BASE_DEPTH))
    return rects


#: Rooms that get fitted joinery. One, today, and named rather than inferred:
#: a laundry will want the same treatment and a bedroom never will.
JOINERY_ROOMS = ("kitchen",)


def all_joinery_footprints(plan) -> list[tuple[float, float, float, float]]:
    """Every fitted run in the house, as plan rectangles.

    `joinery_footprints` sets out the runs for A ROOM and will happily do it
    for a bedroom, which is why both exporters guarded it with the same
    `if room.name != "kitchen"` line. A third caller repeated the guard and
    got it wrong -- door swings were being stopped by kitchen cabinets in the
    laundry and in all three bedrooms -- so the guard lives here now and the
    callers ask for the house.
    """
    rects: list[tuple[float, float, float, float]] = []
    for room in plan.rooms:
        if room.name not in JOINERY_ROOMS:
            continue
        rects.extend(joinery_footprints(plan, room))
    return rects
