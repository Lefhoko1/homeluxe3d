"""The 3-bedroom house, transcribed from blender/reference/HousePlans/3bedroomedHouse/.

WHAT IS EXACT (taken straight off the drawings)
    * Overall envelope 13,200 x 11,400
    * Eave height 2,400, roof pitch 25 degrees
    * External walls 230 brick veneer
    * The clear dimensions printed in each room label

WHAT IS DERIVED (best fit -- verify before you build anything real)
    Interior wall positions. The source is a rendered image, not CAD, so wall
    centrelines were fitted to satisfy the printed room sizes inside the
    printed envelope. Every one is a single editable line below; nudging a
    wall is a one-number change and a rebuild.

See `NOTES` at the bottom for the places where the drawings disagree with
themselves and what was chosen instead.
"""

from __future__ import annotations

from .plan import (
    HousePlan,
    Opening,
    OpeningKind,
    Room,
    RoofSpec,
    SlabSpec,
    Wall,
)

# --------------------------------------------------------------------------
# Standard dimensions. Change here, not at each use site.
# --------------------------------------------------------------------------
EXT_THICKNESS = 230.0     # brick veneer, per the elevation notes
INT_THICKNESS = 110.0     # 90mm stud + linings
WALL_HEIGHT = 2400.0      # eave height = ceiling height

WIN_SILL = 900.0
WIN_HEAD = 2100.0
WET_SILL = 1500.0         # obscure glazing to bathrooms / ensuite
DOOR_HEAD = 2100.0

DOOR_W = 820.0            # bedroom / living doors
DOOR_W_NARROW = 770.0     # wet areas
ENTRY_W = 1000.0

HALF_EXT = EXT_THICKNESS / 2.0   # 115

W = OpeningKind.WINDOW
DX = OpeningKind.DOOR_EXTERNAL
DI = OpeningKind.DOOR_INTERNAL
SL = OpeningKind.SLIDING_DOOR
OP = OpeningKind.DOORWAY


def _ext(name, start, end, openings=()):
    return Wall(
        name=name, start=start, end=end,
        thickness=EXT_THICKNESS, height=WALL_HEIGHT,
        exterior=True, openings=tuple(openings),
    )


def _int(name, start, end, openings=()):
    return Wall(
        name=name, start=start, end=end,
        thickness=INT_THICKNESS, height=WALL_HEIGHT,
        exterior=False, openings=tuple(openings),
    )


# --------------------------------------------------------------------------
# External envelope.
#
# Outer face polygon, counter-clockwise. Two notches: the south-west one is
# the step in front of the master wing, the north-east one is where the
# laundry projects past the bedroom wing.
# --------------------------------------------------------------------------
FOOTPRINT = (
    (5480.0, 0.0),
    (13200.0, 0.0),
    (13200.0, 7600.0),
    (11200.0, 7600.0),
    # -- Bedroom 4 / office, projecting north off the bedroom corridor -----
    (11200.0, 15000.0),
    (6740.0, 15000.0),
    (6740.0, 11400.0),
    (0.0, 11400.0),
    (0.0, 7515.0),
    # -- Garage, attached on the west --------------------------------------
    (-6500.0, 7515.0),
    (-6500.0, 1000.0),
    (0.0, 1000.0),
    (5480.0, 1000.0),
)

