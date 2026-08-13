"""Floor finishes.

One thin plate per room, sitting just above the slab, carrying that room's
finish material. Separate from the slab so a flooring change is a 2mm-thick
re-export rather than a structural one, and separate per room so a single
room can be re-floored on its own.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component

FINISH_THICKNESS = 12.0


class FloorFinishComponent(Component):
    """Per-room floor finish plates."""

    category = "floors"
    label = "Floor finishes"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        top = ctx.plan.slab.top_level
        objects: list[bpy.types.Object] = []

        for room in ctx.plan.rooms:
            plate = meshutil.box(
                self.object_name(room.name),
                room.x0, room.y0, top,
                room.x1, room.y1, top + FINISH_THICKNESS,
            )
            try:
                ctx.materials.assign(plate, room.finish)
            except KeyError:
                ctx.warn(
                    f"room {room.name!r} asks for unknown finish "
                    f"{room.finish!r}; falling back to tile"
                )
                ctx.materials.assign(plate, "tile")
            objects.append(plate)

        return objects
