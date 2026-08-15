"""Where each product stands in the 3-bedroom house.

Placement is data, kept apart from the products themselves so that
rearranging a room never touches geometry and never triggers a re-export.

All coordinates are the house's own millimetres, and each is the product's
FOOTPRINT CENTRE. Rotation is degrees counter-clockwise about Z seen from
above, with 0 facing +Y (north).

Living room clear extents, from config/plan_3bed.py:
    x 5,650 .. 10,150      (4.5m wide)
    y   230 ..  4,230      (4.0m deep)

The arrangement is the standard showroom three-piece: the long sofa against
the window wall, the two-seater and the recliner facing each other across a
rug, and the coffee table off-centre so the recliner's footrest has somewhere
to go when it extends.
"""

from __future__ import annotations

from ..product import Placement

HOUSE = "3bed"

LIVING_ROOM = [
    # Rug first -- everything else sits on it.
    Placement(
        product_id="bradlows.woven-jute-rug",
        house=HOUSE, room="living",
        x=7800.0, y=2300.0, rotation=0.0,
        note="Anchors the seating arrangement.",
    ),
    # Three-seater against the south wall, under the living room window.
    Placement(
        product_id="bradlows.sandton-sofa-3",
        house=HOUSE, room="living",
        x=7900.0, y=830.0, rotation=0.0,
        note="Backs onto the south wall, 125mm clear of it.",
    ),
    # Two-seater on the west, facing east across the rug.
    Placement(
        product_id="bradlows.sandton-sofa-2",
        house=HOUSE, room="living",
        x=6300.0, y=2500.0, rotation=-90.0,
        note="Faces east toward the recliner.",
    ),
    # Recliner on the east, facing west. Its footrest extends toward the
    # room centre, which is why the coffee table sits west of centre.
    Placement(
        product_id="bradlows.sandton-recliner",
        house=HOUSE, room="living",
        x=9400.0, y=2500.0, rotation=90.0,
        note="Footrest extends west into the open floor.",
    ),
    Placement(
        product_id="bradlows.oakwood-coffee-table",
        house=HOUSE, room="living",
        x=7700.0, y=2350.0, rotation=0.0,
        note="Off-centre west, clearing the recliner footrest by ~100mm.",
    ),
]

PLACEMENTS = LIVING_ROOM


# --------------------------------------------------------------------------
# Finishes.
#
# A finish is not placed anywhere -- it dresses a surface the house already
# has. `surface` names the material Blender baked into that surface, and the
# product supplies what it should look like instead.
#
# These live here rather than only in the database so the STATIC catalogue
# matches it. Without them the app's offline fallback shows a house with no
# floor tiles and no paint, which is a different house.
# --------------------------------------------------------------------------
TILED_FLOORS = ["living", "dining", "hall", "master", "bed2", "bed3"]

FLOOR_FINISHES = [
    Placement(
        product_id="tubod.pyc61001",
        house=HOUSE, room=room,
        surface="tile_pyc61001",
        note="Floor tiled in PYC61001 Carrara porcelain.",
    )
    for room in TILED_FLOORS
]

#: Which coating or paint each room's walls wear. The admin will edit this
#: through a screen; until then it is a list.
WALL_FINISHES = [
    Placement(product_id="tubod.gamazine-exterior", house=HOUSE, room="exterior",
              surface="wall.exterior", variant="sandstone",
              note="Exterior in Gamazine Sandstone."),
    Placement(product_id="tubod.gamazine-interior", house=HOUSE, room="master",
              surface="wall.master", variant="sky",
              note="Master bedroom in Gamazine Sky Blue."),
    Placement(product_id="tubod.premium-interior-paint", house=HOUSE, room="living",
              surface="wall.living", variant="chalk",
              note="Living room in Chalk White."),
    Placement(product_id="tubod.premium-interior-paint", house=HOUSE, room="bed2",
              surface="wall.bed2", variant="sage",
              note="Bedroom 2 in Sage."),
    Placement(product_id="tubod.wall-tile-satin-white", house=HOUSE, room="bathroom",
              surface="wall.bathroom",
              note="Bathroom walls in satin white tile."),
]

PLACEMENTS = LIVING_ROOM + FLOOR_FINISHES + WALL_FINISHES
