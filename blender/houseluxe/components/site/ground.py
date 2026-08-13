"""Ground: contoured lawn over a soil mass.

The lawn is a subdivided grid displaced by `SiteSpec.elevation()`. It falls
away from the building for drainage and carries low undulation so it does not
read as a billiard table, but it is held perfectly flat under the house and
all paving -- a house on a lumpy slab looks broken, and paving that follows
a contour stops being paving.

Turf and soil are two objects sharing one grid: the turf's underside is the
soil's top, so no gap can open between them however the terrain moves.

The lawn runs unbroken under the house footprint. Cutting a hole for the
building would mean a boolean and a seam to keep in sync with the slab, all
to hide a few triangles the slab already covers.
"""

from __future__ import annotations

from typing import Callable

import bpy

from ...core import mesh as meshutil
from ...core.component import BuildContext, Component
from ...core.units import m


class GroundComponent(Component):
    """Contoured lawn plus the soil beneath it."""

    category = "yard_ground"
    label = "Ground & lawn"

    TURF_THICKNESS = 120.0

    #: Grid spacing. 1.5m keeps the contour smooth at walking distance while
    #: staying well under a thousand quads for a 30x40 site.
    CELL = 1500.0

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; ground skipped")
            return []

        x0, y0, x1, y1 = site.bounds
        nx = max(2, int(round((x1 - x0) / self.CELL)) + 1)
        ny = max(2, int(round((y1 - y0) / self.CELL)) + 1)

        surface = site.elevation
        soil_base = site.ground_level - site.soil_depth

        turf = self._solid_grid(
            self.object_name("lawn"),
            x0, y0, x1, y1, nx, ny,
            top=surface,
            bottom=lambda x, y: surface(x, y) - self.TURF_THICKNESS,
        )
        ctx.materials.assign(turf, "lawn")

        soil = self._solid_grid(
            self.object_name("soil"),
            x0, y0, x1, y1, nx, ny,
            top=lambda x, y: surface(x, y) - self.TURF_THICKNESS,
            bottom=lambda x, y: soil_base,
        )
        ctx.materials.assign(soil, "soil")

        return [turf, soil]

    def _solid_grid(
        self,
        name: str,
        x0: float, y0: float, x1: float, y1: float,
        nx: int, ny: int,
        top: Callable[[float, float], float],
        bottom: Callable[[float, float], float],
    ) -> bpy.types.Object:
        """Closed solid between two height functions over a regular grid."""
        dx = (x1 - x0) / (nx - 1)
        dy = (y1 - y0) / (ny - 1)

        verts: list[tuple[float, float, float]] = []
        for j in range(ny):
            for i in range(nx):
                x, y = x0 + i * dx, y0 + j * dy
                verts.append((m(x), m(y), m(top(x, y))))
        for j in range(ny):
            for i in range(nx):
                x, y = x0 + i * dx, y0 + j * dy
                verts.append((m(x), m(y), m(bottom(x, y))))

        count = nx * ny

        def top_i(i: int, j: int) -> int:
            return j * nx + i

        def bot_i(i: int, j: int) -> int:
            return count + j * nx + i

        faces: list[tuple[int, ...]] = []

        for j in range(ny - 1):
            for i in range(nx - 1):
                faces.append((top_i(i, j), top_i(i + 1, j),
                              top_i(i + 1, j + 1), top_i(i, j + 1)))
                # Bottom wound the other way so its normal points down.
                faces.append((bot_i(i, j + 1), bot_i(i + 1, j + 1),
                              bot_i(i + 1, j), bot_i(i, j)))

        # Skirt around the perimeter, closing the solid.
        for i in range(nx - 1):
            faces.append((top_i(i + 1, 0), top_i(i, 0),
                          bot_i(i, 0), bot_i(i + 1, 0)))
            faces.append((top_i(i, ny - 1), top_i(i + 1, ny - 1),
                          bot_i(i + 1, ny - 1), bot_i(i, ny - 1)))
        for j in range(ny - 1):
            faces.append((top_i(0, j), top_i(0, j + 1),
                          bot_i(0, j + 1), bot_i(0, j)))
            faces.append((top_i(nx - 1, j + 1), top_i(nx - 1, j),
                          bot_i(nx - 1, j), bot_i(nx - 1, j + 1)))

        return meshutil.mesh_from_pydata(name, verts, faces)
