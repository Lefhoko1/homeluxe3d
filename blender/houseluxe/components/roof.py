"""Hipped roof.

The roof is generated from pitch and span rather than from stated heights, so
changing the pitch produces a roof that is still geometrically correct. Ridge
height is an OUTPUT of this module, not an input.

A hip over a rectangle is exact and worth doing properly: inset each end by
half the short span, join the two inset points with a ridge, and the four
faces fall out as two trapezoids and two triangles, every one of them at the
true pitch.
"""

from __future__ import annotations

import math

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component
from ..config.plan import RoofSpec


def hip_surface(
    name: str,
    x0: float, y0: float, x1: float, y1: float,
    eave_z: float,
    pitch_degrees: float,
) -> tuple[bpy.types.Object, float]:
    """Build a hipped roof surface over a rectangle. Returns (object, rise).

    The rectangle passed in is the EAVE line -- overhang is already included
    by the caller. Ridge runs along whichever axis is longer.
    """
    width = x1 - x0
    depth = y1 - y0
    tan_pitch = math.tan(math.radians(pitch_degrees))

    if width >= depth:
        inset = depth / 2.0
        rise = inset * tan_pitch
        cy = (y0 + y1) / 2.0
        ridge_a = (x0 + inset, cy)
        ridge_b = (x1 - inset, cy)
    else:
        inset = width / 2.0
        rise = inset * tan_pitch
        cx = (x0 + x1) / 2.0
        ridge_a = (cx, y0 + inset)
        ridge_b = (cx, y1 - inset)

    ridge_z = eave_z + rise

    from ..core.units import m

    verts = [
        (m(x0), m(y0), m(eave_z)),          # 0  eave SW
        (m(x1), m(y0), m(eave_z)),          # 1  eave SE
        (m(x1), m(y1), m(eave_z)),          # 2  eave NE
        (m(x0), m(y1), m(eave_z)),          # 3  eave NW
        (m(ridge_a[0]), m(ridge_a[1]), m(ridge_z)),   # 4
        (m(ridge_b[0]), m(ridge_b[1]), m(ridge_z)),   # 5
    ]

    if width >= depth:
        faces = [
            (0, 1, 5, 4),   # south trapezoid
            (1, 2, 5),      # east hip
            (2, 3, 4, 5),   # north trapezoid
            (3, 0, 4),      # west hip
        ]
    else:
        faces = [
            (0, 1, 4),      # south hip
            (1, 2, 5, 4),   # east trapezoid
            (2, 3, 5),      # north hip
            (3, 0, 4, 5),   # west trapezoid
        ]

    return meshutil.mesh_from_pydata(name, verts, faces), rise


def fascia_ring(
    name: str,
    x0: float, y0: float, x1: float, y1: float,
    eave_z: float,
    spec: RoofSpec,
) -> bpy.types.Object:
    """Four fascia boards around the eave line."""
    top = eave_z
    bottom = eave_z - spec.fascia_depth
    t = spec.fascia_thickness

    boards = [
        meshutil.box(f"{name}.south", x0 - t, y0 - t, bottom, x1 + t, y0, top),
        meshutil.box(f"{name}.north", x0 - t, y1, bottom, x1 + t, y1 + t, top),
        meshutil.box(f"{name}.west", x0 - t, y0 - t, bottom, x0, y1 + t, top),
        meshutil.box(f"{name}.east", x1, y0 - t, bottom, x1 + t, y1 + t, top),
    ]
    return meshutil.join(boards, name)


class RoofComponent(Component):
    """Main hip plus the porch hip, and their fascias."""

    category = "roof"
    label = "Roof"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        spec = ctx.plan.roof
        objects: list[bpy.types.Object] = []

        # -- Main roof -----------------------------------------------------
        sx0, sy0, sx1, sy1 = spec.span
        oh = spec.overhang
        ex0, ey0, ex1, ey1 = sx0 - oh, sy0 - oh, sx1 + oh, sy1 + oh

        main, rise = hip_surface(
            self.object_name("main"), ex0, ey0, ex1, ey1,
            spec.eave_height, spec.pitch_degrees,
        )
        meshutil.solidify(main, spec.thickness, offset=1.0)
        ctx.materials.assign(main, "roof_metal")
        objects.append(main)

        ridge_height = spec.eave_height + rise
        ctx.warn(
            f"derived ridge height is {ridge_height:.0f}mm "
            f"(elevations print 5,140mm) -- see plan notes"
        )

        fascia = fascia_ring(
            self.object_name("fascia"), ex0, ey0, ex1, ey1, spec.eave_height, spec
        )
        ctx.materials.assign(fascia, "fascia_gutter")
        objects.append(fascia)

        # -- Wings ---------------------------------------------------------
        # One hip each, meeting the main roof where they abut it. A wing is
        # roofed on its own terms rather than by stretching `span` around it:
        # stretching would throw roof over the open ground on the inside of
        # the L, and the ridge would run at a height the wing's own walls
        # cannot support.
        for index, wing in enumerate(spec.wings):
            wx0, wy0, wx1, wy1 = wing
            surface, _ = hip_surface(
                self.object_name(f"wing{index}"),
                wx0 - oh, wy0 - oh, wx1 + oh, wy1 + oh,
                spec.eave_height, spec.pitch_degrees,
            )
            meshutil.solidify(surface, spec.thickness, offset=1.0)
            ctx.materials.assign(surface, "roof_metal")
            objects.append(surface)

            wing_fascia = fascia_ring(
                self.object_name(f"wing{index}_fascia"),
                wx0 - oh, wy0 - oh, wx1 + oh, wy1 + oh,
                spec.eave_height, spec,
            )
            ctx.materials.assign(wing_fascia, "fascia_gutter")
            objects.append(wing_fascia)

        # -- Porch roof ----------------------------------------------------
        if ctx.plan.porch is not None:
            px0, py0, px1, py1 = ctx.plan.porch
            porch, _ = hip_surface(
                self.object_name("porch"),
                px0 - oh, py0 - oh, px1 + oh, py1,
                spec.eave_height, spec.pitch_degrees,
            )
            meshutil.solidify(porch, spec.thickness, offset=1.0)
            ctx.materials.assign(porch, "roof_metal")
            objects.append(porch)

            porch_fascia = fascia_ring(
                self.object_name("porch_fascia"),
                px0 - oh, py0 - oh, px1 + oh, py1,
                spec.eave_height, spec,
            )
            ctx.materials.assign(porch_fascia, "fascia_gutter")
            objects.append(porch_fascia)

        return objects
