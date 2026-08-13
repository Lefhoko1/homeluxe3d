"""Floor slab.

The slab follows the building footprint, pushed out by an apron so the edge
reads correctly against the brickwork -- exactly the ledge visible along the
bottom of every elevation.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component
from ..core.geometry import offset_polygon


class SlabComponent(Component):
    """Concrete floor slab with its projecting apron."""

    category = "slab"
    label = "Floor slab"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        spec = ctx.plan.slab
        outline = offset_polygon(ctx.plan.footprint, spec.apron)

        slab = meshutil.prism(
            self.object_name("main"),
            outline,
            spec.top_level - spec.thickness,
            spec.top_level,
        )
        ctx.materials.assign(slab, "concrete_slab")
        objects = [slab]

        if ctx.plan.porch is not None:
            x0, y0, x1, y1 = ctx.plan.porch
            porch_slab = meshutil.box(
                self.object_name("porch"),
                x0 - spec.apron, y0 - spec.apron, spec.top_level - spec.thickness,
                x1 + spec.apron, y1, spec.top_level,
            )
            ctx.materials.assign(porch_slab, "concrete_slab")
            objects.append(porch_slab)

        return objects
