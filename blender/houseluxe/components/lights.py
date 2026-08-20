"""Ceiling lights.

Every room gets real fittings in its ceiling, laid out on a grid sized to the
room. Two things come out of this:

  - GEOMETRY, so the ceiling looks like the ceiling of a house rather than a
    blank plane. A lit room with nothing overhead reads as wrong even when
    nobody consciously notices why.

  - POSITIONS, written to `lights.json`, so the three.js side can put an
    actual light at each fitting instead of inventing coordinates. That is the
    same division products and trees already follow: geometry is an asset,
    position is data.

WHY A GRID AND NOT ONE IN THE MIDDLE

One fitting in the centre of a room is how a room gets a bright middle and
four dark corners -- exactly the blotchiness that made the earlier attempt at
interior lighting worse than none. Spacing on a grid whose count follows the
floor area gives even light, which is what "daylight" has to mean here: not a
colour temperature alone but the absence of pools.
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


class LightsComponent(Component):
    """Recessed downlights across every room's ceiling."""

    category = "lights"
    label = "Ceiling lights"

    #: Fitting size. A 300mm downlight plate is a common domestic LED panel.
    DIAMETER = 300.0
    #: How far the lens hangs below the ceiling, so it is visible from below
    #: rather than co-planar with the ceiling and z-fighting it.
    DROP = 22.0
    #: Rim depth above the lens.
    RIM = 26.0

    #: Roughly one fitting per this many square metres of floor.
    #:
    #: Since every fitting is the same brightness (see export/lights_json.py),
    #: this is the only thing deciding how well lit a room is. 5.5 m2 gives
    #: the living room three; the kitchen, dining, hall and all three bedrooms
    #: two; and the wet rooms one each -- close to how a house is wired.
    AREA_PER_LIGHT = 5.5
    #: Never fewer than one, never more than this many, per room.
    MAX_PER_ROOM = 4
    #: Keep fittings this far off the walls, so none sits in a cornice.
    EDGE_MARGIN = 700.0

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        plan = ctx.plan
        ceiling = plan.ceiling.height
        objects: list[bpy.types.Object] = []

        for room, x, y in self.fittings(plan):
            base = f"light.{room.name}.{len(objects) // 2}"

            # The rim: a shallow ring the lens sits inside.
            rim = meshutil.cylinder(
                f"{base}.rim",
                x, y,
                ceiling - self.RIM - self.DROP,
                ceiling,
                radius_mm=self.DIAMETER / 2.0,
                segments=20,
            )
            ctx.materials.assign(rim, "light_fitting")

            # The lens: what actually appears to glow.
            lens = meshutil.cylinder(
                f"{base}.lens",
                x, y,
                ceiling - self.RIM - self.DROP,
                ceiling - self.RIM,
                radius_mm=self.DIAMETER / 2.0 - 24.0,
                segments=20,
            )
            ctx.materials.assign(lens, "light_lens")

            objects.extend((rim, lens))

        return objects

    @classmethod
    def fittings(cls, plan) -> list[tuple[object, float, float]]:
        """Every fitting position, as (room, x, y) in plan millimetres.

        A classmethod because the JSON exporter needs exactly this list and
        must not be able to disagree with the geometry about where the lights
        are. One source, two consumers.
        """
        out: list[tuple[object, float, float]] = []

        for room in plan.rooms:
            width = room.x1 - room.x0
            depth = room.y1 - room.y0
            area = (width * depth) / 1_000_000.0

            wanted = max(1, min(cls.MAX_PER_ROOM, round(area / cls.AREA_PER_LIGHT)))

            # Lay them out as 1x1, 1x2, 2x2 -- along the room's longer axis
            # first, so a corridor gets a row rather than a square.
            if wanted <= 1:
                cols, rows = 1, 1
            elif wanted == 2:
                cols, rows = (2, 1) if width >= depth else (1, 2)
            elif wanted == 3:
                cols, rows = (3, 1) if width >= depth else (1, 3)
            else:
                cols, rows = 2, 2

            # Margins collapse toward the centre in a room too small to hold
            # them, which is what keeps a 1.1m WC from putting its light in
            # the wall.
            mx = min(cls.EDGE_MARGIN, width / 3.0)
            my = min(cls.EDGE_MARGIN, depth / 3.0)

            for cx in range(cols):
                for ry in range(rows):
                    fx = _spread(room.x0 + mx, room.x1 - mx, cols, cx)
                    fy = _spread(room.y0 + my, room.y1 - my, rows, ry)
                    out.append((room, fx, fy))

        return out


def _spread(low: float, high: float, count: int, index: int) -> float:
    """Evenly place `index` of `count` between two bounds, inclusive."""
    if count <= 1:
        return (low + high) / 2.0
    return low + (high - low) * index / (count - 1)
