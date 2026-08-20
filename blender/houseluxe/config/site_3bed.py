"""The yard for the 3-bedroom house: 30m x 40m, landscaped, with a pool.

LAYOUT LOGIC

The house is NOT moved to suit the yard -- the yard is placed around the house
where it already stands (X 0..13,200, Y 0..11,400). Moving the house would
invalidate every GLB already exported and every camera position in the app.

    30,000 across (X)   -6,000 .. 24,000
    40,000 deep   (Y)  -14,000 .. 26,000

    south (front)  14,000 deep  -- street frontage, driveway, entry
    north (rear)   14,600 deep  -- garden, trees
    west            6,000       -- side garden bed
    east           10,800       -- POOL TERRACE

The pool goes EAST because that is the side the dining sliding door opens
onto (`dining.slider`, on ext.east). A pool you walk out to is worth more than
a pool you look at.

Levels, all relative to the house finished floor at Z = 0:

    0        paving and pool coping (flush, so no trip at the door)
     -120    water surface
     -150    lawn (slab edge stands 150 proud, as it should)
    -2,100   pool floor at the deep end
"""

from __future__ import annotations

from .site import FenceRun, HedgeRun, Plant, PoolFence, PoolSpec, Rect, SiteSpec

# --------------------------------------------------------------------------
# Boundary
# --------------------------------------------------------------------------
SITE_X0, SITE_Y0 = -10000.0, -14000.0
SITE_X1, SITE_Y1 = 24000.0, 26000.0

PAVING_LEVEL = 0.0
GROUND_LEVEL = -150.0

# --------------------------------------------------------------------------
# Pool -- 4m x 8m, long axis north-south, off the dining slider.
# --------------------------------------------------------------------------
POOL = PoolSpec(
    name="pool",
    x0=16000.0, y0=2000.0,
    x1=20000.0, y1=10000.0,
    depth_shallow=1100.0,   # south end, nearest the house
    depth_deep=1900.0,      # north end
    water_level=-120.0,
)

# --------------------------------------------------------------------------
# Paving.
#
# The terrace is built as four strips AROUND the pool rather than one slab
# with a hole in it -- same reason the walls avoid booleans: clean quads and
# no coplanar flicker where the coping meets the deck.
# --------------------------------------------------------------------------
TERRACE_X0, TERRACE_X1 = 13500.0, 21200.0   # 13,500 meets the slab apron
TERRACE_Y0, TERRACE_Y1 = 1000.0, 11000.0
SHELL_X0, SHELL_Y0, SHELL_X1, SHELL_Y1 = POOL.shell

PAVING = [
    # Driveway: 3.6m wide, street to porch.
    Rect("paving.driveway", 3800.0, SITE_Y0, 7400.0, -1500.0, "paving_concrete"),
    # The apron in front of the garage, joining it to the drive. Without it
    # the vehicle door opens onto lawn.
    Rect("paving.garage_apron", -5900.0, -1500.0, 3800.0, 1000.0, "paving_concrete"),
    # Spur from the driveway east along the front of the house.
    Rect("paving.front_path", 7400.0, -1100.0, 13500.0, -300.0),
    # Side path north up the east flank, linking front door to terrace.
    Rect("paving.side_path", 13500.0, -1100.0, 14300.0, TERRACE_Y0),

    # Pool terrace, four strips.
    Rect("paving.terrace_south", TERRACE_X0, TERRACE_Y0, TERRACE_X1, SHELL_Y0),
    Rect("paving.terrace_north", TERRACE_X0, SHELL_Y1, TERRACE_X1, TERRACE_Y1),
    Rect("paving.terrace_west", TERRACE_X0, SHELL_Y0, SHELL_X0, SHELL_Y1),
    Rect("paving.terrace_east", SHELL_X1, SHELL_Y0, TERRACE_X1, SHELL_Y1),
]

