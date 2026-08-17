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
    (4600.0, 0.0),
    (13200.0, 0.0),
    (13200.0, 7600.0),
    (11200.0, 7600.0),
    (11200.0, 11400.0),
    (0.0, 11400.0),
    (0.0, 1000.0),
    (4600.0, 1000.0),
)

# Wall centrelines sit 115mm inside the outer face.
EXTERIOR_WALLS = [
    # South wall of the living / dining wing. Runs EAST to WEST, so offsets
    # below are measured from the south-east corner.
    _ext(
        "ext.south.main", (13085.0, 115.0), (4485.0, 115.0),
        [
            Opening(W, 1700.0, 2400.0, WIN_HEAD, WIN_SILL, "dining.south"),
            Opening(W, 5000.0, 2400.0, WIN_HEAD, WIN_SILL, "living.south"),
            Opening(DX, 7485.0, ENTRY_W, DOOR_HEAD, 0.0, "entry.front_door"),
        ],
    ),
    # The 1,000mm step back to the master wing.
    _ext("ext.step", (4485.0, 115.0), (4485.0, 1115.0)),
    # South wall of the master / ensuite wing, running EAST to WEST.
    _ext(
        "ext.south.wing", (4485.0, 1115.0), (115.0, 1115.0),
        [
            Opening(W, 1285.0, 1800.0, WIN_HEAD, WIN_SILL, "master.south"),
            Opening(W, 3455.0, 600.0, WIN_HEAD, WET_SILL, "ensuite.south"),
        ],
    ),
    # West wall, running SOUTH to NORTH.
    _ext(
        "ext.west", (115.0, 1115.0), (115.0, 11285.0),
        [
            Opening(W, 1000.0, 600.0, WIN_HEAD, WET_SILL, "ensuite.west"),
            Opening(W, 8685.0, 1500.0, WIN_HEAD, WIN_SILL, "bed3.west"),
        ],
    ),
    # North wall of the bedroom wing, running WEST to EAST.
    _ext(
        "ext.north", (115.0, 11285.0), (11085.0, 11285.0),
        [
            Opening(W, 1725.0, 1500.0, WIN_HEAD, WIN_SILL, "bed3.north"),
            Opening(W, 4495.0, 900.0, WIN_HEAD, WET_SILL, "bathroom.north"),
            Opening(W, 6195.0, 600.0, WIN_HEAD, WET_SILL, "wc.north"),
            Opening(W, 9375.0, 1800.0, WIN_HEAD, WIN_SILL, "bed2.north"),
        ],
    ),
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
    _int("int.bathroom.east", (5655.0, 9400.0), (5655.0, 11285.0)),
    _int("int.wc.east", (6855.0, 8145.0), (6855.0, 11285.0)),
    _int(
        "int.bed2.west", (7955.0, 8145.0), (7955.0, 11285.0),
        [Opening(DI, 800.0, DOOR_W, DOOR_HEAD, 0.0, "bed2.door")],
    ),
    _int("int.bed2.south", (7955.0, 8145.0), (11085.0, 8145.0)),

    # -- Kitchen / service core -------------------------------------------
    _int(
        "int.kitchen.south", (5595.0, 5495.0), (9195.0, 5495.0),
        [Opening(OP, 1800.0, 2400.0, DOOR_HEAD, 0.0, "kitchen.servery")],
    ),
    _int("int.kitchen.east", (9195.0, 5495.0), (9195.0, 8145.0)),
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
    Room("bathroom", "Bathroom",       3510.0, 9455.0, 5600.0, 11170.0, "tile", "bathroom"),
    Room("wc",       "WC",             5710.0, 9455.0, 6800.0, 11170.0, "tile", "bathroom"),
    Room("bed2",     "Bedroom 2",      8010.0, 8200.0, 10970.0, 11170.0, LIVING_FLOOR, "bedroom"),
    Room("kitchen",  "Kitchen",        5650.0, 5550.0, 9140.0, 8090.0, "tile", "kitchen"),
    Room("laundry",  "Laundry",       11140.0, 5770.0, 12970.0, 7660.0, "tile", "laundry"),
    Room("living",   "Living",         5650.0,  230.0, 10150.0, 4230.0, LIVING_FLOOR, "living"),
    # Dining is open to the living room -- one space, so one floor. Splitting
    # the finish down the middle of an open plan would look like a mistake.
    Room("dining",   "Dining",        10150.0,  230.0, 12970.0, 4230.0, LIVING_FLOOR, "dining"),
    Room("hall",     "Hallway",        1940.0, 4940.0, 5540.0, 8090.0, LIVING_FLOOR, "hallway"),
]

PLAN = HousePlan(
    name="3bed",
    footprint=FOOTPRINT,
    walls=EXTERIOR_WALLS + INTERIOR_WALLS,
    rooms=ROOMS,
    wall_height=WALL_HEIGHT,
    roof=RoofSpec(
        pitch_degrees=25.0,
        eave_height=2400.0,
        overhang=600.0,
        thickness=180.0,
        span=(0.0, 0.0, 13200.0, 11400.0),
    ),
    slab=SlabSpec(thickness=300.0, apron=300.0, top_level=0.0),
    porch=(4600.0, -1500.0, 6600.0, 0.0),
    notes=(
        "The floor plan shows NO garage; the front and top elevations show a "
        "double garage door. Geometry follows the FLOOR PLAN. A GarageDoorFactory "
        "is registered in components/openings.py but no plan wall uses it.",
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
    "living",     # home again
]
