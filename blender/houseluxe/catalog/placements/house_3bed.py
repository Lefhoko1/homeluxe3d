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
