"""Ceiling lining.

Built from the building footprint pulled in to the internal face of the
exterior walls, rather than as one plate per room. Room rectangles do not
tile the whole interior -- hallways and robes are not all declared -- so a
per-room ceiling would leave holes over exactly the spaces you walk through.
Following the footprint guarantees complete cover.

The inset is taken from the exterior walls themselves, so thickening the
brickwork moves the ceiling edge automatically instead of silently leaving a
gap at the perimeter.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component
from ..core.geometry import offset_polygon


class CeilingComponent(Component):
    """Flat ceiling over the enclosed area, plus the porch soffit."""

    category = "ceiling"
    label = "Ceiling"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        spec = ctx.plan.ceiling
        objects: list[bpy.types.Object] = []

        exterior = ctx.plan.exterior_walls
        if not exterior:
            ctx.warn("no exterior walls; ceiling cannot be sized")
            return []

        wall_thickness = max(w.thickness for w in exterior)

        if spec.height > ctx.plan.wall_height:
            ctx.warn(
                f"ceiling underside ({spec.height:.0f}mm) is above wall height "
                f"({ctx.plan.wall_height:.0f}mm); it will float free of the walls"
            )

        interior = offset_polygon(ctx.plan.footprint, -wall_thickness)
        ceiling = meshutil.prism(
            self.object_name("main"),
            interior,
            spec.height,
            spec.height + spec.thickness,
        )
        ctx.materials.assign(ceiling, spec.finish)
        objects.append(ceiling)

        # -- Cornice -------------------------------------------------------
        cornice = self._cornice(ctx, interior, spec.height)
        if cornice is not None:
            objects.append(cornice)

        # -- Porch soffit --------------------------------------------------
        # Matched to the porch roof's extent so the two do not leave a gap
        # you can see up into from the front door.
        if spec.porch_soffit and ctx.plan.porch is not None:
            px0, py0, px1, py1 = ctx.plan.porch
            oh = ctx.plan.roof.overhang
            soffit = meshutil.box(
                self.object_name("porch_soffit"),
                px0 - oh, py0 - oh, spec.height,
                px1 + oh, py1, spec.height + spec.thickness,
            )
            ctx.materials.assign(soffit, spec.finish)
            objects.append(soffit)

        return objects

    #: Square-profile cornice. A real cove is a swept profile; at the scale
    #: this is viewed, a chamfer-less block reads the same and costs 12
    #: triangles per run instead of several hundred.
    CORNICE_SIZE = 90.0

    def _cornice(self, ctx: BuildContext, interior_polygon, ceiling_height: float
                 ) -> bpy.types.Object | None:
        """Cornice around every wall face that looks into a room.

        Two passes: the building perimeter, taken from the same inset polygon
        the ceiling uses, and both faces of every internal partition. Doing
        only the perimeter would leave partition walls meeting the ceiling
        with a bare butt joint, which is the thing this is here to hide.
        """
        size = self.CORNICE_SIZE
        z0, z1 = ceiling_height - size, ceiling_height
        parts: list[bpy.types.Object] = []

        # -- Perimeter -----------------------------------------------------
        inner = offset_polygon(tuple(interior_polygon), -size)
        count = len(interior_polygon)
        for i in range(count):
            j = (i + 1) % count
            xs = [interior_polygon[i][0], interior_polygon[j][0],
                  inner[i][0], inner[j][0]]
            ys = [interior_polygon[i][1], interior_polygon[j][1],
                  inner[i][1], inner[j][1]]
            parts.append(
                meshutil.box(
                    f"cornice.perimeter.{i}",
                    min(xs), min(ys), z0, max(xs), max(ys), z1,
                )
            )

        # -- Internal partitions, both faces -------------------------------
        for wall in ctx.plan.interior_walls:
            (x0, y0), (x1, y1) = wall.start, wall.end
            half = wall.thickness / 2.0

            if wall.is_horizontal:
                a, b = min(x0, x1), max(x0, x1)
                faces = [
                    (a, y0 + half, b, y0 + half + size),
                    (a, y0 - half - size, b, y0 - half),
                ]
            elif wall.is_vertical:
                a, b = min(y0, y1), max(y0, y1)
                faces = [
                    (x0 + half, a, x0 + half + size, b),
                    (x0 - half - size, a, x0 - half, b),
                ]
            else:
                continue

            for k, (fx0, fy0, fx1, fy1) in enumerate(faces):
                parts.append(
                    meshutil.box(
                        f"cornice.{wall.name}.{k}", fx0, fy0, z0, fx1, fy1, z1
                    )
                )

        if not parts:
            return None

        cornice = meshutil.join(parts, self.object_name("cornice"))
        ctx.materials.assign(cornice, ctx.plan.ceiling.finish)
        return cornice