# --------------------------------------------------------------------------
# Pool safety barrier.
#
# Encloses the terrace, not the pool itself, so there is room to stand and
# sit inside the barrier. The WEST side is omitted because the house wall
# closes it -- see the note about self-closing doors below.
# --------------------------------------------------------------------------
POOL_FENCE = PoolFence(
    name="pool_fence",
    x0=TERRACE_X0, y0=TERRACE_Y0,
    x1=TERRACE_X1, y1=TERRACE_Y1,
    height=1200.0,
    gate_side="south",
    gate_position=300.0,    # lands on the side path from the front door
    gate_width=900.0,
    open_sides=("west",),
)

# --------------------------------------------------------------------------
# Garden beds -- mulched, planted with shrubs below.
# --------------------------------------------------------------------------
BEDS = [
    Rect("bed.front", 7400.0, -1900.0, 13200.0, -1200.0, "mulch", 60.0),
    # Moved west of the garage. It used to run x -1800..-400, which is now
    # the middle of the garage floor.
    Rect("bed.west", -8600.0, 1500.0, -7200.0, 9000.0, "mulch", 60.0),
    # Stops short of the office wing, which projects to y 15,000 between
    # x 6,740 and 11,200.
    Rect("bed.rear", 1000.0, 11800.0, 6200.0, 13000.0, "mulch", 60.0),
    Rect("bed.pool", TERRACE_X1, TERRACE_Y0, 22600.0, TERRACE_Y1, "mulch", 60.0),
]


# --------------------------------------------------------------------------
# Terrain flat zones.
#
# Everything the contour must not touch. The house rectangle is generous
# enough to cover the slab apron, the roof overhang and the porch, so the
# ground stays dead level where the building meets it.
# --------------------------------------------------------------------------
# Both wings included: the garage reaches x -6,500 and the office wing y
# 15,000, and terrain that does not know about them contours up through a
# concrete floor.
HOUSE_ZONE = Rect("zone.house", -7400.0, -2400.0, 14100.0, 15900.0)
POOL_ZONE = Rect("zone.pool", SHELL_X0, SHELL_Y0, SHELL_X1, SHELL_Y1)

FLAT_ZONES = [HOUSE_ZONE, POOL_ZONE] + PAVING + BEDS


def _shrubs_in(bed, seed, spacing=1600.0, height=900.0, spread=1100.0):
    """Shrubs filling a bed, derived FROM the bed.

    THE BED IS THE INPUT, and that is the whole point of this helper. These
    rows used to carry their own coordinates: `_shrub_row(200, [-1100.0],
    [2600.0, ...])`. When the garage was built the bed moved west to make room
    for it and its planting stayed exactly where it was -- four shrubs growing
    out of a concrete garage floor, and three more inside the new office wing.
    Nothing complained, because nothing knew the two were related.

    Planting that cannot be separated from its bed cannot be left behind by
    one. Move a bed, dig it out, make it longer: the shrubs follow.

    Spacing is a TARGET. The row is spread evenly across whatever length the
    bed actually has, so a bed that grows by a metre gets slightly wider gaps
    rather than one shrub hanging off the end.
    """
    inset = spread / 2.0

    def along(a, b):
        span = (b - inset) - (a + inset)
        if span <= 0:
            return [(a + b) / 2.0]
        count = max(1, round(span / spacing) + 1)
        if count == 1:
            return [(a + b) / 2.0]
        return [a + inset + span * i / (count - 1) for i in range(count)]

    out = []
    for x in along(bed.x0, bed.x1):
        for y in along(bed.y0, bed.y1):
            out.append(Plant("shrub", x, y, height, spread, seed))
            seed += 1
    return out


#: The beds, by name, so planting can be derived from them.
BED = {b.name: b for b in BEDS}


