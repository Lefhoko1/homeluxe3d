"""Plan data model -- the vocabulary a house is described in.

These are dumb value objects. They carry no geometry and no Blender types, so
the plan can be read, diffed and reviewed as pure data. All lengths are
millimetres, matching the drawings.

Coordinate system, fixed once here so every component agrees:

    +X  east   (right on the floor plan)
    +Y  north  (up on the floor plan, matching the plan's north arrow)
    +Z  up     (0 = finished floor level)

Origin (0,0) is the south-west corner of the building's bounding rectangle.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class OpeningKind(str, Enum):
    """What a hole in a wall is for.

    The kind drives which component fills it, so adding a new opening type is
    a matter of adding a member here and a builder in `components.openings`.
    """

    WINDOW = "window"
    SLIDING_DOOR = "sliding_door"
    DOOR_EXTERNAL = "door_external"
    DOOR_INTERNAL = "door_internal"
    DOORWAY = "doorway"  # cased opening, no leaf
    GARAGE_DOOR = "garage_door"


@dataclass(frozen=True)
class Opening:
    """A hole in a wall, positioned along that wall's centreline.

    `offset` is measured from the wall's start point, to the CENTRE of the
    opening. Positioning along the wall rather than in world coordinates means
    moving a wall carries its openings with it.
    """

    kind: OpeningKind
    offset: float
    width: float
    head: float = 2100.0   # top of opening above floor level
    sill: float = 900.0    # bottom of opening above floor level; 0 for doors
    name: str = ""

    @property
    def height(self) -> float:
        return self.head - self.sill

    def __post_init__(self) -> None:
        if self.width <= 0:
            raise ValueError(f"Opening {self.name!r} has non-positive width")
        if self.head <= self.sill:
            raise ValueError(f"Opening {self.name!r} has head at or below sill")


@dataclass(frozen=True)
class Wall:
    """A straight wall run, described by its CENTRELINE.

    Centreline rather than face because it makes corners trivial: two walls
    that share a centreline endpoint meet cleanly whatever their thicknesses.
    """

    name: str
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float
    height: float
    exterior: bool = False
    openings: tuple[Opening, ...] = ()

    @property
    def length(self) -> float:
        (x0, y0), (x1, y1) = self.start, self.end
        return ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5

    @property
    def is_horizontal(self) -> bool:
        return abs(self.end[1] - self.start[1]) < 1e-6

    @property
    def is_vertical(self) -> bool:
        return abs(self.end[0] - self.start[0]) < 1e-6

    def validate(self) -> list[str]:
        """Cheap sanity checks. Returns human-readable problems."""
        problems: list[str] = []
        if not (self.is_horizontal or self.is_vertical):
            problems.append(f"wall {self.name!r} is not axis-aligned")
        for opening in self.openings:
            half = opening.width / 2.0
            if opening.offset - half < -1e-6:
                problems.append(
                    f"opening {opening.name or opening.kind} runs off the start "
                    f"of wall {self.name!r}"
                )
            if opening.offset + half > self.length + 1e-6:
                problems.append(
                    f"opening {opening.name or opening.kind} runs off the end "
                    f"of wall {self.name!r} (wall is {self.length:.0f}mm)"
                )
            if opening.head > self.height:
                problems.append(
                    f"opening {opening.name or opening.kind} head "
                    f"({opening.head}mm) is above wall {self.name!r} "
                    f"({self.height}mm)"
                )
        return problems


@dataclass(frozen=True)
class Room:
    """A named internal space. Geometry-free: used for labels and floor finish.

    `room_type` is the SCOPING key, and is deliberately a type rather than an
    identity: master, bed2 and bed3 are all "bedroom". A shop advertises for
    bedrooms, not for bedroom 3, so products and slots match on the type.

    Rooms are derived from walls in a real CAD package. Here they are declared
    explicitly because the plan gives us the clear dimensions directly, and
    because the three.js side wants named zones to attach behaviour to.
    """

    name: str
    label: str
    x0: float
    y0: float
    x1: float
    y1: float
    finish: str = "tile"
    room_type: str = "living"

    #: Override the size minimum for this room, as (short, long, area_m2).
    #:
    #: `room_type` is the SCOPING key -- what may be sold for the room -- and
    #: a separate WC scopes as a bathroom because toilets and basins are what
    #: go in it. Its SIZE is a different question: a WC holds a pan and a
    #: hand basin, not a bath and a shower, and holding it to a bathroom's
    #: minimum would demand 2m of width it has no use for.
    min_clear: tuple[float, float, float] | None = None

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def depth(self) -> float:
        return self.y1 - self.y0

    @property
    def area(self) -> float:
        """Clear floor area in square metres."""
        return (self.width * self.depth) / 1_000_000.0


#: The smallest a room of each type may be and still hold what is sold for it.
#:
#: THESE ARE FURNITURE DIMENSIONS, NOT TASTE. Instructions.md lists what each
#: room has to be able to advertise -- a bathroom carries a bath, a shower, a
#: WC and a vanity; a bedroom carries a double bed, bedsides and a wardrobe --
#: and a room too small for those is not a small room, it is a room that
#: cannot do its job. The house exists to display things that are for sale,
#: so a room that cannot hold them is a fault in the plan.
#:
#: (min_width, min_depth, min_area_m2). Width and depth are the SHORT and LONG
#: clear dimensions, compared unordered: a 2.1 x 2.4 bathroom is the same
#: bathroom whichever way it is drawn.
MIN_CLEAR: dict[str, tuple[float, float, float]] = {
    # Double bed 1,400 x 1,900, bedsides either side, wardrobe 600 deep, and
    # 700 to walk past the foot.
    "bedroom":  (2900.0, 2900.0, 9.0),
    # Bath 1,700 along one wall, a 900 shower, a WC and a vanity.
    "bathroom": (2000.0, 2400.0, 5.4),
    # Shower, WC and basin only -- no bath.
    "ensuite":  (1600.0, 2200.0, 3.6),
    # A run of units one side, appliances the other, 1,000 between them.
    "kitchen":  (2900.0, 3300.0, 10.0),
    "laundry":  (1600.0, 1800.0, 3.0),
    "storage":  (1300.0, 1300.0, 1.7),
    "hallway":  (900.0, 1200.0, 1.1),
    "living":   (3400.0, 3800.0, 14.0),
    "dining":   (2500.0, 3000.0, 8.0),
    "outdoor":  (0.0, 0.0, 0.0),
}


@dataclass(frozen=True)
class RoofSpec:
    """Hipped roof parameters.

    WHICH NUMBER IS THE INPUT, AND WHY IT CHANGED. This used to take a pitch
    and derive the ridge, on the reasoning that a roof should stay
    geometrically consistent when the pitch changes. Sound in the abstract and
    wrong for a real drawing set: the elevations print a RIDGE HEIGHT of
    5,140mm, that is the dimension a planning authority reads and a builder
    sets out to, and deriving it from an assumed 25 degrees produced 5,338mm
    -- 198mm over, every build, reported as a warning nobody could act on.

    So the printed dimension is the input. Set `ridge_height` and the pitch is
    solved from it and the span; leave it None and `pitch_degrees` is used as
    before. The PITCH is what a roof holds constant across its hips, so once
    solved it is applied to the wings too -- which is why a wing has a lower
    ridge than the main roof, exactly as a real one does.
    """

    pitch_degrees: float = 25.0
    eave_height: float = 2400.0
    overhang: float = 600.0
    thickness: float = 180.0
    fascia_depth: float = 230.0
    fascia_thickness: float = 32.0

    #: Rectangle the main roof spans, as (x0, y0, x1, y1) of the WALL faces.
    #: The overhang is added outside this.
    span: tuple[float, float, float, float] = (0.0, 0.0, 13200.0, 11400.0)

    #: Further hipped spans, one per WING.
    #:
    #: A single span can only describe a rectangle, and a house stops being a
    #: rectangle the moment it grows a garage or a projecting bedroom. Roofing
    #: an L-shape with one hip puts roof over open ground on the inside of the
    #: L -- which reads as a mistake from every angle -- so each wing gets its
    #: own hip that meets the main one, exactly as the porch already does.
    #:
    #: Each entry is (x0, y0, x1, y1) of the WALL FACES, like `span`.
    wings: tuple[tuple[float, float, float, float], ...] = ()

    #: The ridge height the elevations print, above finished floor level.
    #: When set, the pitch is solved from it rather than assumed.
    ridge_height: float | None = None

    def pitch_for(self, span: tuple[float, float, float, float]) -> float:
        """The pitch to build at, in degrees.

        Solved once from the MAIN span so the whole roof shares one pitch --
        a hip whose faces meet at different angles is not a hip. `span` is
        the main span INCLUDING its overhang, because that is what the ridge
        height was measured over.
        """
        if self.ridge_height is None:
            return self.pitch_degrees

        import math

        x0, y0, x1, y1 = span
        half_short = min(abs(x1 - x0), abs(y1 - y0)) / 2.0
        if half_short <= 0:
            return self.pitch_degrees
        rise = self.ridge_height - self.eave_height
        return math.degrees(math.atan2(rise, half_short))


@dataclass(frozen=True)
class CeilingSpec:
    """Flat ceiling lining.

    `height` is the UNDERSIDE above finished floor level -- the number you
    would quote as the room's ceiling height. Lining thickness sits above it,
    in the roof space, so raising the ceiling never eats into head height.
    """

    height: float = 2400.0
    thickness: float = 13.0
    finish: str = "ceiling_white"
    porch_soffit: bool = True


@dataclass(frozen=True)
class SlabSpec:
    """Floor slab and its surrounding apron."""

    thickness: float = 300.0
    apron: float = 300.0     # slab edge projecting past the wall face
    top_level: float = 0.0   # finished floor level


@dataclass
class HousePlan:
    """The complete description of one house.

    A different house -- or a variant of this one with a fourth bedroom -- is a
    different instance of this class, not a different codebase.
    """

    name: str
    footprint: tuple[tuple[float, float], ...]
    walls: list[Wall] = field(default_factory=list)
    rooms: list[Room] = field(default_factory=list)
    roof: RoofSpec = field(default_factory=RoofSpec)
    slab: SlabSpec = field(default_factory=SlabSpec)
    ceiling: CeilingSpec = field(default_factory=CeilingSpec)
    wall_height: float = 2400.0
    porch: tuple[float, float, float, float] | None = None
    notes: tuple[str, ...] = ()

    @property
    def exterior_walls(self) -> list[Wall]:
        return [w for w in self.walls if w.exterior]

    @property
    def interior_walls(self) -> list[Wall]:
        return [w for w in self.walls if not w.exterior]

    def wall(self, name: str) -> Wall:
        for candidate in self.walls:
            if candidate.name == name:
                return candidate
        raise KeyError(f"no wall named {name!r}")

    def validate(self) -> list[str]:
        problems: list[str] = []
        seen: set[str] = set()
        for wall in self.walls:
            if wall.name in seen:
                problems.append(f"duplicate wall name {wall.name!r}")
            seen.add(wall.name)
            problems.extend(wall.validate())
        return problems

    def living_area(self) -> float:
        """Sum of declared room areas, in square metres."""
        return sum(room.area for room in self.rooms)

    def check_room_overlaps(self) -> list[str]:
        """Walls running through the middle of a declared room.

        A room is declared as a rectangle and the walls are declared
        separately, so nothing stops the two disagreeing -- and when they do,
        the room is not the shape anybody thinks it is. Enlarging the kitchen
        and moving bedroom 2's south wall in the same change made the two
        rectangles OVERLAP by 1.9 x 0.3 metres, and every downstream
        consequence was silent: slots placed into a bedroom, a floor plate
        drawn through a wall, a room area that counted the same square metre
        twice.

        Fatal, unlike a room being too small. A room of the wrong shape is a
        plan that does not describe a building.
        """
        problems: list[str] = []
        edge = 50.0     # ignore a wall lying ON a room's boundary

        for room in self.rooms:
            for wall in self.walls:
                (sx, sy), (ex, ey) = wall.start, wall.end

                if wall.is_horizontal:
                    lo, hi = sorted((sx, ex))
                    inside = (room.y0 + edge < sy < room.y1 - edge
                              and hi > room.x0 + edge and lo < room.x1 - edge)
                elif wall.is_vertical:
                    lo, hi = sorted((sy, ey))
                    inside = (room.x0 + edge < sx < room.x1 - edge
                              and hi > room.y0 + edge and lo < room.y1 - edge)
                else:
                    continue

                if inside:
                    problems.append(
                        f"wall {wall.name!r} runs through room {room.name!r}"
                    )

        return problems

    def check_room_enclosure(self) -> list[str]:
        """Private rooms with an edge that no wall closes.

        THIS IS THE CHECK THAT WOULD HAVE FOUND THE MASTER BEDROOM. Its south
        edge ran 1,055mm past the end of its own south wall, so the room was
        open to the entrance hall -- and the front door, which straddled the
        gap, opened into the bedroom. It was found by eye, in a screenshot,
        after being shipped.

        A DOORWAY IS NOT A GAP. An opening is a hole IN a wall, and the wall
        still runs along the room's edge either side of it, so a room with
        four doors still reads as enclosed here. What does not is an edge with
        no wall along it at all.

        Only PRIVATE rooms are checked. A living room open to the dining room
        and the hall is an open plan, not a fault, and this house is one --
        which is why the check is by room type rather than applied to
        everything.
        """
        private = {"bedroom", "bathroom", "ensuite", "laundry", "storage"}
        tolerance = 250.0       # a wall centreline sits inside the room edge
        min_gap = 200.0         # ignore rounding at corners

        problems: list[str] = []

        for room in self.rooms:
            if room.room_type not in private:
                continue

            for label, horizontal, line, lo, hi in (
                ("south", True, room.y0, room.x0, room.x1),
                ("north", True, room.y1, room.x0, room.x1),
                ("west", False, room.x0, room.y0, room.y1),
                ("east", False, room.x1, room.y0, room.y1),
            ):
                spans = []
                for wall in self.walls:
                    (sx, sy), (ex, ey) = wall.start, wall.end
                    reach = tolerance + wall.thickness / 2.0
                    if horizontal and wall.is_horizontal and abs(sy - line) <= reach:
                        a, b = sorted((sx, ex))
                    elif (not horizontal) and wall.is_vertical and abs(sx - line) <= reach:
                        a, b = sorted((sy, ey))
                    else:
                        continue
                    a, b = max(a, lo), min(b, hi)
                    if b > a:
                        spans.append((a, b))

                spans.sort()
                open_length = 0.0
                cursor = lo
                for a, b in spans:
                    if a > cursor:
                        open_length += a - cursor
                    cursor = max(cursor, b)
                if cursor < hi:
                    open_length += hi - cursor

                if open_length > min_gap:
                    problems.append(
                        f"{room.name}: {open_length:.0f}mm of its {label} edge "
                        f"has no wall, so the room is open to whatever is beyond"
                    )

        return problems

    def check_room_sizes(self) -> list[str]:
        """Rooms too small to hold what is advertised in them.

        Separate from `validate` on purpose. A wall that runs off the end of
        another is a broken plan and must stop the build; a bathroom 400mm
        short is a plan that will disappoint rather than fail, and the build
        should say so and carry on. Both are worth knowing; only one is fatal.

        See MIN_CLEAR for where the numbers come from -- they are the
        furniture, not an opinion about generous rooms.
        """
        problems: list[str] = []

        for room in self.rooms:
            limits = room.min_clear or MIN_CLEAR.get(room.room_type)
            if not limits:
                continue
            min_short, min_long, min_area = limits
            short, long = sorted((room.width, room.depth))

            if short < min_short - 1.0:
                problems.append(
                    f"{room.name}: {short:.0f}mm across, needs {min_short:.0f} "
                    f"for a {room.room_type}"
                )
            elif long < min_long - 1.0:
                problems.append(
                    f"{room.name}: {long:.0f}mm long, needs {min_long:.0f} "
                    f"for a {room.room_type}"
                )
            elif room.area < min_area - 0.05:
                problems.append(
                    f"{room.name}: {room.area:.1f} m2, needs {min_area:.1f} "
                    f"for a {room.room_type}"
                )

        return problems
