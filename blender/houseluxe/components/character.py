"""Tour character.

A small stylised figure the visitor drives around the property. Not a product
and not part of the building -- it is a viewer affordance, like the camera --
but it is modelled here anyway so it can be restyled without touching app
code, the same as everything else.

Built to the product convention: footprint centred on (0, 0), feet at z = 0,
FACING +Y. The tour controller assumes that heading, so a character modelled
facing another way will walk backwards.

Roughly 1.7m tall, so it reads at true scale against 2.4m ceilings and a
900mm sill -- the whole point of walking through is to feel those heights.
"""

from __future__ import annotations

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component

HEIGHT = 1700.0


class CharacterComponent(Component):
    """Low-poly figure for the walk-through tour."""

    category = "character"
    label = "Tour character"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        objects: list[bpy.types.Object] = []

        def part(obj, finish):
            ctx.materials.assign(obj, finish)
            objects.append(obj)
            return obj

        # -- Legs ----------------------------------------------------------
        for side, x in (("left", -95.0), ("right", 95.0)):
            part(
                meshutil.cylinder(
                    f"character.leg_{side}", x, 0.0, 60.0, 880.0,
                    radius_mm=78.0, radius_top_mm=92.0, segments=10,
                ),
                "character_trousers",
            )
            part(
                meshutil.rounded_box(
                    f"character.shoe_{side}",
                    x - 85.0, -150.0, 0.0,
                    x + 85.0, 110.0, 65.0,
                    radius=25.0,
                ),
                "character_shoes",
            )

        # -- Torso ---------------------------------------------------------
        part(
            meshutil.rounded_box(
                "character.hips", -150.0, -105.0, 830.0, 150.0, 105.0, 960.0,
                radius=45.0,
            ),
            "character_trousers",
        )
        part(
            meshutil.rounded_box(
                "character.torso", -185.0, -115.0, 940.0, 185.0, 115.0, 1400.0,
                radius=70.0,
            ),
            "character_shirt",
        )

        # -- Arms ----------------------------------------------------------
        for side, x in (("left", -225.0), ("right", 225.0)):
            part(
                meshutil.cylinder(
                    f"character.arm_{side}", x, 0.0, 980.0, 1380.0,
                    radius_mm=52.0, radius_top_mm=62.0, segments=8,
                ),
                "character_shirt",
            )
            part(
                meshutil.sphere(
                    f"character.hand_{side}", x, 0.0, 960.0, radius_mm=58.0,
                    subdivisions=1,
                ),
                "character_skin",
            )

        # -- Head ----------------------------------------------------------
        part(
            meshutil.cylinder(
                "character.neck", 0.0, 0.0, 1390.0, 1450.0,
                radius_mm=55.0, segments=8,
            ),
            "character_skin",
        )
        part(
            meshutil.sphere(
                "character.head", 0.0, 0.0, 1560.0, radius_mm=125.0,
                subdivisions=2, scale=(1.0, 1.05, 1.15),
            ),
            "character_skin",
        )
        # A nose, purely so you can tell which way it is facing.
        part(
            meshutil.sphere(
                "character.nose", 0.0, 125.0, 1555.0, radius_mm=32.0,
                subdivisions=1,
            ),
            "character_skin",
        )

        return objects
