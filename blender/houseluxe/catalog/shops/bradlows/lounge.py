"""Bradlows -- Sandton recliner lounge suite.

Modelled from the showroom photograph: chunky rolled arms, deep seats, a
two-pad back per seat, and small dark feet, in taupe bonded leather.

ONE builder makes all three pieces. A 3-seater, a 2-seater and a recliner
armchair from the same suite differ by seat count and whether the footrest is
out -- not by being three separate models. Writing them as three would mean
fixing every proportion three times.

CONVENTION, shared by every product in the catalogue:
    footprint centred on (0, 0), underside at z = 0, facing +Y.
Placements assume it, so a product that ignores it lands in the wrong place.
"""

from __future__ import annotations

from dataclasses import dataclass

try:
    import bpy
except ModuleNotFoundError:                 # pragma: no cover
    # THE DATA HALF OF THE CATALOGUE HAS TO BE READABLE WITHOUT BLENDER.
    # `product.py` says so already and keeps bpy behind TYPE_CHECKING for
    # exactly this reason: the plain-Python tools that solve the route and the
    # collision model read the placements, and a module-level `import bpy`
    # three files away put the whole catalogue out of their reach.
    #
    # The builders below genuinely need Blender and will say so loudly if they
    # are called without it. Everything else in this module -- the dimensions,
    # the products, where they stand -- is plain data.
    bpy = None

from ....core import mesh as meshutil
from ....core.component import BuildContext

# --------------------------------------------------------------------------
# Suite proportions. Shared by all three pieces.
# --------------------------------------------------------------------------
DEPTH = 950.0            # deep, as recliners are
ARM_WIDTH = 270.0
BACK_DEPTH = 210.0
FOOT_HEIGHT = 70.0
SEAT_HEIGHT = 460.0
ARM_HEIGHT = 650.0
BACK_HEIGHT = 1020.0
SEAT_CUSHION = 160.0
SEAT_WIDTH = 620.0       # per seat, between arms

LEATHER = "leather_taupe"
FOOT = "furniture_foot"


@dataclass(frozen=True)
class SofaSpec:
    """One piece of the suite."""

    seats: int = 3
    footrest: bool = False          # recliner shown with the footrest out
    accent_cushions: int = 1
    accent_finish: str = "cushion_teal"

    @property
    def width(self) -> float:
        return self.seats * SEAT_WIDTH + 2 * ARM_WIDTH

    @property
    def depth(self) -> float:
        # The extended footrest adds to the space the piece occupies, which
        # matters for placement even though it is not part of the carcass.
        return DEPTH + (520.0 if self.footrest else 0.0)


