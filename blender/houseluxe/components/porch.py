"""Entry porch.

Just the columns and their capitals -- the porch slab belongs to the slab
component and the porch roof to the roof component, because that is where
those materials are decided. The porch is a location, not a material.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component

COLUMN_SIZE = 300.0
CAPITAL_OVERHANG = 45.0
CAPITAL_HEIGHT = 120.0


class PorchComponent(Component):
    """Square columns at the outer corners of the porch."""

    category = "porch"
    label = "Porch"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        if ctx.plan.porch is None:
            return []

        x0, y0, x1, y1 = ctx.plan.porch
        top = ctx.plan.roof.eave_height
        objects: list[bpy.types.Object] = []

        # Only the two outer (southern) corners carry columns; the northern
        # end of the porch roof bears on the house wall.
        for tag, cx in (("west", x0), ("east", x1 - COLUMN_SIZE)):
            shaft = meshutil.box(
                f"{self.object_name(tag)}.shaft",
                cx, y0, 0.0,
                cx + COLUMN_SIZE, y0 + COLUMN_SIZE, top - CAPITAL_HEIGHT,
            )
            capital = meshutil.box(
                f"{self.object_name(tag)}.capital",
                cx - CAPITAL_OVERHANG, y0 - CAPITAL_OVERHANG, top - CAPITAL_HEIGHT,
                cx + COLUMN_SIZE + CAPITAL_OVERHANG,
                y0 + COLUMN_SIZE + CAPITAL_OVERHANG, top,
            )
            column = meshutil.join([shaft, capital], self.object_name(tag))
            ctx.materials.assign(column, "porch_column")
            objects.append(column)

        return objects
