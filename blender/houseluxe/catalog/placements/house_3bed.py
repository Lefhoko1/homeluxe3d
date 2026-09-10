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
        x=8400.0, y=830.0, rotation=0.0,
        note=(
            "Backs onto the south wall, 125mm clear of it, under its "
            "window. MOVED 400mm EAST TO OPEN THE FRONT DOOR: at x 7900 "
            "its west end was 451mm from the media console, and a 260mm "
            "walker needs 520mm to pass, let alone the 300mm of clearance "
            "the route is solved at. The solver could not get from the "
            "front door into the room, so it took the visitor the long way "
            "round the outside of the house and in through the dining "
            "slider -- which is what a person watching the tour reported. "
            "636mm was not enough either -- that is 318mm of clearance "
            "and the solver works on a grid, so a channel inflated by its "
            "300mm margin left too little for a cell to land in. At x 8300 "
            "the channel is 851mm and the clearance 425mm, which clears "
            "the widest rung on the ladder. It sits 215mm east of centre "
            "under its window; a door you can walk through is worth more."
        ),
    ),
    # Two-seater on the west, facing east across the rug. MOVED NORTH from
    # y 2500 to make room for the media console below it: the west wall is
    # the living room's only solid run and the two now share it end to end.
    Placement(
        product_id="bradlows.sandton-sofa-2",
        house=HOUSE, room="dining",
        x=11150.0, y=830.0, rotation=0.0,
        note=(
            "Under the dining window, backing onto the south wall, the "
            "same way the three-seater sits under its own. AT x 10700 IT "
            "STOOD 90mm OFF THE BACK OF THE RECLINER -- two seats in two "
            "rooms either side of the open boundary, reading as one sofa "
            "parked behind another. It lost the west wall to the media "
            "console; this is where it went."
        ),
    ),
    # ---- The media wall, on the living room's one solid stretch ----------
    #
    # THE WEST WALL IS THE ONLY WALL THIS ROOM HAS. Measured rather than
    # remembered, because the last three placements in this house were not:
    #
    #   west   x 5650/5710, solid y -470..3905    4375mm
    #   south  y 230, but 2400mm of it is a window, and the three-seater
    #          is already under it
    #   north  open to the hall -- and the solved walk runs along it at
    #          y 3810, which is what a console stood there would block
    #   east   open to the dining room
    #
    # AND THE FRONT DOOR TAKES THE FIRST 819mm OF IT. `entry.front_door`
    # hinges at x 6740 and swings inward on an 880mm leaf, so anything
    # standing closer than that to the hinge stops it. Stood at the wall's
    # south end the console jammed the front door at 19 degrees, which is not
    # a door.
    #
    # So the usable wall is 869..3905, which is 3036mm. The console is 1845mm
    # and the two-seater 1780mm: 3625mm. THE WALL HOLDS ONE OF THEM.
    #
    # Moving the whole living/dining wing 700mm south was tried, and reverted.
    # It did lengthen the wall and carry the door's swing with it, and it
    # broke the house: the wing ate 700mm of the terrace it stands on, and the
    # re-solved route left by the front door, ran down the OUTSIDE of the east
    # wall and came back in through it -- there is no opening there. The tour
    # lost the dining room and the kitchen. A 589mm furniture problem is not
    # worth moving a building for.
    #
    # The two-seater therefore stands on the dining side of the open plan,
    # turned west to face the television. Living and dining are one room with
    # one floor, so it has not left the lounge so much as moved along it. If
    # it is wanted back on the west wall, the console is the thing that has to
    # go somewhere else -- they cannot both be there.
    #
    # THE WALL IS NOT FLUSH. `ext.step` and `ext.south.wing` stand proud to
    # x 5710 for the first 1230mm, so the console sits 60mm further into the
    # room than the sofa above it does. Standing it at 5930 would bury its
    # back corner in that pier.
    Placement(
        product_id="bradlows.modern-black-tv-console",
        house=HOUSE, room="living",
        x=5990.0, y=2650.0, rotation=-90.0,
        note=(
            "West wall, and its centre is pinned between two doors. It "
            "must sit far enough NORTH that its padded footprint clears "
            "the open front-door leaf -- the solver paints the leaf where "
            "it comes to rest, 880mm into the room, and console plus leaf "
            "sealed the only way in -- and far enough SOUTH to leave the "
            "master bedroom door its swing, 397mm at y 2650 against the "
            "260mm a walker needs. The window is 2452..2810; this is the "
            "middle of it."
        ),
    ),
    # The television on top of it, 780mm up, tucked back against the console's
    # upper backboard the way it stands in the reference photographs. Its
    # base is above the walk band, so it is inside the console's footprint as
    # far as the route is concerned -- see clearance.test.mjs.
    Placement(
        product_id="bradlows.sansui-50-fhd-google-tv",
        house=HOUSE, room="living",
        x=5860.0, y=2650.0, z=780.0, rotation=-90.0,
        note="Stands on the Modern Black console, facing east into the room.",
    ),
    # Recliner on the east, facing west. Its footrest extends toward the
    # room centre, which is why the coffee table sits west of centre.
    Placement(
        product_id="bradlows.sandton-recliner",
        house=HOUSE, room="living",
        x=9400.0, y=2500.0, rotation=90.0,
        note="Footrest extends west into the open floor.",
    ),
    # The media wall, on bedroom 2's foot wall facing the bed. NOT the living
    # room: see `_media_wall` in config/slots_3bed.py for why the open-plan
    # lounge has no wall long enough to take it, and what happened when it was
    # stood across the threshold instead.
    Placement(
        product_id="bradlows.juliet-tv-stand",
        house=HOUSE, room="bed2",
        x=9440.0, y=8497.0, rotation=0.0,
        note="Foot wall of bedroom 2, facing the bed; 1870mm wide.",
    ),
    Placement(
        product_id="bradlows.sansui-50-fhd-google-tv",
        house=HOUSE, room="bed2",
        x=9440.0, y=8601.0, rotation=0.0, z=800.0,
        note="Stands on the Juliet's top plank, facing the bed.",
    ),
    Placement(
        product_id="bradlows.oakwood-coffee-table",
        house=HOUSE, room="living",
        x=8200.0, y=2600.0, rotation=0.0,
        note=(
            "On the rug between the sofa and the recliner. MOVED EAST OFF "
            "THE WAY IN: at x 7700 its padded footprint met the console's "
            "and closed the only corridor from the front door to the rest "
            "of the house."
        ),
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