# --------------------------------------------------------------------------
# Planting.
#
# Trees are placed to do a job: screen the boundary, shade the west wall in
# the afternoon, and frame the pool -- not scattered at random.
# --------------------------------------------------------------------------
TREES = [
    Plant("tree", -7500.0, -7000.0, 5500.0, 3600.0, 1),
    Plant("tree", 20500.0, -8000.0, 6000.0, 4000.0, 2),
    Plant("tree", -7000.0, 16500.0, 6500.0, 4200.0, 3),
    Plant("tree", 4000.0, 20000.0, 7000.0, 4500.0, 4),
    Plant("tree", 14000.0, 21000.0, 6000.0, 3800.0, 5),
    Plant("tree", 21000.0, 16000.0, 5500.0, 3600.0, 6),
    # REMOVED: a tree stood here to shade the west wall, and the garage is now
    # built against that wall. Even pushed clear of the footings its 3.4m
    # canopy reached over the roof, which is leaves in the gutter every autumn
    # and a branch on the sheeting in the first storm. The bed below it still
    # carries its shrubs.
    Plant("tree", 22000.0, 12800.0, 4500.0, 3000.0, 8),
]

SHRUBS = (
    _shrubs_in(BED["bed.front"], 100)
    + _shrubs_in(BED["bed.west"], 200)
    + _shrubs_in(BED["bed.rear"], 300)
    + _shrubs_in(BED["bed.pool"], 400, spacing=1800.0)
)

PLANTS = TREES + SHRUBS

# --------------------------------------------------------------------------
# Boundary treatment: hedge inside the fence line on three sides.
# The street frontage is left open apart from the fence.
# --------------------------------------------------------------------------
HEDGES = [
    HedgeRun("hedge.north", (-9200.0, 25200.0), (23200.0, 25200.0), 800.0, 1600.0),
    HedgeRun("hedge.east", (23200.0, -13200.0), (23200.0, 25200.0), 800.0, 1600.0),
    HedgeRun("hedge.west", (-9200.0, -13200.0), (-9200.0, 25200.0), 800.0, 1600.0),
]

FENCES = [
    FenceRun("fence.north", (-9900.0, 25900.0), (23900.0, 25900.0)),
    FenceRun("fence.east", (23900.0, -13900.0), (23900.0, 25900.0)),
    FenceRun("fence.west", (-9900.0, -13900.0), (-9900.0, 25900.0)),
    # Street frontage, with the driveway crossing left open.
    FenceRun("fence.south_west", (-9900.0, -13900.0), (3800.0, -13900.0), height=1200.0),
    FenceRun("fence.south_east", (7400.0, -13900.0), (23900.0, -13900.0), height=1200.0),
]

SITE = SiteSpec(
    name="3bed-yard",
    bounds=(SITE_X0, SITE_Y0, SITE_X1, SITE_Y1),
    ground_level=GROUND_LEVEL,
    soil_depth=600.0,
    contour_fall=260.0,
    contour_amplitude=90.0,
    flat_zones=FLAT_ZONES,
    pool=POOL,
    pool_fence=POOL_FENCE,
    paving=PAVING,
    beds=BEDS,
    plants=PLANTS,
    hedges=HEDGES,
    fences=FENCES,
    notes=(
        "Pool sits east of the house, off the dining sliding door. Water is "
        "4.0 x 8.0m, falling 1.1m to 1.9m from the house end.",
        "Paving and coping are flush at Z=0 with the house floor, so there is "
        "no step at the slider. Lawn is 150mm lower, leaving the slab edge "
        "visible as it would be on site.",
        "The lawn runs under the house footprint. It is hidden by the slab and "
        "costs two triangles, which is cheaper than cutting a hole in it.",
        "No boundary survey was supplied -- the 30x40 boundary is centred on "
        "the house with a deeper front setback for the driveway.",
        "The pool barrier omits its west side because the house wall closes "
        "it. That means the dining slider opens INSIDE the pool zone, so in a "
        "real build that door needs to be self-closing and self-latching. "
        "Not modelled -- it is hardware, not geometry.",
    ),
)
