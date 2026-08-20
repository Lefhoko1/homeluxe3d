"""What can be sold in the 3-bedroom house, and where.

AN ENVELOPE IS THE BIGGEST THING THAT FITS, not the size of the product
somebody had in mind while writing the line. `suggest_slots` rejects anything
larger, so a slot sized to one product refuses every product a millimetre
bigger -- the Sandton three-seater was turned away from its own sofa position
because the sofa is 1,020mm tall and the slot said 1,000, and the Slumberland
queen was refused by three bedrooms whose slots were sized for a double.

Every slot here comes from a list in Instructions.md -- sections 4 to 17 --
rather than from what happens to be in the house today. That direction
matters: the house is an inventory map drawn before anything is sold, and a
room's slots exist whether or not a shop has bought them yet.

WHAT IS NOT HERE YET, and why. Sections 4 and 5 put products ON THINGS: a
kettle on a worktop, a book on a shelf, a bowl on a coffee table. Those
positions cannot be honest until the worktop, the shelf and the table exist,
because a slot 900mm in the air with nothing under it is a promise the house
cannot keep. So the countertop, sink-area, bookshelf and tabletop runs wait
for the joinery. Everything that stands on the FLOOR, dresses a SURFACE, or
hangs from the CEILING is here now, because the floor, the walls and the
ceiling are already built.

Positions are computed from the rooms. See `slots.run`: a run is "six
positions along the north wall, 600 wide, backs to the wall", which survives
the kitchen changing size -- and it changed size twice while this was written.
"""

from __future__ import annotations

from .kitchen import BASE_DEPTH, WALL_UNIT_BOTTOM, WORKTOP_HEIGHT
from .plan_3bed import PLAN
from .slots import Slot, at, avoid_swings, run, surfaces
from .swing import swings as door_swings

ROOM = {r.name: r for r in PLAN.rooms}
CEILING = PLAN.ceiling.height


# --------------------------------------------------------------------------
# Kitchen -- section 4. "One of your most valuable advertising environments."
# --------------------------------------------------------------------------
KITCHEN: list[Slot] = [
    # The appliance run, backs to the north wall. Fridge, then the built-in
    # column, then the free-standing machines.
    *run(ROOM["kitchen"], "n", 5,
         prefix="SLOT_KITCHEN_APPLIANCE", slot_type="kitchen_appliance",
         category="appliance", width=760.0, depth=720.0, height=2000.0,
         priority=85, margin=150.0, label="Kitchen appliance"),
    # The unit run opposite, which is where a hob, an oven and a dishwasher
    # are built in. 600 modules, as kitchen units are.
    *run(ROOM["kitchen"], "s", 5,
         prefix="SLOT_KITCHEN_UNIT", slot_type="kitchen_unit",
         category="kitchen_unit", width=600.0, depth=600.0, height=900.0,
         priority=75, margin=150.0, label="Kitchen unit"),
    # Tall storage in the corner the runs do not reach.
    at(ROOM["kitchen"], 0.94, 0.5, slot_id="SLOT_KITCHEN_TALL_001",
       slot_type="kitchen_unit", category="storage",
       width=600.0, depth=650.0, height=2100.0, rotation=270.0,
       priority=70, label="Tall kitchen storage"),
]


# --------------------------------------------------------------------------
# ON the worktop -- section 4's countertop and sink lists.
#
# THESE COULD NOT EXIST UNTIL THE JOINERY DID. A kettle position 900mm in the
# air with nothing under it is a promise the house cannot keep, so the twenty
# countertop slots and the ten sink-area ones waited for
# `components/kitchen.py` to build something to stand them on.
#
# Their height comes from the same constant the worktop is built to. A slot
# manifest that thinks the worktop is at 850 while the worktop is at 900 puts
# every kettle in the house floating fifty millimetres above it.
# --------------------------------------------------------------------------
_K = ROOM["kitchen"]

#: The usable band on a 600 worktop: back against the splashback, front left
#: clear to work on. A kettle is not pushed to the front edge.
_COUNTER_DEPTH = 380.0
_COUNTER_Y = _K.y1 - BASE_DEPTH + _COUNTER_DEPTH / 2 + 60.0
_RUN_END = _K.x1 - BASE_DEPTH          # where the north run stops

