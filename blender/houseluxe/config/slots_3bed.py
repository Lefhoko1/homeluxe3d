"""What can be sold in the 3-bedroom house, and where.

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
from .slots import Slot, at, run, surfaces

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
         category="appliance", width=700.0, depth=700.0, height=1900.0,
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
       width=2400.0, depth=950.0, height=1000.0, rotation=0.0,
       priority=95, label="Three-seater sofa"),
    at(ROOM["living"], 0.14, 0.58, slot_id="SLOT_LIVING_SOFA_002",
       slot_type="living_sofa", category="sofa",
       width=1800.0, depth=950.0, height=1000.0, rotation=90.0,
       priority=80, label="Two-seater sofa"),
    at(ROOM["living"], 0.86, 0.58, slot_id="SLOT_LIVING_CHAIR_001",
       slot_type="living_chair", category="chair",
       width=1160.0, depth=1000.0, height=1050.0, rotation=270.0,
       priority=75, label="Armchair"),
    at(ROOM["living"], 0.5, 0.55, slot_id="SLOT_LIVING_TABLE_001",
       slot_type="occasional_table", category="table",
       width=1200.0, depth=700.0, height=450.0,
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
       width=1800.0, depth=1000.0, height=760.0,
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
def _bedroom(name: str, code: str, bed_w: float, priority: int) -> list[Slot]:
    """Bed against the longest unbroken wall, bedsides either side of it."""
    room = ROOM[name]
    return [
        at(room, 0.5, 0.76, slot_id=f"SLOT_{code}_BED_001",
           slot_type="bedroom_bed", category="bed",
           width=bed_w, depth=2000.0, height=750.0, rotation=0.0,
           priority=priority, label="Bed"),
        at(room, 0.5 - (bed_w / 2 + 250) / (room.x1 - room.x0), 0.88,
           slot_id=f"SLOT_{code}_BEDSIDE_001", slot_type="bedside_table",
           category="table", width=450.0, depth=400.0, height=550.0,
           priority=55, label="Bedside table"),
        at(room, 0.5 + (bed_w / 2 + 250) / (room.x1 - room.x0), 0.88,
           slot_id=f"SLOT_{code}_BEDSIDE_002", slot_type="bedside_table",
           category="table", width=450.0, depth=400.0, height=550.0,
           priority=55, label="Bedside table"),
        at(room, 0.12, 0.2, slot_id=f"SLOT_{code}_WARDROBE_001",
           slot_type="wardrobe", category="storage",
           width=1200.0, depth=600.0, height=2100.0, rotation=90.0,
           priority=75, label="Wardrobe"),
        at(room, 0.85, 0.2, slot_id=f"SLOT_{code}_DRESSER_001",
           slot_type="dresser", category="storage",
           width=1000.0, depth=450.0, height=800.0, rotation=270.0,
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


SLOTS: list[Slot] = (
    KITCHEN + KITCHEN_COUNTER + KITCHEN_SINK + KITCHEN_SURFACES
    + LIVING + DINING + BEDROOMS
    + BATHROOM + ENSUITE + WC + LAUNDRY
    + HALL + WIR + GARAGE + SURFACES
)