# Wall centrelines sit 115mm inside the outer face.
EXTERIOR_WALLS = [
    # South wall of the living / dining wing. Runs EAST to WEST, so offsets
    # below are measured from the south-east corner.
    _ext(
        "ext.south.main", (13085.0, 115.0), (5595.0, 115.0),
        [
            Opening(W, 1700.0, 2400.0, WIN_HEAD, WIN_SILL, "dining.south"),
            Opening(W, 5000.0, 2400.0, WIN_HEAD, WIN_SILL, "living.south"),
            # MOVED EAST, and this is the fix for a real hole in the plan.
            #
            # The step used to stand at x 4,485 while the master's east wall
            # started at x 5,595 -- and only from y 1,115 upwards. That left a
            # pocket, x 4,485..5,595 by y 115..1,115, walled on two sides and
            # open on the other two: one into the living room and one INTO THE
            # MASTER BEDROOM. The front door, spanning x 5,100..6,100,
            # straddled the master's own wall line and opened straight into
            # it. A bedroom you can see into from the front step is not a
            # bedroom.
            #
            # The step now stands at x 5,595, so the wing's south wall runs
            # all the way to the master's east wall and the two meet. The
            # pocket is gone, and the door moved east to clear the junction.
            Opening(DX, 6785.0, ENTRY_W, DOOR_HEAD, 0.0, "entry.front_door"),
        ],
    ),
    # The 1,000mm step back to the master wing.
    _ext("ext.step", (5595.0, 115.0), (5595.0, 1115.0)),
    # South wall of the master / ensuite wing, running EAST to WEST.
    #
    # Offsets are measured from the step, which moved, so both windows were
    # re-measured to leave the glass exactly where it was on the elevation.
    _ext(
        "ext.south.wing", (5595.0, 1115.0), (115.0, 1115.0),
        [
            Opening(W, 2395.0, 1800.0, WIN_HEAD, WIN_SILL, "master.south"),
            Opening(W, 4565.0, 600.0, WIN_HEAD, WET_SILL, "ensuite.south"),
        ],
    ),
    # West wall, running SOUTH to NORTH.
    # West wall, running SOUTH to NORTH.
    #
    # THE GARAGE IS BUILT AGAINST THE SOUTHERN TWO THIRDS OF THIS WALL, so it
    # carries the door between the two and no longer carries the ensuite's
    # obscure pane -- a window into a garage is not a window. The ensuite
    # keeps its south light. bed3.west is well north of the garage and
    # unaffected.
    _ext(
        "ext.west", (115.0, 1115.0), (115.0, 11285.0),
        [
            Opening(DI, 5685.0, DOOR_W_NARROW, DOOR_HEAD, 0.0, "garage.door"),
            Opening(W, 8685.0, 1500.0, WIN_HEAD, WIN_SILL, "bed3.west"),
        ],
    ),
    # North wall of the bedroom wing, running WEST to EAST.
    #
    # SPLIT IN TWO BY THE OFFICE WING. What was one wall from x 115 to 11085
    # is now the length up to the wing (still exterior, still carrying three
    # windows) and then the wing's own walls. The stretch across the wing's
    # mouth became internal -- see `int.wing.south` -- because it is no longer
    # the outside of anything.
    #
    # bed2.north went with it: the wing stands where that window looked. The
    # room keeps bed2.east, so it is still a corner room with light.
    _ext(
        "ext.north.west", (115.0, 11285.0), (6855.0, 11285.0),
        [
            Opening(W, 1725.0, 1500.0, WIN_HEAD, WIN_SILL, "bed3.north"),
            Opening(W, 4495.0, 900.0, WIN_HEAD, WET_SILL, "bathroom.north"),
            Opening(W, 6195.0, 600.0, WIN_HEAD, WET_SILL, "wc.north"),
        ],
    ),

    # -- Bedroom 4 / office wing, projecting north -------------------------
    _ext("ext.wing.west", (6855.0, 11285.0), (6855.0, 14885.0)),
    _ext(
        "ext.wing.north", (6855.0, 14885.0), (11085.0, 14885.0),
        [Opening(W, 2115.0, 1800.0, WIN_HEAD, WIN_SILL, "bed4.north")],
    ),
    _ext(
        "ext.wing.east", (11085.0, 14885.0), (11085.0, 11285.0),
        [Opening(W, 1800.0, 1200.0, WIN_HEAD, WIN_SILL, "bed4.east")],
    ),

    # -- Garage, attached on the west --------------------------------------
    #
    # Its south wall is collinear with the master wing's, so the two read as
    # one elevation from the street. The vehicle door faces the driveway.
    _ext(
        "ext.garage.south", (115.0, 1115.0), (-6385.0, 1115.0),
        [Opening(OpeningKind.GARAGE_DOOR, 3250.0, 4800.0, 2100.0, 0.0,
                 "garage.vehicle_door")],
    ),
    _ext(
        "ext.garage.west", (-6385.0, 1115.0), (-6385.0, 7400.0),
        [Opening(W, 3140.0, 900.0, WIN_HEAD, WIN_SILL, "garage.west")],
    ),
    _ext("ext.garage.north", (-6385.0, 7400.0), (115.0, 7400.0)),
    # East wall of bedroom 2, running NORTH to SOUTH.
    _ext(
        "ext.east.upper", (11085.0, 11285.0), (11085.0, 7715.0),
        [Opening(W, 1800.0, 1500.0, WIN_HEAD, WIN_SILL, "bed2.east")],
    ),
    # North wall of the laundry projection.
    _ext("ext.north.laundry", (11085.0, 7715.0), (13085.0, 7715.0)),
    # East wall, running NORTH to SOUTH.
    _ext(
        "ext.east", (13085.0, 7715.0), (13085.0, 115.0),
        [
            Opening(W, 1115.0, 600.0, WIN_HEAD, WET_SILL, "laundry.east"),
            Opening(SL, 5515.0, 2400.0, DOOR_HEAD, 0.0, "dining.slider"),
        ],
    ),
]

