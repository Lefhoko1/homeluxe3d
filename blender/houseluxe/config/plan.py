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


@dataclass(frozen=True)
class RoofSpec:
    """Hipped roof parameters.

    Ridge height is DERIVED from pitch and span rather than stated, so the
    roof stays geometrically consistent when you change the pitch.
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
