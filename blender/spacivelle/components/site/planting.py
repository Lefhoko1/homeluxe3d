"""Planting: trees, shrubs and clipped hedges.

Trees are a tapered trunk plus two or three overlapping ellipsoids. That is
enough to read as a tree at the distance this scene is viewed from, and it
costs a few hundred triangles instead of the tens of thousands a leaf-card
tree would.

Every random offset comes from the plant's own `seed`, so a rebuild produces
exactly the same garden. Randomness that changes between builds makes diffs
meaningless.
"""

from __future__ import annotations

import math

import bpy

from ...config.site import HedgeRun, Plant
from ...core import mesh as meshutil
from ...core.component import BuildContext, Component


def _rand(seed: int, index: int) -> float:
    """Deterministic pseudo-random in 0..1 from a seed and a slot number."""
    value = (seed * 7349 + index * 15733 + 12345) & 0xFFFFFFFF
    value = (value * 1103515245 + 12345) & 0x7FFFFFFF
    return (value % 10000) / 10000.0


class PlantingComponent(Component):
    """Trees and shrubs."""

    category = "yard_planting"
    label = "Planting"

    #: Trees are a MODEL now, not primitives.
    #:
    #: `_tree` below still works and is left intact -- it is what the yard had
    #: before, and it is the fallback if the model is ever missing. But a real
    #: scanned tree beats a trunk with seven ellipsoids stuck on it by so much
    #: that there is no reason to draw the ellipsoids as well.
    #:
    #: What replaces it is a PLACEMENT: `export/planting_json.py` writes where
    #: each tree stands and how big it is, and the app instances one GLB at
    #: those points. Same division as products -- geometry is an asset,
    #: position is data -- so re-planting the garden is a config edit rather
    #: than a rebuild.
    BUILD_TREE_GEOMETRY = False

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; planting skipped")
            return []

        objects: list[bpy.types.Object] = []

        for plant in site.plants:
            # Each plant sits on the terrain under it, not on a nominal level.
            ground = site.elevation(plant.x, plant.y)
            if plant.kind == "tree":
                if self.BUILD_TREE_GEOMETRY:
                    objects.extend(self._tree(ctx, plant, ground))
            elif plant.kind == "shrub":
                objects.append(self._shrub(ctx, plant, ground))
            else:
                ctx.warn(f"unknown plant kind {plant.kind!r}; skipped")

        return objects

    #: Canopy clumps per tree. Enough to break the silhouette; few enough to
    #: stay cheap. Three read as a blob, seven reads as a tree.
    CANOPY_CLUMPS = 7

    def _tree(self, ctx: BuildContext, plant: Plant, ground: float
              ) -> list[bpy.types.Object]:
        trunk_height = plant.height * 0.42
        trunk_radius = max(70.0, plant.spread * 0.045)
        radius = plant.spread / 2.0
        canopy_centre = ground + plant.height * 0.68

        woody: list[bpy.types.Object] = []

        # -- Trunk, buried so it never floats on sloping ground ------------
        woody.append(
            meshutil.cylinder(
                f"tree.{plant.seed}.trunk",
                plant.x, plant.y,
                ground - 600.0,   # deep enough to stay buried on a slope
                ground + trunk_height,
                radius_mm=trunk_radius * 1.25,     # flared base
                radius_top_mm=trunk_radius * 0.65,
                segments=8,
            )
        )

        # -- Branches ------------------------------------------------------
        # Three limbs angling up into the canopy. Modelled as tapered
        # cylinders raised to the branch midpoint rather than true rotated
        # geometry: at this viewing distance the read is the same and the
        # maths stays trivial.
        for b in range(3):
            angle = _rand(plant.seed, 60 + b) * 6.2832
            reach = radius * (0.35 + _rand(plant.seed, 70 + b) * 0.3)
            bx = plant.x + math.cos(angle) * reach
            by = plant.y + math.sin(angle) * reach
            woody.append(
                meshutil.cylinder(
                    f"tree.{plant.seed}.branch{b}",
                    (plant.x + bx) / 2.0, (plant.y + by) / 2.0,
                    ground + trunk_height * 0.75,
                    canopy_centre - radius * 0.25,
                    radius_mm=trunk_radius * 0.45,
                    radius_top_mm=trunk_radius * 0.28,
                    segments=6,
                )
            )

        trunk = meshutil.join(woody, f"tree.{plant.seed}.trunk")
        ctx.materials.assign(trunk, "trunk")

        # -- Canopy --------------------------------------------------------
        # Clumps pushed out toward the canopy edge rather than scattered
        # around the centre, which is what gives a lumpy outline instead of
        # one big sphere with dents.
        clumps: list[bpy.types.Object] = []
        for i in range(self.CANOPY_CLUMPS):
            angle = (i / self.CANOPY_CLUMPS) * 6.2832 + _rand(plant.seed, i) * 0.9
            dz = (_rand(plant.seed, i + 20) - 0.45) * plant.height * 0.20
            # Offset plus clump radius is capped at the canopy radius, so a
            # tree actually occupies the `spread` it declares.
            size = radius * (0.32 + _rand(plant.seed, i + 30) * 0.18)
            out = radius * (0.20 + _rand(plant.seed, i + 10) * 0.30)

            clumps.append(
                meshutil.sphere(
                    f"tree.{plant.seed}.clump{i}",
                    plant.x + math.cos(angle) * out,
                    plant.y + math.sin(angle) * out,
                    canopy_centre + dz,
                    radius_mm=size,
                    subdivisions=2,
                    scale=(1.0, 0.94, 0.80),
                )
            )

        # A core clump so the middle is not hollow when seen from below.
        clumps.append(
            meshutil.sphere(
                f"tree.{plant.seed}.core",
                plant.x, plant.y, canopy_centre,
                radius_mm=radius * 0.62,
                subdivisions=2,
                scale=(1.0, 1.0, 0.78),
            )
        )

        canopy = meshutil.join(clumps, f"tree.{plant.seed}.canopy")
        ctx.materials.assign(canopy, plant.foliage)

        return [trunk, canopy]

    def _shrub(self, ctx: BuildContext, plant: Plant, ground: float
               ) -> bpy.types.Object:
        radius = plant.spread / 2.0
        squash = plant.height / max(plant.spread, 1.0)

        shrub = meshutil.sphere(
            f"shrub.{plant.seed}",
            plant.x, plant.y,
            # Sunk slightly so the base meets the ground rather than kissing it.
            ground + plant.height * 0.40,
            radius_mm=radius,
            subdivisions=1,
            scale=(1.0, 0.92 + _rand(plant.seed, 1) * 0.16, squash),
        )
        ctx.materials.assign(shrub, plant.foliage)
        return shrub