# --------------------------------------------------------------------------
# Internal partitions.
# --------------------------------------------------------------------------
INTERIOR_WALLS = [
    # -- West wing: ensuite, walk-in robe, master -------------------------
    _int(
        "int.wetwing.east", (1885.0, 1115.0), (1885.0, 5495.0),
        [
            Opening(DI, 1785.0, DOOR_W_NARROW, DOOR_HEAD, 0.0, "ensuite.door"),
            Opening(OP, 3385.0, DOOR_W, DOOR_HEAD, 0.0, "wir.opening"),
        ],
    ),
    _int("int.ensuite.north", (115.0, 3585.0), (1885.0, 3585.0)),
    _int("int.wir.north", (115.0, 5495.0), (1885.0, 5495.0)),
    _int(
        "int.master.east", (5595.0, 1115.0), (5595.0, 4885.0),
        [Opening(DI, 3200.0, DOOR_W, DOOR_HEAD, 0.0, "master.door")],
    ),
    _int("int.master.north", (1885.0, 4885.0), (5595.0, 4885.0)),

    # -- North bedroom band ------------------------------------------------
    _int(
        "int.band.south.west", (115.0, 8145.0), (6855.0, 8145.0),
        [
            Opening(DI, 2485.0, DOOR_W, DOOR_HEAD, 0.0, "bed3.door"),
            Opening(DI, 3885.0, DOOR_W_NARROW, DOOR_HEAD, 0.0, "bathroom.door"),
            Opening(DI, 6185.0, DOOR_W_NARROW, DOOR_HEAD, 0.0, "wc.door"),
        ],
    ),
    _int("int.bed3.east", (3455.0, 8145.0), (3455.0, 11285.0)),
    # Reaches the corridor now. It used to stop at y 9,400, which left a
    # 3,400 x 1,255 lobby serving nothing but the two doors behind it -- and
    # took that depth out of the bathroom, leaving it 1,715mm deep and unable
    # to hold the bath, shower, WC and vanity that are advertised in it.
    _int("int.bathroom.east", (5655.0, 8145.0), (5655.0, 11285.0)),
    _int("int.wc.east", (6855.0, 8145.0), (6855.0, 11285.0)),
    # Bedroom 2 reaches south to the laundry line, which is 430mm the room
    # needed: at 8.8 m2 it could not take a double bed, a wardrobe and the
    # desk that section 7 advertises in it. The corridor keeps its width.
    _int(
        "int.bed2.west", (7955.0, 7715.0), (7955.0, 11285.0),
        [Opening(DI, 1230.0, DOOR_W, DOOR_HEAD, 0.0, "bed2.door")],
    ),
    _int("int.bed2.south", (7955.0, 7715.0), (11085.0, 7715.0)),

    # -- The office wing's mouth -------------------------------------------
    #
    # This was the north EXTERIOR wall until the wing was built against it.
    # It is now the wall between bedroom 2 and the office, with a cased
    # opening where the bedroom corridor runs through -- which is why the
    # corridor is the one place the wing could go: it is the only stretch of
    # the north wall with no window in it.
    _int(
        "int.wing.south", (6855.0, 11285.0), (11085.0, 11285.0),
        [Opening(OP, 550.0, 900.0, DOOR_HEAD, 0.0, "bed4.opening")],
    ),

    # -- Kitchen / service core -------------------------------------------
    # THE DENSEST ROOM IN THE SPECIFICATION, and it was the second smallest
    # in the house. Section 4 lists 68 slots here -- major appliances, a
    # countertop run, the sink area -- against 3,490 x 2,540, which is a
    # galley with no room for the far run. It reaches 595mm further south into
    # the circulation and 800mm further east into the passage: 4,290 x 3,190,
    # which takes units down one side, appliances down the other, and a metre
    # between them to open an oven door.
    _int(
        "int.kitchen.south", (5595.0, 4900.0), (9995.0, 4900.0),
        [Opening(OP, 2200.0, 2400.0, DOOR_HEAD, 0.0, "kitchen.servery")],
    ),
    _int("int.kitchen.east", (9995.0, 4900.0), (9995.0, 8145.0)),
    _int(
        "int.laundry.west", (11085.0, 5715.0), (11085.0, 7715.0),
        [Opening(DI, 1000.0, DOOR_W_NARROW, DOOR_HEAD, 0.0, "laundry.door")],
    ),
    _int("int.laundry.south", (11085.0, 5715.0), (13085.0, 5715.0)),
]

