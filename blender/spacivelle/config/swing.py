"""Which way a door opens, and what it must not open into.

WHY THIS EXISTS AT ALL. The swing used to be decided in the browser, per
visitor: a door opened away from whoever was approaching it, on the grounds
that the plan did not record which way it was hung and inventing it per door
meant being wrong half the time. That is a fair answer to "we do not know",
and it produced two things nobody wants. A door that opens away from you opens
into whatever is on the other side -- so the front door swung through the
three-seater sofa, and every internal door swept through the furniture of the
room it serves. And a door hung both ways is not a door.

So the plan decides, once, and it decides the way a real house does:

    A DOOR OPENS INTO THE ROOM IT SERVES.

Not into the corridor, where it would block the only route past it. Not out
onto the porch. Into the room you are entering, where it comes to rest flat
against the wall beside the opening.

WHICH ROOM IT SERVES IS ALREADY AUTHORED. Every door in the plan is named for
it -- `ensuite.door`, `wc.door`, `bed3.door`, `laundry.door` -- so the name is
read first and the geometry only has to settle the cases the name cannot, like
`entry.front_door`, where the rule is simply "the side that has a room on it".
An `Opening` may also say outright with `swings_into`, which is what to reach
for the day a door has to be hung against the convention.

THE SWEPT AREA IS INVENTORY THAT CANNOT BE SOLD. A quarter-disc of floor the
width of the leaf has to stay clear, or the door opens through a wardrobe. It
is not much floor -- about 0.6 m2 per door -- but it is exactly the floor
beside a doorway, which is where a slot-generating rule naturally puts things,
and all nine doors in this house were sweeping through something. `hits` and
`check` are what make that a build failure rather than a discovery.

Pure geometry in PLAN MILLIMETRES. No Blender, so the exporters, the slot
generator and the tests all import the same arithmetic rather than each
repeating it -- which is how `doors_json` came to put every hinge axis 28mm
out the first time round.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .joinery import AXIS_OFFSET, FRAME_FACE, LINING_FACE
from .plan import OpeningKind, Room

#: Openings with a leaf that swings.
HINGED = {OpeningKind.DOOR_INTERNAL, OpeningKind.DOOR_EXTERNAL}

#: Rooms a door must never open into.
#:
#: A hallway is the route past every other door in the band, and a leaf swung
#: into a 1,000mm corridor halves it. This is the one preference strong enough
#: to override "the smaller room", because blocking circulation is a fault
#: rather than an inconvenience.
CIRCULATION = {"hallway", "corridor"}

#: How much clear floor a swing needs beyond the leaf itself, in mm.
#:
#: A leaf that just misses a wardrobe still cannot be opened by a person, who
#: needs somewhere to stand while opening it. Small, because this is measured
#: against the swept area rather than added to a doorway width.
SWING_CLEARANCE = 50.0

#: How far a door opens when nothing is in its way, in degrees.
#:
#: A little past square, as a door pushed open comes to rest against its stop.
FULL_OPEN = 96.0

#: How wide a gap a person needs to get through, in mm.
#:
#: The walk is a 520mm circle (collision.WALK_RADIUS is 260). A door that
#: cannot open far enough to leave that much is a door nobody gets through,
#: and the guided tour stops in front of it forever -- which looks exactly
#: like the application having frozen.
PASS_WIDTH = 520.0


@dataclass(frozen=True)
class Swing:
    """One leaf, where it is hinged, and which way it goes."""

    label: str
    wall: str
    kind: OpeningKind
    exterior: bool

    #: Hinge axis in plan mm.
    ax: float
    ay: float

    #: Unit vector along the SHUT leaf, hinge towards latch.
    ux: float
    uy: float

    #: Length of the leaf, hinge to latch edge.
    leaf: float

    #: +1 or -1: which side of the wall the leaf sweeps into. The leaf's free
    #: end travels from `u` towards `sign * perpendicular(u)`.
    sign: int

    #: The room it opens into, or "" when nothing there is a room.
    into: str

    #: Top of the opening above floor level, so the exporter can work out the
    #: leaf's height without re-reading the Opening it came from.
    head: float = 2100.0

    #: Visible face of the frame or lining the leaf is set out from.
    face: float = LINING_FACE

    @property
    def perp(self) -> tuple[float, float]:
        """The wall's left normal, before the sign is applied."""
        return (-self.uy, self.ux)

    @property
    def open_end(self) -> tuple[float, float]:
        """Where the latch edge finishes up, fully open."""
        px, py = self.perp
        return (self.ax + px * self.sign * self.leaf,
                self.ay + py * self.sign * self.leaf)

    def keepout(self, clearance: float = SWING_CLEARANCE) -> tuple[float, float, float, float]:
        """A rectangle covering everywhere the leaf can be, as (x0,y0,x1,y1).

        The swept shape is a quarter-disc; this is its bounding box, which is
        larger. Deliberately so: it is used to KEEP THINGS OUT, and being
        generous there costs a corner of floor nobody was going to stand a
        wardrobe in anyway, while being exact would let a slot sit in the
        corner the leaf passes closest to.
        """
        px, py = self.perp
        reach = self.leaf + clearance
        corners = [
            (self.ax, self.ay),
            (self.ax + self.ux * reach, self.ay + self.uy * reach),
            (self.ax + px * self.sign * reach, self.ay + py * self.sign * reach),
            (self.ax + (self.ux + px * self.sign) * reach * 0.7071,
             self.ay + (self.uy + py * self.sign) * reach * 0.7071),
        ]
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        return (min(xs), min(ys), max(xs), max(ys))

    def hits(self, rect: tuple[float, float, float, float],
             clearance: float = SWING_CLEARANCE, steps: int = 24) -> bool:
        """Does the leaf pass through this rectangle on its way open?

        Sampled along the arc rather than solved, because the shape is a
        quarter-disc against an axis-aligned box and the sampling is exact
        enough at 24 steps to catch anything a person could see. Points are
        taken along the LEAF, not only at its tip: a wardrobe close to the
        hinge is missed entirely by a tip-only test.
        """
        x0, y0, x1, y1 = rect
        px, py = self.perp
        reach = self.leaf + clearance
        for i in range(steps + 1):
            t = (i / steps) * (math.pi / 2)
            c, s = math.cos(t), math.sin(t)
            dx = self.ux * c + px * self.sign * s
            dy = self.uy * c + py * self.sign * s
            for f in (0.25, 0.45, 0.65, 0.85, 1.0):
                qx = self.ax + dx * reach * f
                qy = self.ay + dy * reach * f
                if x0 <= qx <= x1 and y0 <= qy <= y1:
                    return True
        return False


