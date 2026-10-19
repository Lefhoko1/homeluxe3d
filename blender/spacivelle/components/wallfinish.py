"""Wall finishes -- the paintable surface of every wall, per room.

WHY THIS EXISTS SEPARATELY FROM THE WALLS.

A wall is one solid thing, but its two faces belong to two different rooms:
the wall between the bathroom and the hallway is tiled on one side and
painted on the other. A single material on the wall object cannot express
that, so "the bedroom is gamazine sky blue" was unsayable.

So the structure stays as it is, and this component adds a thin SKIN over
each wall face, named and materialled by the room it faces. A shop's paint or
coating is then applied to `wall.<room>`, and only that room changes.

The skins are built from the same solid spans the walls use, so a doorway or
a window is a gap in the skin exactly as it is a gap in the wall -- nothing
paints over the glass.
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

#: How far the skin stands proud of the wall face. Enough to win the depth
#: test at any viewing angle, small enough to be invisible in section.
SKIN = 6.0

#: How far outside the face to probe when asking "which room is this?".
PROBE = 120.0

#: Surface for anything facing outdoors.
EXTERIOR_SURFACE = "wall.exterior"


class WallFinishComponent(Component):
    """A paintable skin on every wall face, grouped by room."""

    category = "wall_finishes"
    label = "Wall finishes"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        plan = ctx.plan
        objects: list[bpy.types.Object] = []

        # Room lookup by point. Rooms are rectangles, so "which room is this
        # face in?" is a containment test rather than anything geometric.
        rooms = plan.rooms

        def room_at(x: float, y: float):
            for room in rooms:
                if room.x0 <= x <= room.x1 and room.y0 <= y <= room.y1:
                    return room
            return None

        # Collect skins per surface so each room becomes ONE object -- a room
        # is repainted as a unit, and one mesh per room keeps the export small.
        by_surface: dict[str, list[bpy.types.Object]] = {}

        for wall in plan.walls:
            frame = WallFrame.of(wall)
            half = wall.thickness / 2.0

            for span in solid_spans(wall, extend_ends=False):
                # Skirting-height start: paint does not run onto the slab.
                z0 = max(span.z0, 0.0)
                z1 = span.z1
                if z1 - z0 < 50.0:
                    continue

                for sign in (1.0, -1.0):
                    mid = (span.s0 + span.s1) / 2.0
                    px, py = frame.point(mid, sign * (half + PROBE))
                    room = room_at(px, py)

                    if room is None:
                        # No room on this side. Only the OUTSIDE of an
                        # exterior wall gets a finish; the far side of an
                        # internal wall facing an undeclared space does not.
                        if not wall.exterior:
                            continue
                        surface = EXTERIOR_SURFACE
                    else:
                        surface = f"wall.{room.name}"

                    a = frame.bounds(span.s0, span.s1, inset=-SKIN)
                    b = frame.bounds(span.s0, span.s1, inset=0.0)
                    # The skin occupies the sliver between the wall face and
                    # SKIN beyond it, on this side only.
                    if wall.is_horizontal:
                        y_face = frame.origin[1] + sign * half
                        y0, y1 = sorted((y_face, y_face + sign * SKIN))
                        x0, x1 = a[0], a[2]
                    else:
                        x_face = frame.origin[0] + sign * half
                        x0, x1 = sorted((x_face, x_face + sign * SKIN))
                        y0, y1 = a[1], a[3]

                    skin = meshutil.box(
                        f"{surface}.{wall.name}.{int(span.s0)}",
                        x0, y0, z0, x1, y1, z1,
                    )
                    by_surface.setdefault(surface, []).append(skin)

        for surface, parts in sorted(by_surface.items()):
            merged = meshutil.join(parts, surface)
            # Registered on demand: a new room needs no library edit.
            ctx.materials.ensure(surface)
            ctx.materials.assign(merged, surface)
            objects.append(merged)

        if not objects:
            ctx.warn("no wall finishes were produced")

        return objects
