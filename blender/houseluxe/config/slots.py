"""Advertising slots -- the inventory the house exists to sell.

A slot is a POSITION SOMETHING CAN BE SOLD INTO. Not an empty object and not a
placeholder: a named, sized, typed place, with a stable id that survives every
rebuild, that a shop can buy and put a product in.

    "Don't think placeholders. A slot should contain metadata describing what
     kind of product can occupy it."  -- Instructions.md, section 2

WHY THEY ARE DECLARED HERE AND NOT DERIVED. Until now the database invented a
slot from every existing placement, so a slot only existed because something
was already standing in it -- which is backwards from an inventory map, and
is why the house had 27 slots where the specification names 383. A slot has
to be able to exist EMPTY. That is the whole product: a shop is buying the
empty one.

THE ID IS THE CONTRACT. `SLOT_KITCHEN_APPLIANCE_001` is stamped into the
Blender object as a custom property, written into slots.json, and stored on
the database row. Blender rebuilds the house from scratch every time, so
nothing about an object's name, index or creation order can be relied on --
only the string the plan controls.

POSITIONS ARE COMPUTED FROM THE ROOMS, not typed. A run of appliances is "six
positions along the north wall of the kitchen, 600 wide, backs to the wall",
which stays correct when the kitchen changes size -- and the kitchen changed
size twice while this was being written. Typing 383 coordinates would have
been wrong before the file was saved.
"""

from __future__ import annotations

from dataclasses import dataclass

from .plan import Room

#: Which way a slot faces, by the wall it stands against. Rotation is degrees
#: counter-clockwise about Z with 0 facing +Y (north), matching Placement.
FACING = {"n": 180.0, "s": 0.0, "e": 270.0, "w": 90.0}


@dataclass(frozen=True)
class Slot:
    """One position a product can be sold into.

    `width`/`depth`/`height` are the ENVELOPE, not a product: the largest
    thing that fits. A 700-wide fridge slot will take a 600 fridge; it will
    not take an 800.
    """

    id: str
    room: str
    slot_type: str
    x: float
    y: float

    #: Height of the slot's BASE above finished floor level. A worktop
    #: appliance stands at 900, a wall-mounted television at 1,200, a ceiling
    #: light at the ceiling. Floor-standing slots leave this at zero.
    z: float = 0.0

    rotation: float = 0.0
    width: float = 600.0
    depth: float = 600.0
    height: float = 900.0

    #: What may go here. A product category code; empty means anything.
    category: str = ""

    #: How much of the room's attention this position gets, 0..100. Drives the
    #: order the tour shows things in and what the position is worth.
    priority: int = 50

    label: str = ""

    @property
    def footprint(self) -> tuple[float, float, float, float]:
        """Plan extents, as (x0, y0, x1, y1), ignoring rotation.

        Quarter turns swap width and depth; anything else is treated as its
        own bounding square, which is conservative and only used for checking
        that a slot is inside its room.
        """
        turn = round((self.rotation % 180.0) / 90.0)
        w, d = (self.depth, self.width) if turn == 1 else (self.width, self.depth)
        return (self.x - w / 2, self.y - d / 2, self.x + w / 2, self.y + d / 2)


def run(
    room: Room,
    side: str,
    count: int,
    *,
    prefix: str,
    slot_type: str,
    category: str = "",
    width: float = 600.0,
    depth: float = 600.0,
    height: float = 900.0,
    z: float = 0.0,
    priority: int = 50,
    inset: float = 40.0,
    margin: float = 0.0,
    start_index: int = 1,
    label: str = "",
) -> list[Slot]:
    """`count` slots evenly along one side of a room, backs to the wall.

    `margin` keeps the run clear of the corners at each end -- which is what
    stops a fridge being sold a position it could never be opened in.
    """
    x0, y0, x1, y1 = room.x0, room.y0, room.x1, room.y1
    horizontal = side in ("n", "s")

    # The line the run sits on, and how far it may travel along it.
    if side == "n":
        fixed, lo, hi = y1 - depth / 2 - inset, x0 + margin, x1 - margin
    elif side == "s":
        fixed, lo, hi = y0 + depth / 2 + inset, x0 + margin, x1 - margin
    elif side == "e":
        fixed, lo, hi = x1 - depth / 2 - inset, y0 + margin, y1 - margin
    else:
        fixed, lo, hi = x0 + depth / 2 + inset, y0 + margin, y1 - margin

    # Keep every slot's own width inside the run.
    lo += width / 2
    hi -= width / 2
    span = hi - lo

    slots: list[Slot] = []
    for i in range(count):
        t = 0.5 if count == 1 else i / (count - 1)
        along = lo + span * t if span > 0 else (lo + hi) / 2
        x, y = (along, fixed) if horizontal else (fixed, along)
        slots.append(Slot(
            id=f"{prefix}_{start_index + i:03d}",
            room=room.name, slot_type=slot_type, category=category,
            x=x, y=y, z=z, rotation=FACING[side],
            width=width, depth=depth, height=height,
            priority=priority, label=label or slot_type.replace("_", " ").title(),
        ))
    return slots


