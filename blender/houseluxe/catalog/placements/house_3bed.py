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


# --------------------------------------------------------------------------
# Master bedroom.
#
# Clear extents, from config/plan_3bed.py:
#     x 1,940 .. 5,540    (3.6m wide)
#     y 1,230 .. 4,830    (3.6m deep)
#
# HEAD AGAINST THE NORTH WALL, and the reason is the other three. The east
# wall carries the door into the room at y 4,315, the west wall carries the
# ensuite door and the walk-in robe opening, and the south wall is the window.
# The north wall is the only unbroken one in the room, which is exactly why a
# bed goes there and why saying so is worth a line: change the plan and put a
# door in it, and this placement has to move.
#
# AND IT DID. The bedroom door used to open into the hall -- doors were hung
# at run time, away from whoever approached them -- and now it opens into the
# bedroom, which is where a bedroom door belongs and where the bed is. Fully
# open, the leaf stands square to the east wall reaching to x 4,813, and the
# bed's east edge was at 4,500: a 313mm gap, in a house whose walking
# character is 520mm across. The whole west half of the room, the ensuite and
# the walk-in robe were unreachable, and the route solver said so.
#
# Sliding it west only traded one pinch for another -- 780mm to the wardrobe
# wall on the far side. The bed heads the SOUTH wall now, which is the wall
# furthest from the door, and the room opens up: the same 1,720mm of clear
# floor at the foot, measured from the other end, and the tour still stands at
# the foot and looks back along the bed. `slots._head_wall` picks that wall
# from the plan rather than from this comment, so the arrangement and the
# inventory cannot drift apart. See config/swing.py.
#
# The queen is 1,520 x 1,880, so headed north it runs y 2,950..4,830 and
# leaves 1,720mm of floor at the foot -- enough for the guided tour to stand
# at the end of the bed and look back along it, which is the shot that sells a
# bed.
# --------------------------------------------------------------------------
MASTER_BEDROOM = [
    Placement(
        product_id="bears.slumberland-maharani-queen",
        house=HOUSE, room="master",
        x=3740.0, y=2170.0, rotation=180.0,
        note="Head to the south wall, away from the door's swing.",
    ),
]

PLACEMENTS = LIVING_ROOM + MASTER_BEDROOM


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

# --------------------------------------------------------------------------
# Door hardware.
#
# A hinge is not placed the way a sofa is. It is screwed to a door, every door
# has three, and `components/openings.py` fits them as part of the joinery --
# so there is nothing here to position.
#
# It is advertised the way a TILE is instead: the product names the material
# its geometry wears, a click on any hinge in the house traces back to it, and
# it appears in the room list for the room whose door it hangs. The hall is
# where a visitor meets the most of them.
# --------------------------------------------------------------------------
DOOR_HARDWARE = [
    Placement(
        product_id="tubod.door-hinge",
        house=HOUSE, room="hall",
        surface="hinge_black",
        note="Three per leaf on every hinged door in the house.",
    ),
]

PLACEMENTS = (
    LIVING_ROOM + MASTER_BEDROOM + FLOOR_FINISHES + WALL_FINISHES + DOOR_HARDWARE
)
