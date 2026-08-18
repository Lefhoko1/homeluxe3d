"""What the visitor may not walk through.

THE WALK USED TO ASK THE PICTURE WHERE THE WALLS ARE. It fired a short ray
along the direction of travel and stopped if the ray hit a mesh. That has
three failures a house exposes immediately:

  * A ray is a line, and a walker is not. Approach a door reveal at an angle
    and the ray goes through the gap while the shoulder does not.
  * A ray finds a surface, not a volume. One long frame -- a tab regaining
    focus, a slow phone -- steps further than the ray reaches and the
    character is simply on the other side of the wall.
  * A ray says only yes or no. "No" against a wall you are sliding along is a
    dead stop, which is why tuning its reach only ever moved where the tour
    jammed.

So the walls are exported as WHAT THEY ARE: a list of solid rectangles on the
floor plan. The browser then does circle-against-rectangle, which has none of
those failures -- it is a volume test, it cannot be stepped over, and it
resolves by pushing the walker out along the surface rather than by refusing
to move.

WHY THE PLAN AND NOT THE MESHES. The exported wall GLBs are one object per
wall, with the piers, sills and lintels joined -- so a wall's bounding box
includes its own doorway, and there is nothing left in the file to tell the
two apart. `core.wallmath.solid_spans` is the function the wall geometry is
actually built from, so reading it here means the collision cannot disagree
with the picture: they are the same decomposition.

WHICH SPANS COUNT. Only those that overlap the height a person occupies. A
window sill is solid from the floor to 900mm, so it collides; the lintel over
a door starts at 2100mm, so it does not. That is why a doorway needs no door
logic at all -- at walking height there is nothing there.

Everything is written in three.js house-local metres, converted here exactly
as `lights.json` and `catalog.json` are, so the browser never does axis maths.
"""

from __future__ import annotations

import json
import os

from ..core.wallmath import WallFrame, solid_spans

#: The band of heights a walker occupies, in millimetres above floor level.
#:
#: The character is 1.55m and the chase camera sits at 1.72m, so 1.9m covers
#: both with room to spare. The floor itself starts at 50mm rather than 0 so a
#: skirting-thin span -- or a slab edge modelled as a wall -- cannot block a
#: doorway.
WALK_LOW = 50.0
WALK_HIGH = 1900.0


def _rect_mm_to_three(x0: float, y0: float, x1: float, y1: float) -> list[float]:
    """A plan rectangle in millimetres as a three.js one in metres.

    The plan's +Y is north and three.js's +Z is south, so the Y axis flips and
    the two Y bounds swap places to keep the rectangle the right way round.
    """
    return [
        round(min(x0, x1) / 1000.0, 4),
        round(-max(y0, y1) / 1000.0, 4),
        round(max(x0, x1) / 1000.0, 4),
        round(-min(y0, y1) / 1000.0, 4),
    ]


def wall_rects(plan) -> list[dict]:
    """Every solid piece of wall a walker can hit, as flat rectangles.

    One entry per span, not per wall: a wall with a door in it contributes the
    pier either side and nothing across the opening, which is precisely the
    shape a walker has to get through.
    """
    rects = []

    for wall in plan.walls:
        frame = WallFrame.of(wall)
        for span in solid_spans(wall):
            # Above head height, or buried in the floor: not in the way.
            if span.z1 <= WALK_LOW or span.z0 >= WALK_HIGH:
                continue
            x0, y0, x1, y1 = frame.bounds(span.s0, span.s1)
            rects.append({
                "wall": wall.name,
                "part": span.tag,
                "rect": _rect_mm_to_three(x0, y0, x1, y1),
            })

    return rects


def room_rects(plan) -> list[dict]:
    """Each room's clear floor area.

    Not collision -- the walk never hits a room. This is here because the tour
    has to aim at things: the floor finish under the visitor's feet, the paint
    on the far wall, the ceiling above. All three are properties of a room
    rather than of an object, so the tour needs to know where a room is before
    it can show one off.
    """
    return [
        {
            "room": room.name,
            "label": room.label,
            "type": room.room_type,
            "rect": _rect_mm_to_three(room.x0, room.y0, room.x1, room.y1),
        }
        for room in plan.rooms
    ]


def build_manifest(plan) -> dict:
    return {
        "version": 1,
        "scene": plan.name,
        # So the browser knows which slice of the building these rectangles
        # describe, rather than assuming.
        "walk_band_m": [WALK_LOW / 1000.0, WALK_HIGH / 1000.0],
        "ceiling_m": round(plan.ceiling.height / 1000.0, 4),
        "walls": wall_rects(plan),
        "rooms": room_rects(plan),
    }


def write_manifest(plan, path: str) -> dict:
    manifest = build_manifest(plan)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict, path: str = "") -> str:
    walls = manifest.get("walls", [])
    rooms = manifest.get("rooms", [])
    low, high = manifest.get("walk_band_m", (0.0, 0.0))
    line = (
        f"collision: {len(walls)} solid wall piece(s) between "
        f"{low:.2f}m and {high:.2f}m, {len(rooms)} room(s)"
    )
    if path:
        line += f"\n  {path}"
    return line