def at(
    room: Room,
    fx: float,
    fy: float,
    *,
    slot_id: str,
    slot_type: str,
    category: str = "",
    width: float = 600.0,
    depth: float = 600.0,
    height: float = 900.0,
    z: float = 0.0,
    rotation: float = 0.0,
    priority: int = 50,
    label: str = "",
    clamp: bool = True,
) -> Slot:
    """One slot at a fractional position in a room. (0,0) is its SW corner.

    CLAMPED INTO THE ROOM BY DEFAULT, and that is not a convenience. A
    fraction places a slot's CENTRE, so "the bed three-quarters of the way up
    the room" puts a two-metre bed through the far wall in a room shorter than
    it assumed -- which is what happened to seven of the first fourteen slots
    written, in four different rooms. Clamping means a fraction says where a
    thing should sit and the room says where it can, and the room wins.

    A slot too big for its room cannot be clamped into it; `check` still
    reports that, because it is a real fault rather than a rounding one.
    """
    cx = room.x0 + (room.x1 - room.x0) * fx
    cy = room.y0 + (room.y1 - room.y0) * fy

    if clamp:
        turn = round((rotation % 180.0) / 90.0)
        w, d = (depth, width) if turn == 1 else (width, depth)
        if room.x1 - room.x0 >= w:
            cx = min(max(cx, room.x0 + w / 2), room.x1 - w / 2)
        if room.y1 - room.y0 >= d:
            cy = min(max(cy, room.y0 + d / 2), room.y1 - d / 2)

    return Slot(
        id=slot_id, room=room.name, slot_type=slot_type, category=category,
        x=cx, y=cy,
        z=z, rotation=rotation, width=width, depth=depth, height=height,
        priority=priority, label=label or slot_type.replace("_", " ").title(),
    )


def surfaces(room: Room, ceiling: float = 2400.0) -> list[Slot]:
    """The floor, the walls and the ceiling light of one room.

    Every room has these and every one of them is sellable -- sections 11, 12
    and 13. They are the cheapest inventory in the house to create and the
    only kind that needs no furniture to exist first.
    """
    code = room.name.upper()
    cx = (room.x0 + room.x1) / 2
    cy = (room.y0 + room.y1) / 2
    return [
        Slot(id=f"SLOT_FLOOR_{code}", room=room.name, slot_type="floor_surface",
             category="tile", x=cx, y=cy, z=0.0,
             width=room.x1 - room.x0, depth=room.y1 - room.y0, height=10.0,
             priority=60, label=f"{room.label} floor"),
        Slot(id=f"SLOT_WALL_{code}", room=room.name, slot_type="wall_surface",
             category="paint", x=cx, y=cy, z=0.0,
             width=room.x1 - room.x0, depth=room.y1 - room.y0, height=ceiling,
             priority=50, label=f"{room.label} walls"),
        Slot(id=f"SLOT_LIGHT_{code}", room=room.name, slot_type="ceiling_light",
             category="lighting", x=cx, y=cy, z=ceiling - 300.0,
             width=600.0, depth=600.0, height=300.0,
             priority=45, label=f"{room.label} ceiling light"),
    ]


def check(slots: list[Slot], rooms: dict[str, Room]) -> list[str]:
    """Slots that are not inside the room they claim, or share an id.

    THE CHECK THAT MATTERS. A slot outside its room is inventory nobody can
    walk to and a product that will hang in a wall; a duplicated id is two
    shops sold the same position. Both are silent without this.
    """
    problems: list[str] = []
    seen: set[str] = set()

    for slot in slots:
        if slot.id in seen:
            problems.append(f"duplicate slot id {slot.id}")
        seen.add(slot.id)

        # A slot with no room belongs to the HOUSE: the exterior walls, the
        # door hardware fitted throughout. There is nothing to be inside of,
        # so there is nothing to check it against.
        if not slot.room:
            continue

        room = rooms.get(slot.room)
        if room is None:
            problems.append(f"{slot.id}: no room {slot.room!r}")
            continue

        # Surfaces ARE the room, so they are exempt from fitting inside it.
        if slot.slot_type in ("floor_surface", "wall_surface"):
            continue

        sx0, sy0, sx1, sy1 = slot.footprint
        if (sx0 < room.x0 - 1 or sy0 < room.y0 - 1
                or sx1 > room.x1 + 1 or sy1 > room.y1 + 1):
            problems.append(
                f"{slot.id}: {sx0:.0f},{sy0:.0f}..{sx1:.0f},{sy1:.0f} "
                f"is outside {room.name} "
                f"({room.x0:.0f},{room.y0:.0f}..{room.x1:.0f},{room.y1:.0f})"
            )

    return problems