def _leaf_clear(swing: "Swing", angle: float, rect, samples=(0.3, 0.5, 0.7, 0.85, 1.0)) -> bool:
    """Is the leaf clear of this rectangle when held at `angle` radians?"""
    x0, y0, x1, y1 = rect
    px, py = swing.perp
    c, s_ = math.cos(angle), math.sin(angle)
    dx = swing.ux * c + px * swing.sign * s_
    dy = swing.uy * c + py * swing.sign * s_
    for f in samples:
        qx = swing.ax + dx * swing.leaf * f
        qy = swing.ay + dy * swing.leaf * f
        if x0 <= qx <= x1 and y0 <= qy <= y1:
            return False
    return True


def _room_at(rooms: list[Room], x: float, y: float) -> Room | None:
    for room in rooms:
        if room.x0 <= x <= room.x1 and room.y0 <= y <= room.y1:
            return room
    return None


def _choose_side(plan, opening, ax, ay, ux, uy, leaf) -> tuple[int, str]:
    """Pick the sign that swings the leaf into the room the door serves.

    In order:

    1. `Opening.swings_into`, when the plan says outright.
    2. The room named by the door: `ensuite.door` opens into `ensuite`. Every
       door in this house is named this way, so this settles nearly all of it,
       and it is AUTHORED intent rather than a guess dressed up as geometry.
    3. The only side with a room on it -- which is what decides a front door.
    4. Neither side is circulation and both are rooms: the smaller one, which
       is the one being served. An ensuite door opens into the ensuite, not
       into the bedroom that leads to it.
    """
    px, py = -uy, ux
    mid_x = ax + ux * leaf / 2.0
    mid_y = ay + uy * leaf / 2.0
    probe = max(leaf * 0.6, 500.0)

    sides = {}
    for sign in (1, -1):
        sides[sign] = _room_at(
            plan.rooms, mid_x + px * sign * probe, mid_y + py * sign * probe
        )

    named = (opening.swings_into or "").strip()
    if not named and opening.name and "." in opening.name:
        head = opening.name.split(".", 1)[0]
        if any(r.name == head for r in plan.rooms):
            named = head

    if named:
        for sign, room in sides.items():
            if room is not None and room.name == named:
                return sign, room.name
        # The plan named a room the leaf does not actually reach. Worth
        # failing on rather than quietly swinging the other way -- see check.
        return 0, named

    with_rooms = [(sign, room) for sign, room in sides.items() if room is not None]
    if len(with_rooms) == 1:
        sign, room = with_rooms[0]
        return sign, room.name
    if not with_rooms:
        return 1, ""

    # Both sides are rooms. Never into circulation; otherwise the smaller.
    ranked = sorted(
        with_rooms,
        key=lambda pair: (pair[1].room_type in CIRCULATION, pair[1].area),
    )
    sign, room = ranked[0]
    return sign, room.name