KITCHEN_COUNTER: list[Slot] = [
    Slot(id=f"SLOT_KITCHEN_COUNTER_{i + 1:03d}", room="kitchen",
         slot_type="kitchen_counter", category="appliance",
         x=x, y=_COUNTER_Y, z=WORKTOP_HEIGHT, rotation=180.0,
         width=380.0, depth=_COUNTER_DEPTH, height=450.0,
         priority=70 - i * 2, label="Countertop product")
    for i, x in enumerate(
        _K.x0 + 320.0 + i * 430.0 for i in range(int((_RUN_END - _K.x0 - 500) // 430))
    )
]

#: The sink run is the EAST return, under the window end, which is where a
#: sink goes: you wash up looking out rather than at a wall.
_SINK_X = _K.x1 - BASE_DEPTH / 2

KITCHEN_SINK: list[Slot] = [
    Slot(id="SLOT_KITCHEN_SINK_001", room="kitchen", slot_type="kitchen_sink",
         category="basin", x=_SINK_X, y=_K.y0 + 1200.0, z=WORKTOP_HEIGHT - 200.0,
         rotation=270.0, width=860.0, depth=500.0, height=220.0,
         priority=80, label="Sink"),
    Slot(id="SLOT_KITCHEN_TAP_001", room="kitchen", slot_type="kitchen_tap",
         category="basin", x=_SINK_X + 180.0, y=_K.y0 + 1200.0, z=WORKTOP_HEIGHT,
         rotation=270.0, width=120.0, depth=200.0, height=380.0,
         priority=75, label="Kitchen tap"),
    *[
        Slot(id=f"SLOT_KITCHEN_SINKSIDE_{i + 1:03d}", room="kitchen",
             slot_type="kitchen_counter", category="decor",
             x=_SINK_X, y=y, z=WORKTOP_HEIGHT, rotation=270.0,
             width=300.0, depth=300.0, height=300.0,
             priority=45, label="Sink-side product")
        for i, y in enumerate((_K.y0 + 400.0, _K.y0 + 2000.0, _K.y0 + 2500.0))
    ],
]

#: The splashback, which is what a tile company is selling when it sells a
#: kitchen -- and it is a surface, so it needs no furniture under it.
KITCHEN_SURFACES: list[Slot] = [
    Slot(id="SLOT_KITCHEN_SPLASHBACK", room="kitchen",
         slot_type="splashback", category="tile",
         x=(_K.x0 + _RUN_END) / 2, y=_K.y1 - 100.0, z=WORKTOP_HEIGHT,
         rotation=180.0, width=_RUN_END - _K.x0, depth=60.0,
         height=WALL_UNIT_BOTTOM - WORKTOP_HEIGHT,
         priority=65, label="Splashback"),
    Slot(id="SLOT_KITCHEN_WORKTOP", room="kitchen",
         slot_type="worktop", category="tile",
         x=(_K.x0 + _RUN_END) / 2, y=_K.y1 - BASE_DEPTH / 2, z=WORKTOP_HEIGHT - 40.0,
         rotation=180.0, width=_RUN_END - _K.x0, depth=BASE_DEPTH, height=40.0,
         priority=70, label="Worktop"),
    Slot(id="SLOT_KITCHEN_DOORFRONTS", room="kitchen",
         slot_type="cabinet_front", category="paint",
         x=(_K.x0 + _RUN_END) / 2, y=_K.y1 - BASE_DEPTH, z=100.0,
         rotation=180.0, width=_RUN_END - _K.x0, depth=60.0, height=770.0,
         priority=60, label="Cabinet fronts"),
]


# --------------------------------------------------------------------------
# Living room -- section 5.
# --------------------------------------------------------------------------
LIVING: list[Slot] = [
    at(ROOM["living"], 0.5, 0.16, slot_id="SLOT_LIVING_SOFA_001",
       slot_type="living_sofa", category="sofa",
       width=2600.0, depth=1050.0, height=1150.0, rotation=0.0,
       priority=95, label="Three-seater sofa"),
    at(ROOM["living"], 0.14, 0.58, slot_id="SLOT_LIVING_SOFA_002",
       slot_type="living_sofa", category="sofa",
       width=2000.0, depth=1050.0, height=1150.0, rotation=90.0,
       priority=80, label="Two-seater sofa"),
    at(ROOM["living"], 0.86, 0.58, slot_id="SLOT_LIVING_CHAIR_001",
       slot_type="living_chair", category="chair",
       width=1300.0, depth=1100.0, height=1150.0, rotation=270.0,
       priority=75, label="Armchair"),
    at(ROOM["living"], 0.5, 0.55, slot_id="SLOT_LIVING_TABLE_001",
       slot_type="occasional_table", category="table",
       width=1400.0, depth=800.0, height=550.0,
       priority=70, label="Coffee table"),
    at(ROOM["living"], 0.5, 0.55, slot_id="SLOT_LIVING_RUG_001",
       slot_type="floor_covering", category="rug",
       width=3000.0, depth=2200.0, height=20.0,
       priority=55, label="Rug"),
    # The television goes on the wall the sofa faces, at seated eye level.
    at(ROOM["living"], 0.5, 0.97, slot_id="SLOT_LIVING_TV_001",
       slot_type="wall_television", category="television",
       width=1400.0, depth=120.0, height=800.0, z=900.0, rotation=180.0,
       priority=90, label="Television"),
    at(ROOM["living"], 0.5, 0.94, slot_id="SLOT_LIVING_MEDIA_001",
       slot_type="media_unit", category="storage",
       width=1600.0, depth=450.0, height=550.0, rotation=180.0,
       priority=65, label="Media unit"),
    at(ROOM["living"], 0.06, 0.93, slot_id="SLOT_LIVING_PLANT_001",
       slot_type="floor_plant", category="decor",
       width=600.0, depth=600.0, height=1600.0,
       priority=40, label="Floor plant"),
    at(ROOM["living"], 0.94, 0.93, slot_id="SLOT_LIVING_LAMP_001",
       slot_type="floor_lamp", category="lighting",
       width=450.0, depth=450.0, height=1700.0,
       priority=45, label="Floor lamp"),
]


# --------------------------------------------------------------------------
# Dining -- section 5, and the slider onto the pool terrace.
# --------------------------------------------------------------------------
DINING: list[Slot] = [
    at(ROOM["dining"], 0.5, 0.5, slot_id="SLOT_DINING_TABLE_001",
       slot_type="dining_table", category="table",
       width=2100.0, depth=1100.0, height=820.0,
       priority=90, label="Dining table"),
    at(ROOM["dining"], 0.5, 0.5, slot_id="SLOT_DINING_RUG_001",
       slot_type="floor_covering", category="rug",
       width=2400.0, depth=1700.0, height=20.0,
       priority=45, label="Dining rug"),
    *run(ROOM["dining"], "n", 2,
         prefix="SLOT_DINING_SIDEBOARD", slot_type="sideboard",
         category="storage", width=1400.0, depth=450.0, height=850.0,
         priority=60, margin=200.0, label="Sideboard"),
]


# --------------------------------------------------------------------------
# Bedrooms -- section 7. One arrangement, applied to each.
# --------------------------------------------------------------------------
def _head_wall(name: str) -> str:
    """Which wall a bed should head, "n" or "s": the one AWAY FROM THE DOOR.

    The docstring below has claimed "against the longest unbroken wall" since
    this file was written, and every bedroom was hardcoded to the north
    regardless. That was harmless while doors were hung at run time and opened
    away from whoever approached them. It stopped being harmless the moment
    they started opening into the rooms they serve.

    THE MASTER IS THE CASE THAT SHOWS WHY. Its door is in the east wall, near
    the north end, and its leaf comes to rest square to that wall reaching
    813mm short of the bed's east edge -- a 313mm gap, in a house whose
    walking character is 520mm across. The whole west half of the room, the
    ensuite and the walk-in robe became unreachable, and one bedside table
    stood inside the swing. Heading the bed at the south wall instead costs
    nothing at all: the same 1,720mm of clear floor at the foot, just measured
    from the other end.

    Distance from the door to each candidate wall, and the far one wins. A
    bedroom whose door is in a SIDE wall is equidistant and keeps the north,
    which is what bedroom 2 does.
    """
    room = ROOM[name]
    doors = [sw for sw in door_swings(PLAN) if sw.into == name]
    if not doors:
        return "n"
    to_north = min(abs(room.y1 - sw.ay) for sw in doors)
    to_south = min(abs(sw.ay - room.y0) for sw in doors)
    # A clear preference only; a tie keeps the north wall.
    return "s" if to_south > to_north + 500.0 else "n"


def _bedroom(name: str, code: str, bed_w: float, priority: int) -> list[Slot]:
    """Bed against the wall furthest from the door, bedsides either side."""
    room = ROOM[name]

    # Every fraction below is written for a bed heading NORTH. Mirroring them
    # in one place turns the whole arrangement round together -- bedsides stay
    # at the head, wardrobe and dresser stay at the foot -- rather than
    # leaving one of them behind, which is the way this goes wrong.
    head = _head_wall(name)
    fy = (lambda v: v) if head == "n" else (lambda v: 1.0 - v)
    facing = 0.0 if head == "n" else 180.0

    return [
        at(room, 0.5, fy(0.76), slot_id=f"SLOT_{code}_BED_001",
           slot_type="bedroom_bed", category="bed",
           # The envelope, not a mattress. A slot sized to the double
           # somebody had in mind rejects the queen that would fit the
           # room -- which is exactly what happened to the Slumberland:
           # 1,520mm wide, refused by three 1,370mm slots.
           width=bed_w + 400.0, depth=2200.0, height=1400.0, rotation=facing,
           priority=priority, label="Bed"),
        at(room, 0.5 - (bed_w / 2 + 250) / (room.x1 - room.x0), fy(0.88),
           slot_id=f"SLOT_{code}_BEDSIDE_001", slot_type="bedside_table",
           category="table", width=600.0, depth=450.0, height=700.0,
           priority=55, label="Bedside table"),
        at(room, 0.5 + (bed_w / 2 + 250) / (room.x1 - room.x0), fy(0.88),
           slot_id=f"SLOT_{code}_BEDSIDE_002", slot_type="bedside_table",
           category="table", width=450.0, depth=400.0, height=550.0,
           priority=55, label="Bedside table"),
        at(room, 0.12, fy(0.2), slot_id=f"SLOT_{code}_WARDROBE_001",
           slot_type="wardrobe", category="storage",
           width=1500.0, depth=680.0, height=2200.0, rotation=90.0,
           priority=75, label="Wardrobe"),
        at(room, 0.85, fy(0.2), slot_id=f"SLOT_{code}_DRESSER_001",
           slot_type="dresser", category="storage",
           width=1200.0, depth=520.0, height=900.0, rotation=270.0,
           priority=60, label="Dresser"),
        at(room, 0.5, 0.5, slot_id=f"SLOT_{code}_RUG_001",
           slot_type="floor_covering", category="rug",
           width=1600.0, depth=1200.0, height=20.0,
           priority=40, label="Bedroom rug"),
    ]


BEDROOMS: list[Slot] = (
    _bedroom("master", "MASTER", 1520.0, 95)
    + _bedroom("bed2", "BED2", 1370.0, 70)
    + _bedroom("bed3", "BED3", 1370.0, 70)
    + _bedroom("bed4", "BED4", 1370.0, 65)
)


# --------------------------------------------------------------------------
# Wet areas -- section 8. "Surprisingly valuable."
# --------------------------------------------------------------------------
BATHROOM: list[Slot] = [
    at(ROOM["bathroom"], 0.5, 0.87, slot_id="SLOT_BATHROOM_BATH_001",
       slot_type="bath", category="bath",
       width=1700.0, depth=750.0, height=550.0, rotation=180.0,
       priority=85, label="Bath"),
    at(ROOM["bathroom"], 0.22, 0.5, slot_id="SLOT_BATHROOM_SHOWER_001",
       slot_type="shower", category="shower",
       width=900.0, depth=900.0, height=2000.0, rotation=90.0,
       priority=80, label="Shower"),
    at(ROOM["bathroom"], 0.78, 0.5, slot_id="SLOT_BATHROOM_VANITY_001",
       slot_type="bathroom_vanity", category="basin",
       width=900.0, depth=500.0, height=850.0, rotation=270.0,
       priority=75, label="Vanity and basin"),
    at(ROOM["bathroom"], 0.5, 0.14, slot_id="SLOT_BATHROOM_WC_001",
       slot_type="toilet", category="toilet",
       width=400.0, depth=700.0, height=800.0, rotation=0.0,
       priority=70, label="WC"),
    at(ROOM["bathroom"], 0.78, 0.5, slot_id="SLOT_BATHROOM_MIRROR_001",
       slot_type="bathroom_mirror", category="decor",
       width=800.0, depth=60.0, height=900.0, z=1000.0, rotation=270.0,
       priority=50, label="Mirror"),
]

ENSUITE: list[Slot] = [
    at(ROOM["ensuite"], 0.5, 0.82, slot_id="SLOT_ENSUITE_SHOWER_001",
       slot_type="shower", category="shower",
       width=900.0, depth=900.0, height=2000.0, rotation=180.0,
       priority=75, label="Shower"),
    at(ROOM["ensuite"], 0.5, 0.42, slot_id="SLOT_ENSUITE_VANITY_001",
       slot_type="bathroom_vanity", category="basin",
       width=800.0, depth=450.0, height=850.0, rotation=90.0,
       priority=70, label="Vanity and basin"),
    at(ROOM["ensuite"], 0.5, 0.13, slot_id="SLOT_ENSUITE_WC_001",
       slot_type="toilet", category="toilet",
       width=400.0, depth=700.0, height=800.0, rotation=0.0,
       priority=65, label="WC"),
]

WC: list[Slot] = [
    at(ROOM["wc"], 0.5, 0.82, slot_id="SLOT_WC_PAN_001",
       slot_type="toilet", category="toilet",
       width=400.0, depth=700.0, height=800.0, rotation=180.0,
       priority=60, label="WC"),
    at(ROOM["wc"], 0.5, 0.2, slot_id="SLOT_WC_BASIN_001",
       slot_type="bathroom_vanity", category="basin",
       width=450.0, depth=350.0, height=850.0, rotation=0.0,
       priority=50, label="Hand basin"),
]

LAUNDRY: list[Slot] = [
    *run(ROOM["laundry"], "n", 2,
         prefix="SLOT_LAUNDRY_APPLIANCE", slot_type="laundry_appliance",
         category="appliance", width=650.0, depth=650.0, height=900.0,
         priority=70, margin=60.0, label="Laundry appliance"),
    at(ROOM["laundry"], 0.5, 0.2, slot_id="SLOT_LAUNDRY_TUB_001",
       slot_type="laundry_tub", category="basin",
       width=600.0, depth=500.0, height=900.0, rotation=0.0,
       priority=55, label="Laundry tub"),
]


# --------------------------------------------------------------------------
# Circulation and storage -- sections 9 and 10.
# --------------------------------------------------------------------------
HALL: list[Slot] = [
    at(ROOM["hall"], 0.12, 0.5, slot_id="SLOT_HALL_CONSOLE_001",
       slot_type="console_table", category="table",
       width=1100.0, depth=380.0, height=800.0, rotation=90.0,
       priority=55, label="Console table"),
    at(ROOM["hall"], 0.12, 0.5, slot_id="SLOT_HALL_MIRROR_001",
       slot_type="wall_art", category="decor",
       width=700.0, depth=50.0, height=1000.0, z=1000.0, rotation=90.0,
       priority=45, label="Hall mirror"),
    at(ROOM["hall"], 0.88, 0.3, slot_id="SLOT_HALL_ART_001",
       slot_type="wall_art", category="decor",
       width=900.0, depth=50.0, height=700.0, z=1100.0, rotation=270.0,
       priority=40, label="Wall art"),
]

WIR: list[Slot] = [
    *run(ROOM["wir"], "w", 2,
         prefix="SLOT_WIR_STORAGE", slot_type="wardrobe", category="storage",
         width=800.0, depth=550.0, height=2100.0,
         priority=55, margin=50.0, label="Robe storage"),
]


# --------------------------------------------------------------------------
# Garage -- section 17.
# --------------------------------------------------------------------------
GARAGE: list[Slot] = [
    at(ROOM["garage"], 0.28, 0.45, slot_id="SLOT_GARAGE_VEHICLE_001",
       slot_type="vehicle", category="decor",
       width=1900.0, depth=4600.0, height=1500.0,
       priority=60, label="Vehicle bay"),
    at(ROOM["garage"], 0.72, 0.45, slot_id="SLOT_GARAGE_VEHICLE_002",
       slot_type="vehicle", category="decor",
       width=1900.0, depth=4600.0, height=1500.0,
       priority=55, label="Vehicle bay"),
    *run(ROOM["garage"], "n", 3,
         prefix="SLOT_GARAGE_STORAGE", slot_type="garage_storage",
         category="storage", width=1200.0, depth=500.0, height=2000.0,
         priority=65, margin=200.0, label="Garage storage"),
    at(ROOM["garage"], 0.06, 0.86, slot_id="SLOT_GARAGE_BENCH_001",
       slot_type="workbench", category="table",
       width=600.0, depth=1600.0, height=900.0, rotation=90.0,
       priority=60, label="Workbench"),
]


# --------------------------------------------------------------------------
# Every room's floor, walls and ceiling light -- sections 11, 12 and 13.
# --------------------------------------------------------------------------
SURFACES: list[Slot] = [
    slot
    for room in PLAN.rooms
    for slot in surfaces(room, CEILING)
]


# --------------------------------------------------------------------------
# House-wide surfaces -- sections 10 and 12.
#
# NOT IN ANY ROOM, which is the point. The exterior walls are not a room and
# the hinges are on every door in the building, so neither can be declared
# room by room -- and both are sold. They were the only two live placements
# the authored inventory could not adopt, because it had nowhere to put them.
# --------------------------------------------------------------------------
HOUSE_WIDE: list[Slot] = [
    Slot(id="SLOT_WALL_EXTERIOR", room="", slot_type="wall_surface",
         category="paint", x=0.0, y=0.0, z=0.0,
         width=0.0, depth=0.0, height=CEILING,
         priority=70, label="Exterior walls"),
    Slot(id="SLOT_DOOR_HARDWARE", room="", slot_type="door_hardware",
         category="hardware", x=0.0, y=0.0, z=1040.0,
         width=100.0, depth=44.0, height=100.0,
         priority=40, label="Door hardware"),
]


#: Everything the rules produce, before the doors get a say.
AUTHORED: list[Slot] = (
    KITCHEN + KITCHEN_COUNTER + KITCHEN_SINK + KITCHEN_SURFACES
    + LIVING + DINING + BEDROOMS
    + BATHROOM + ENSUITE + WC + LAUNDRY
    + HALL + WIR + GARAGE + SURFACES + HOUSE_WIDE
)


# --------------------------------------------------------------------------
# And then the doors.
#
# A RUN OF SLOTS AND A DOOR SWING WANT THE SAME FLOOR: beside the opening,
# backs to the wall. Every one of the nine doors in this house swept through
# something the first time the two were compared -- a shower, two wardrobes, a
# bed, a WC pan, both laundry appliances -- because the rules that place slots
# have never known where a door goes and the doors were being hung at run time
# anyway.
#
# `avoid_swings` slides what it can along its own wall, which is a real
# position moved a little rather than a wardrobe shoved into the middle of the
# room. What it cannot clear it leaves alone and reports, because a shower
# that will not fit beside a door is a decision about the plan and not
# arithmetic. See build.py, which prints them every build.
# --------------------------------------------------------------------------
SLOTS, SWING_CONFLICTS = avoid_swings(AUTHORED, PLAN)