class HedgeComponent(Component):
    """Clipped boundary hedges. One box per run -- a hedge IS a box."""

    category = "yard_hedges"
    label = "Hedges"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; hedges skipped")
            return []

        objects: list[bpy.types.Object] = []
        for hedge in site.hedges:
            obj = self._hedge(ctx, hedge)
            if obj is not None:
                objects.append(obj)
        return objects

    #: Hedges are cut into segments so a long run can follow the contour
    #: instead of bridging it. 2m reads as continuous once clipped.
    SEGMENT = 2000.0

    def _hedge(self, ctx: BuildContext, hedge: HedgeRun
               ) -> bpy.types.Object | None:
        site = ctx.site
        (x0, y0), (x1, y1) = hedge.start, hedge.end
        half = hedge.width / 2.0

        horizontal = abs(y1 - y0) < 1e-6
        vertical = abs(x1 - x0) < 1e-6
        if not (horizontal or vertical):
            ctx.warn(f"hedge {hedge.name!r} is not axis-aligned; skipped")
            return None

        low = min(x0, x1) if horizontal else min(y0, y1)
        high = max(x0, x1) if horizontal else max(y0, y1)
        length = high - low
        segments = max(1, int(round(length / self.SEGMENT)))
        step = length / segments

        parts: list[bpy.types.Object] = []
        for i in range(segments):
            a, b = low + i * step, low + (i + 1) * step
            mid = (a + b) / 2.0
            mx, my = (mid, y0) if horizontal else (x0, mid)
            ground = site.elevation(mx, my)

            bounds = (
                (a, y0 - half, b, y0 + half) if horizontal
                else (x0 - half, a, x0 + half, b)
            )
            parts.append(
                meshutil.box(
                    f"{hedge.name}.{i}",
                    bounds[0], bounds[1], ground - 400.0,   # buried into slope
                    bounds[2], bounds[3], ground + hedge.height,
                )
            )

        obj = meshutil.join(parts, hedge.name)
        ctx.materials.assign(obj, hedge.finish)
        return obj