def swings(plan) -> list[Swing]:
    """Every hinged leaf in the plan, with the side it opens to resolved."""
    out: list[Swing] = []
    for wall in plan.walls:
        (sx, sy), (ex, ey) = wall.start, wall.end
        length = math.hypot(ex - sx, ey - sy)
        if length <= 0:
            continue
        ux, uy = (ex - sx) / length, (ey - sy) / length
        px, py = -uy, ux

        for opening in wall.openings:
            if opening.kind not in HINGED:
                continue

            # Identical arithmetic to `openings._hang` and `doors_json`: the
            # hinge is the s0 end of the opening set out by the lining, stood
            # off the leaf face by the knuckle.
            face = FRAME_FACE if opening.kind is OpeningKind.DOOR_EXTERNAL else LINING_FACE
            s0 = opening.offset - opening.width / 2.0
            s1 = opening.offset + opening.width / 2.0
            axis_s = s0 + face
            leaf = (s1 - face) - axis_s
            ax = sx + ux * axis_s + px * AXIS_OFFSET
            ay = sy + uy * axis_s + py * AXIS_OFFSET

            sign, into = _choose_side(plan, opening, ax, ay, ux, uy, leaf)

            out.append(Swing(
                label=opening.name or f"{wall.name}.{int(opening.offset)}",
                wall=wall.name,
                kind=opening.kind,
                exterior=bool(wall.exterior),
                ax=ax, ay=ay, ux=ux, uy=uy, leaf=leaf,
                sign=sign, into=into, head=opening.head, face=face,
            ))
    return out


def max_open(swing: Swing, obstacles, steps: int = 48) -> float:
    """How far this leaf can actually swing, in degrees, before it meets something.

    A REAL DOOR STOPS WHEN IT HITS THE SOFA. It does not pass through it, and
    it does not refuse to open -- it opens as far as it can and rests there,
    which is why the doors in a crowded house stand at odd angles. Modelling
    that is both the honest behaviour and the only one that does not require
    every stick of furniture in the house to be moved before a door may open.

    Swept from shut, and it stops at the FIRST angle that touches something:
    an obstacle beyond a gap is still an obstacle, because the leaf would have
    had to pass through the near one to reach it.

    Note that this is measured against what is ACTUALLY PLACED. Empty slots
    are kept out of the swing separately, by `slots.avoid_swings`, so that a
    door does not quietly lose half its travel the day somebody fills one.
    """
    limit = math.radians(FULL_OPEN)
    for i in range(1, steps + 1):
        angle = limit * i / steps
        for rect in obstacles:
            if not _leaf_clear(swing, angle, rect):
                # Back off one step, so the leaf rests just clear of it.
                return math.degrees(limit * (i - 1) / steps)
    return FULL_OPEN


def clear_width(swing: Swing, degrees: float, opening_width: float) -> float:
    """How much of the doorway is left, with the leaf held at `degrees`.

    The leaf still lies across the opening by its own length times the cosine
    of how far it has turned; at 90 degrees it lies flat against the wall and
    the whole opening is clear.
    """
    return opening_width - swing.leaf * math.cos(math.radians(degrees))


def check(plan, obstacles: list[tuple[str, tuple[float, float, float, float]]],
          clearance: float = SWING_CLEARANCE) -> list[str]:
    """Doors that cannot open, and doors whose swing was never resolved.

    `obstacles` is (name, rect) in plan mm -- slots, furniture, joinery,
    anything a leaf would pass through. THIS IS THE CHECK THE HOUSE DID NOT
    HAVE: every one of its nine doors swept through something the first time
    it was run, and none of it was visible until a door was watched opening.
    """
    problems: list[str] = []
    for swing in swings(plan):
        if swing.sign == 0:
            problems.append(
                f"{swing.label}: swings_into names {swing.into!r}, which is "
                f"not on either side of the opening"
            )
            continue
        if not swing.into and not swing.exterior:
            problems.append(
                f"{swing.label}: opens into no room at all -- check the plan"
            )
        blocked = [name for name, rect in obstacles if swing.hits(rect, clearance)]
        if blocked:
            problems.append(
                f"{swing.label}: opening into {swing.into or 'nowhere'} sweeps "
                f"through {', '.join(sorted(blocked)[:4])}"
                + (f" and {len(blocked) - 4} more" if len(blocked) > 4 else "")
            )
    return problems


def report(plan) -> str:
    lines = []
    for swing in swings(plan):
        lines.append(
            f"    {swing.label:<22} opens into {swing.into or '(outside)':<10} "
            f"leaf {swing.leaf:.0f}mm"
        )
    return "\n".join(lines)