def build_sofa(spec: SofaSpec):
    """Return a build function for this piece of the suite."""

    def build(ctx: BuildContext) -> list[bpy.types.Object]:
        width = spec.width
        hw = width / 2.0
        hd = DEPTH / 2.0
        objects: list[bpy.types.Object] = []

        def leather(obj):
            ctx.materials.assign(obj, LEATHER)
            objects.append(obj)
            return obj

        # -- Carcass -------------------------------------------------------
        leather(meshutil.rounded_box(
            "sofa.frame",
            -hw, -hd, FOOT_HEIGHT,
            hw, hd, SEAT_HEIGHT - SEAT_CUSHION,
            radius=35.0,
        ))

        leather(meshutil.rounded_box(
            "sofa.back",
            -hw, -hd, FOOT_HEIGHT,
            hw, -hd + BACK_DEPTH, BACK_HEIGHT,
            radius=70.0,
        ))

        # Rolled arms. Generous bevel -- this is the shape that reads first.
        for side, x0 in (("left", -hw), ("right", hw - ARM_WIDTH)):
            leather(meshutil.rounded_box(
                f"sofa.arm_{side}",
                x0, -hd, FOOT_HEIGHT,
                x0 + ARM_WIDTH, hd, ARM_HEIGHT,
                radius=105.0,
            ))

        # -- Cushions, one set per seat ------------------------------------
        inner_left = -hw + ARM_WIDTH
        gap = 18.0

        for i in range(spec.seats):
            x0 = inner_left + i * SEAT_WIDTH + gap
            x1 = inner_left + (i + 1) * SEAT_WIDTH - gap

            leather(meshutil.rounded_box(
                f"sofa.seat{i}",
                x0, -hd + BACK_DEPTH + 10.0, SEAT_HEIGHT - SEAT_CUSHION,
                x1, hd - 55.0, SEAT_HEIGHT + 20.0,
                radius=55.0,
            ))

            # Two back pads per seat -- lumbar and headrest. A single flat
            # panel is the difference between "sofa" and "bench".
            leather(meshutil.rounded_box(
                f"sofa.back_lower{i}",
                x0, -hd + BACK_DEPTH - 15.0, SEAT_HEIGHT,
                x1, -hd + BACK_DEPTH + 165.0, SEAT_HEIGHT + 290.0,
                radius=60.0,
            ))
            leather(meshutil.rounded_box(
                f"sofa.back_upper{i}",
                x0, -hd + BACK_DEPTH - 15.0, SEAT_HEIGHT + 305.0,
                x1, -hd + BACK_DEPTH + 150.0, BACK_HEIGHT - 30.0,
                radius=60.0,
            ))

        # -- Feet ----------------------------------------------------------
        inset = 90.0
        for fx in (-hw + inset, hw - inset):
            for fy in (-hd + inset, hd - inset):
                foot = meshutil.cylinder(
                    "sofa.foot", fx, fy, 0.0, FOOT_HEIGHT,
                    radius_mm=42.0, radius_top_mm=52.0, segments=8,
                )
                ctx.materials.assign(foot, FOOT)
                objects.append(foot)

        # -- Extended footrest, recliner only ------------------------------
        if spec.footrest:
            leather(meshutil.rounded_box(
                "sofa.footrest",
                inner_left, hd - 40.0, SEAT_HEIGHT - SEAT_CUSHION - 40.0,
                hw - ARM_WIDTH, hd + 500.0, SEAT_HEIGHT - 40.0,
                radius=55.0,
            ))

        # -- Scatter cushions ----------------------------------------------
        # Part of the sofa model rather than their own SKU. In a real
        # catalogue these would be a separate product; here they exist so the
        # advertising shot matches the showroom photograph.
        for i in range(spec.accent_cushions):
            offset = inner_left + SEAT_WIDTH * (0.5 + i * (spec.seats - 1 or 1))
            cushion = meshutil.rounded_box(
                f"sofa.cushion{i}",
                offset - 210.0, -hd + BACK_DEPTH + 60.0, SEAT_HEIGHT + 20.0,
                offset + 210.0, -hd + BACK_DEPTH + 190.0, SEAT_HEIGHT + 420.0,
                radius=85.0,
            )
            ctx.materials.assign(cushion, spec.accent_finish)
            objects.append(cushion)

        return objects

    return build


def build_coffee_table(ctx: BuildContext) -> list[bpy.types.Object]:
    """Dark timber coffee table with a glass inset and a lower shelf."""
    width, depth = 1200.0, 700.0
    hw, hd = width / 2.0, depth / 2.0
    top_z, thickness = 450.0, 55.0
    objects: list[bpy.types.Object] = []

    def timber(obj):
        ctx.materials.assign(obj, "timber_dark")
        objects.append(obj)
        return obj

    # Top, built as a frame around a glass panel.
    border = 130.0
    timber(meshutil.rounded_box(
        "table.top", -hw, -hd, top_z - thickness, hw, hd, top_z, radius=18.0,
    ))

    glass = meshutil.box(
        "table.glass",
        -hw + border, -hd + border, top_z - 12.0,
        hw - border, hd - border, top_z - 4.0,
    )
    ctx.materials.assign(glass, "glass")
    objects.append(glass)

    # Lower shelf.
    timber(meshutil.rounded_box(
        "table.shelf",
        -hw + 110.0, -hd + 90.0, 150.0,
        hw - 110.0, hd - 90.0, 185.0, radius=14.0,
    ))

    # Turned legs.
    for lx in (-hw + 105.0, hw - 105.0):
        for ly in (-hd + 95.0, hd - 95.0):
            leg = meshutil.cylinder(
                "table.leg", lx, ly, 0.0, top_z - thickness,
                radius_mm=42.0, radius_top_mm=34.0, segments=10,
            )
            timber(leg)

    return objects


def build_rug(ctx: BuildContext) -> list[bpy.types.Object]:
    """Woven jute rug. Flat, but it anchors the whole arrangement."""
    width, depth = 3000.0, 2200.0
    rug = meshutil.rounded_box(
        "rug.jute",
        -width / 2.0, -depth / 2.0, 0.0,
        width / 2.0, depth / 2.0, 16.0,
        radius=6.0,
    )
    ctx.materials.assign(rug, "jute")
    return [rug]
