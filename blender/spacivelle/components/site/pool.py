"""Swimming pool: shell, coping and water.

Built outward from the WATER rectangle, which is the dimension anyone
actually quotes. Walls go outside it, the floor goes under it, coping caps
the walls, and the water surface sits just below coping level. Resize the
water and the whole structure follows.

Like the house walls, the coping is four strips rather than one slab with a
hole -- no booleans, no coplanar faces fighting at the pool edge.
"""

from __future__ import annotations

import bpy

from ...core import mesh as meshutil
from ...core.component import BuildContext, Component


class PoolComponent(Component):
    """In-ground pool with a floor that falls to the deep end."""

    category = "pool"
    label = "Pool"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None or site.pool is None:
            ctx.warn("no pool defined; pool skipped")
            return []

        pool = site.pool
        sx0, sy0, sx1, sy1 = pool.shell
        floor_top_shallow = -pool.depth_shallow
        floor_top_deep = -pool.depth_deep
        base = floor_top_deep - pool.floor_thickness

        objects: list[bpy.types.Object] = []

        # -- Shell walls ---------------------------------------------------
        # Four slabs forming a ring between the water edge and the shell face.
        walls = [
            ("south", sx0, sy0, sx1, pool.y0),
            ("north", sx0, pool.y1, sx1, sy1),
            ("west", sx0, pool.y0, pool.x0, pool.y1),
            ("east", pool.x1, pool.y0, sx1, pool.y1),
        ]
        for tag, wx0, wy0, wx1, wy1 in walls:
            wall = meshutil.box(
                self.object_name("wall", tag),
                wx0, wy0, base, wx1, wy1, 0.0,
            )
            ctx.materials.assign(wall, "pool_tile")
            objects.append(wall)

        # -- Floor ---------------------------------------------------------
        # Ramps from the shallow (y0) end to the deep (y1) end.
        floor = meshutil.sloped_box(
            self.object_name("floor"),
            sx0, sy0, sx1, sy1,
            z_bottom=base,
            z_top_y0=floor_top_shallow,
            z_top_y1=floor_top_deep,
        )
        ctx.materials.assign(floor, "pool_tile")
        objects.append(floor)

        # -- Coping --------------------------------------------------------
        # Laps `coping_overhang` over the water so you cannot see the join
        # between the wall and the water surface from a deck chair.
        o = pool.coping_overhang
        cx0, cy0 = pool.x0 + o, pool.y0 + o
        cx1, cy1 = pool.x1 - o, pool.y1 - o
        ct = pool.coping_thickness

        copings = [
            ("south", sx0, sy0, sx1, cy0),
            ("north", sx0, cy1, sx1, sy1),
            ("west", sx0, cy0, cx0, cy1),
            ("east", cx1, cy0, sx1, cy1),
        ]
        for tag, kx0, ky0, kx1, ky1 in copings:
            cap = meshutil.box(
                self.object_name("coping", tag),
                kx0, ky0, -ct, kx1, ky1, 0.0,
            )
            ctx.materials.assign(cap, "coping")
            objects.append(cap)

        # -- Water ---------------------------------------------------------
        # A surface, not a solid. Filling the volume would intersect the
        # sloped floor and gains nothing once the material is translucent.
        water = meshutil.box(
            self.object_name("water"),
            pool.x0, pool.y0, pool.water_level - 80.0,
            pool.x1, pool.y1, pool.water_level,
        )
        ctx.materials.assign(water, "pool_water")
        objects.append(water)

        return objects