# --------------------------------------------------------------------------
# Rooms -- clear internal extents, used for floor finishes and three.js zones.
# --------------------------------------------------------------------------
#: Tubod Enterprises PYC61001 Carrara porcelain -- the specified floor tile
#: for the living areas and all three bedrooms. Named here rather than
#: repeated, so re-specifying the floor is one edit.
#: See catalog/shops/tubod.
LIVING_FLOOR = "tile_pyc61001"

#: Room TYPE per room. The scoping key products match against: master, bed2
#: and bed3 are all "bedroom", because a shop advertises for bedrooms rather
#: than for bedroom 3.
ROOMS = [
    Room("master",   "Master Bedroom", 1940.0, 1230.0, 5540.0, 4830.0, LIVING_FLOOR, "bedroom"),
    Room("ensuite",  "Ensuite",         230.0, 1230.0, 1830.0, 3530.0, "tile", "ensuite"),
    Room("wir",      "Walk-in Robe",    230.0, 3640.0, 1830.0, 5440.0, "carpet", "storage"),
    Room("bed3",     "Bedroom 3",       230.0, 8200.0, 3400.0, 11170.0, LIVING_FLOOR, "bedroom"),
    Room("bathroom", "Bathroom",       3510.0, 8200.0, 5600.0, 11170.0, "tile", "bathroom"),
    # Scopes as a bathroom -- a pan and a basin are sold for it -- but sized
    # as the separate WC it is. See Room.min_clear.
    Room("wc",       "WC",             5710.0, 8200.0, 6800.0, 11170.0, "tile", "bathroom",
         min_clear=(900.0, 1500.0, 1.4)),
    Room("bed2",     "Bedroom 2",      8010.0, 7770.0, 10970.0, 11170.0, LIVING_FLOOR, "bedroom"),
    Room("kitchen",  "Kitchen",        5650.0, 4955.0, 9940.0, 8090.0, "tile", "kitchen"),
    Room("laundry",  "Laundry",       11140.0, 5770.0, 12970.0, 7660.0, "tile", "laundry"),
    Room("living",   "Living",         5650.0,  230.0, 10150.0, 4230.0, LIVING_FLOOR, "living"),
    # Dining is open to the living room -- one space, so one floor. Splitting
    # the finish down the middle of an open plan would look like a mistake.
    Room("dining",   "Dining",        10150.0,  230.0, 12970.0, 4230.0, LIVING_FLOOR, "dining"),
    Room("hall",     "Hallway",        1940.0, 4940.0, 5540.0, 8090.0, LIVING_FLOOR, "hallway"),

    # -- The two rooms the platform specification asks for -----------------
    #
    # BEDROOM 4 is the "office / flex room" of Instructions.md section 7: it
    # has to take a desk and a filing cabinet, or a single bed, and be reached
    # without walking through another bedroom. Projecting north off the
    # bedroom corridor is the only place in this plan that satisfies both.
    Room("bed4",     "Bedroom 4 / Office", 6970.0, 11400.0, 10970.0, 14770.0,
         LIVING_FLOOR, "bedroom"),

    # THE GARAGE is section 17, and it is a double: 6,270 x 6,055 clear takes
    # two cars, or one car and the workbench, shelving, bicycles and garden
    # tools that section actually lists. Its floor stays bare concrete --
    # nobody tiles a garage, and the slab is already under it.
    Room("garage",   "Garage",         -6270.0, 1230.0, 0.0, 7285.0,
         "concrete_slab", "storage"),
]

