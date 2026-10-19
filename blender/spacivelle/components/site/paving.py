"""Paving and garden beds.

Both are the same shape -- a flat rectangle sitting on the ground -- so they
share one component and differ only in finish and thickness. Splitting them
into two classes would duplicate the geometry for no gain.

Paving tops out flush with the house floor (Z=0) so there is no step at the
sliding door. Beds sit lower, at lawn level.
"""

from __future__ import annotations

import bpy

from ...config.site import Rect
from ...core import mesh as meshutil
from ...core.component import BuildContext, Component


class PavingComponent(Component):
    """Driveway, paths and the pool terrace."""

    category = "yard_paving"
    label = "Paving"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; paving skipped")
            return []

        objects: list[bpy.types.Object] = []
        for rect in site.paving:
            objects.append(self._slab(ctx, rect, top=0.0))
        return objects

    def _slab(self, ctx: BuildContext, rect: Rect, top: float) -> bpy.types.Object:
        obj = meshutil.box(
            rect.name,
            rect.x0, rect.y0, top - rect.thickness,
            rect.x1, rect.y1, top,
        )
        ctx.materials.assign(obj, rect.finish)
        return obj


class GardenBedComponent(Component):
    """Mulched planting beds. Separate GLB so planting can be re-dressed."""

    category = "yard_beds"
    label = "Garden beds"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; beds skipped")
            return []

        objects: list[bpy.types.Object] = []
        for rect in site.beds:
            # Beds sit at lawn level, slightly proud so the mulch reads as a
            # raised bed rather than a painted-on rectangle.
            top = site.ground_level + 40.0
            obj = meshutil.box(
                rect.name,
                rect.x0, rect.y0, top - rect.thickness,
                rect.x1, rect.y1, top,
            )
            ctx.materials.assign(obj, rect.finish)
            objects.append(obj)

        return objects
