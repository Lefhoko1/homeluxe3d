"""Kitchen joinery.

The kitchen carries more advertising than any other room in the house -- 68
positions in Instructions.md section 4 -- and 43 of them were impossible,
because they put products ON THINGS. A kettle needs a worktop. A sink needs a
run to sit in. A slot 900mm in the air with nothing under it is a promise the
house cannot keep, so those positions could not honestly be declared until the
joinery existed.

This is the joinery. It is ARCHITECTURE, not product: the carcasses, the
worktop, the splashback and the wall units are what a house comes with, and
what a shop sells is the appliance that stands on them, the tap that goes in
them and the door fronts that face them. That division is the whole reason
`kitchen_unit` slots exist alongside `kitchen_appliance` ones.

THE LAYOUT IS AN L, and it is forced rather than chosen. The kitchen's south
wall is 2,400mm of servery opening into the living room, and its west side is
open to the hall -- neither can carry units. That leaves the north wall and
the east wall, which is exactly an L, with the sink under the window run and
the appliance space at the far end.

Every dimension here is a real kitchen dimension: 600 deep base units, 900 to
the worktop, 320 deep wall units at 1,500 to their underside, 600 between the
two. Getting those wrong is not a visual matter -- the slot manifest places
products at these heights, so a worktop at the wrong height is a kettle
floating above one.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component

# Dimensions live in the config, because the slot manifest needs them too and
# cannot import this module -- it has to run without Blender. A worktop at the
# wrong height puts every kettle in the house in mid-air. See
# config/kitchen.py.
from ..config.kitchen import (  # noqa: E402
    backed_spans,
    BASE_DEPTH,
    BASE_HEIGHT,
    DOOR_GAP,
    MODULE,
    PLINTH_HEIGHT,
    PLINTH_SETBACK,
    SPLASHBACK_HEIGHT,  # noqa: F401
    WALL_UNIT_BOTTOM,
    WALL_UNIT_DEPTH,
    WALL_UNIT_HEIGHT,
    WORKTOP_HEIGHT,
    WORKTOP_OVERHANG,
    WORKTOP_THICKNESS,  # noqa: F401
)


class KitchenComponent(Component):
    """Base units, worktop, splashback and wall units."""

    category = "kitchen"
    label = "Kitchen joinery"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        room = next((r for r in ctx.plan.rooms if r.name == "kitchen"), None)
        if room is None:
            ctx.warn("no kitchen in the plan; no joinery built")
            return []

        objects: list[bpy.types.Object] = []

        def add(obj, finish):
            ctx.materials.assign(obj, finish)
            objects.append(obj)
            return obj

        # ---- The runs ------------------------------------------------------
        # Laid on every span that has a WALL behind it and no DOORWAY in it.
        # Both halves of that matter and both were learned the hard way: the
        # first version ran cabinets across the bedroom corridor, and the
        # second ran them across the WC's door. Each time the geometry looked
        # perfectly good and the route solver reported rooms unreachable,
        # because the only way in was behind a bank of units.
        #
        # The east wall is unbroken, so it takes the long run and the corner.
        # The north wall gives what is left beside the corridor; the south
        # gives the two returns either side of the servery.
        n_y1 = room.y1
        n_y0 = n_y1 - BASE_DEPTH
        e_x1 = room.x1
        e_x0 = e_x1 - BASE_DEPTH

        east = backed_spans(ctx.plan, room, "e")
        for i, (a, b) in enumerate(east):
            self._run(add, f"east{i}", e_x0, a, e_x1, b, horizontal=False)

        north = [(a, min(b, e_x0)) for a, b in backed_spans(ctx.plan, room, "n")]
        north = [(a, b) for a, b in north if b - a >= MODULE]
        for i, (a, b) in enumerate(north):
            self._run(add, f"north{i}", a, n_y0, b, n_y1, horizontal=True)

        south = [(a, min(b, e_x0)) for a, b in backed_spans(ctx.plan, room, "s")]
        south = [(a, b) for a, b in south if b - a >= MODULE]
        for i, (a, b) in enumerate(south):
            self._run(add, f"south{i}", a, room.y0, b, room.y0 + BASE_DEPTH,
                      horizontal=True, front="north")

        # ---- Splashback ----------------------------------------------------
        # Follows the runs, so it breaks where they break.
        for i, (a, b) in enumerate(north):
            add(meshutil.box(
                self.object_name(f"splashback.north{i}"),
                a, n_y1 - 20.0, WORKTOP_HEIGHT, b, n_y1, WALL_UNIT_BOTTOM,
            ), "splashback_tile")
        for i, (a, b) in enumerate(east):
            add(meshutil.box(
                self.object_name(f"splashback.east{i}"),
                e_x1 - 20.0, a, WORKTOP_HEIGHT, e_x1, b, WALL_UNIT_BOTTOM,
            ), "splashback_tile")

        # ---- Wall units ----------------------------------------------------
        # Over the north runs only. Over the east run they would face the
        # window and box the room in.
        for run_index, (a, b) in enumerate(north):
            span = b - a
            count = max(1, int(span // MODULE))
            width = span / count
            for i in range(count):
                x0 = a + i * width
                add(meshutil.box(
                    self.object_name(f"wall_unit.{run_index}.{i}"),
                    x0 + DOOR_GAP, n_y1 - WALL_UNIT_DEPTH, WALL_UNIT_BOTTOM,
                    x0 + width - DOOR_GAP, n_y1,
                    WALL_UNIT_BOTTOM + WALL_UNIT_HEIGHT,
                ), "cabinet_door")

        return objects

    def _run(self, add, tag, x0, y0, x1, y1, *, horizontal: bool,
             front: str = "south") -> None:
        """One straight run: plinth, carcass, door fronts, worktop.

        `front` is which face the doors are on -- the side the room is, not
        the side the wall is. A run against the south wall opens north.
        """
        length = (x1 - x0) if horizontal else (y1 - y0)
        if length < MODULE / 2:
            return

        # Plinth, set back so the carcass reads as standing on it.
        add(meshutil.box(
            self.object_name(f"{tag}.plinth"),
            x0 + (PLINTH_SETBACK if not horizontal else 0.0),
            y0 + (PLINTH_SETBACK if horizontal else 0.0),
            0.0, x1, y1, PLINTH_HEIGHT,
        ), "cabinet_plinth")

        add(meshutil.box(
            self.object_name(f"{tag}.carcass"),
            x0, y0, PLINTH_HEIGHT, x1, y1, BASE_HEIGHT,
        ), "cabinet_carcass")

        # Door fronts, one per module, with a shadow line between them. This
        # is the surface a cabinet-finish product is sold for, so it is its
        # own object rather than part of the carcass.
        count = max(1, int(length // MODULE))
        width = length / count
        for i in range(count):
            if horizontal:
                a = x0 + i * width
                face = y1 if front == "north" else y0
                box = (a + DOOR_GAP, face, PLINTH_HEIGHT,
                       a + width - DOOR_GAP,
                       face + (18.0 if front == "north" else -18.0),
                       BASE_HEIGHT)
            else:
                a = y0 + i * width
                box = (x1, a + DOOR_GAP, PLINTH_HEIGHT,
                       x1 + 18.0, a + width - DOOR_GAP, BASE_HEIGHT)
            add(meshutil.box(self.object_name(f"{tag}.door.{i}"), *box),
                "cabinet_door")

        add(meshutil.box(
            self.object_name(f"{tag}.worktop"),
            x0 - (WORKTOP_OVERHANG if not horizontal else 0.0),
            y0 - (WORKTOP_OVERHANG if horizontal else 0.0),
            BASE_HEIGHT,
            x1 + (WORKTOP_OVERHANG if not horizontal else 0.0),
            y1, WORKTOP_HEIGHT,
        ), "worktop_stone")