PLAN = HousePlan(
    name="3bed",
    footprint=FOOTPRINT,
    walls=EXTERIOR_WALLS + INTERIOR_WALLS,
    rooms=ROOMS,
    wall_height=WALL_HEIGHT,
    roof=RoofSpec(
        # The elevations print 5,140mm to the ridge. That is the dimension
        # that governs, so it is the input and the pitch is solved from it.
        ridge_height=5140.0,
        pitch_degrees=25.0,   # fallback only, if ridge_height is cleared
        eave_height=2400.0,
        overhang=600.0,
        thickness=180.0,
        span=(0.0, 0.0, 13200.0, 11400.0),
        # One hip per wing, meeting the main roof where each abuts it. See
        # RoofSpec.wings: stretching the main span around an L throws roof
        # over open ground on the inside of the corner.
        wings=(
            (-6500.0, 1000.0, 0.0, 7515.0),      # garage
            (6740.0, 11170.0, 11200.0, 15000.0),  # bedroom 4 / office
        ),
    ),
    slab=SlabSpec(thickness=300.0, apron=300.0, top_level=0.0),
    # Centred on the front door, which moved east with the step.
    porch=(5300.0, -1500.0, 7300.0, 0.0),
    notes=(
        "The original floor plan showed NO garage while the front and top "
        "elevations showed a double garage door -- the drawings disagreed, and "
        "geometry followed the FLOOR PLAN. The garage is now built, attached on "
        "the west, which resolves the disagreement in favour of the elevations "
        "and finally uses the GarageDoorFactory that has been registered in "
        "components/openings.py since the beginning.",
        "Bedroom 4 and the garage are NOT on the source drawings. They are "
        "required by the platform specification (Instructions.md sections 7 "
        "and 17), which asks for a four-bedroom house with a garage, and they "
        "are the two rooms whose advertising slots had nowhere to live.",
        "Ridge height is derived from pitch + span + overhang, so it lands "
        "near 5,340 rather than the 5,140 printed on the elevations. Reduce "
        "RoofSpec.overhang to about 180 to hit 5,140 exactly.",
        "Interior wall positions are a best fit to a raster drawing. Printed "
        "room clear dimensions were treated as authoritative.",
    ),
)


# --------------------------------------------------------------------------
# The guided tour.
#
# The order rooms are visited in, which is a DESIGN decision rather than a
# shortest path: a visitor should be walked through the house the way an
# estate agent would walk them through it -- arrive in the living room, work
# through the public rooms, then the private ones -- and that is not the
# answer a travelling-salesman solver gives.
#
# The route BETWEEN these is solved from the plan by
# `export/tour_json.py`, so this list only has to be a sensible order. It
# cannot describe an impossible route; an unreachable room is reported at
# build time instead of walking into a wall at run time.
#
# Ends back in the living room so the tour can loop.
# --------------------------------------------------------------------------
TOUR_ORDER = [
    "living",     # arrive: the three-piece suite and the coffee table
    "dining",     # through the open plan, past the slider to the pool
    "kitchen",    # north through the servery
    "laundry",    # the service end
    "hall",       # back west into the circulation spine
    "master",     # the private wing
    "ensuite",
    "wir",
    "bed3",       # the north band, west to east
    "bathroom",
    "wc",
    "bed2",
    "bed4",       # north off the bedroom corridor
    "garage",     # out through the hall, and the last stop before home
    "living",     # home again
]
