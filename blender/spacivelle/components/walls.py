"""Wall components.

Exterior and interior walls are separate components even though they share
their geometry routine, because they are separate *decisions*: re-cladding the
outside of the house should not re-export the partitions, and moving a
partition should not touch the brickwork.

Each Wall in the plan becomes exactly one object, named after the wall. That
name survives into the GLB, so three.js can address `ext.north` directly.
"""

from __future__ import annotations

try:
    import bpy
except ModuleNotFoundError:                 # pragma: no cover
    # Importable without Blender, so the plain-Python tools that solve the
    # route and the collision model can read the catalogue. See core/mesh.py.
    bpy = None

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component
from ..core.wallmath import WallFrame, solid_spans
from ..config.plan import Wall


def build_wall_object(wall: Wall, name: str) -> bpy.types.Object:
    """Turn one Wall into one mesh object, openings already subtracted."""
    frame = WallFrame.of(wall)
    pieces: list[bpy.types.Object] = []

    for index, span in enumerate(solid_spans(wall)):
        x0, y0, x1, y1 = frame.bounds(span.s0, span.s1)
        pieces.append(
            meshutil.box(f"{name}.{span.tag}.{index}", x0, y0, span.z0, x1, y1, span.z1)
        )

    if not pieces:
        raise ValueError(f"wall {wall.name!r} produced no geometry")

    return meshutil.join(pieces, name)


class _WallsBase(Component):
    """Shared build loop. Subclasses choose which walls and which finish."""

    finish = "plaster_white"

    def walls_from(self, ctx: BuildContext) -> list[Wall]:
        raise NotImplementedError

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        objects: list[bpy.types.Object] = []

        for wall in self.walls_from(ctx):
            obj = build_wall_object(wall, self.object_name(wall.name))
            ctx.materials.assign(obj, self.finish)
            objects.append(obj)

        return objects


class ExteriorWallsComponent(_WallsBase):
    """230mm brick veneer envelope."""

    category = "walls_exterior"
    label = "Exterior walls"
    finish = "brick_face"

    def walls_from(self, ctx: BuildContext) -> list[Wall]:
        return ctx.plan.exterior_walls


class InteriorWallsComponent(_WallsBase):
    """110mm painted stud partitions."""

    category = "walls_interior"
    label = "Interior walls"
    finish = "plaster_white"

    def walls_from(self, ctx: BuildContext) -> list[Wall]:
        return ctx.plan.interior_walls
