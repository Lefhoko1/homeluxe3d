"""Wall coordinate maths, shared by the wall and opening components.

A wall is described by a centreline. Everything placed on or in that wall --
piers, lintels, window frames, door leaves -- is positioned by how far ALONG
the wall it sits. This module is the single translation between "3,400mm along
the north wall" and a world coordinate.

Both the wall component and the openings component need that translation, and
neither should own it, so it lives here.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config.plan import Opening, Wall


@dataclass(frozen=True)
class WallFrame:
    """The local coordinate frame of one wall.

    `along` is the unit vector from start to end; `across` is its left-hand
    perpendicular. Because the plan is entirely axis-aligned, both are exact
    unit vectors with no floating point drift.
    """

    origin: tuple[float, float]
    along: tuple[float, float]
    across: tuple[float, float]
    length: float
    thickness: float
    height: float

    @classmethod
    def of(cls, wall: Wall) -> "WallFrame":
        (x0, y0), (x1, y1) = wall.start, wall.end
        dx, dy = x1 - x0, y1 - y0
        length = (dx * dx + dy * dy) ** 0.5
        if length == 0:
            raise ValueError(f"wall {wall.name!r} has zero length")

        along = (dx / length, dy / length)
        across = (-along[1], along[0])
        return cls(
            origin=(x0, y0),
            along=along,
            across=across,
            length=length,
            thickness=wall.thickness,
            height=wall.height,
        )

    def point(self, s: float, t: float = 0.0) -> tuple[float, float]:
        """World XY at `s` along the wall and `t` across its centreline."""
        return (
            self.origin[0] + self.along[0] * s + self.across[0] * t,
            self.origin[1] + self.along[1] * s + self.across[1] * t,
        )

    def bounds(self, s0: float, s1: float, inset: float = 0.0
               ) -> tuple[float, float, float, float]:
        """Axis-aligned XY bounds of the slab of wall between s0 and s1.

        `inset` shrinks the thickness symmetrically, used to sit a window
        frame just inside the masonry rather than flush with it.
        """
        half = self.thickness / 2.0 - inset
        ax, ay = self.point(s0, -half)
        bx, by = self.point(s1, half)
        return (min(ax, bx), min(ay, by), max(ax, bx), max(ay, by))

    @property
    def rotation_degrees(self) -> float:
        """Heading of the wall, for orienting objects placed in it."""
        import math
        return math.degrees(math.atan2(self.along[1], self.along[0]))


@dataclass(frozen=True)
class Span:
    """A solid piece of wall between two openings, or above/below one."""

    s0: float
    s1: float
    z0: float
    z1: float
    tag: str

    @property
    def is_degenerate(self) -> bool:
        return (self.s1 - self.s0) < 1.0 or (self.z1 - self.z0) < 1.0


def solid_spans(wall: Wall, extend_ends: bool = True) -> list[Span]:
    """Decompose a wall into the solid pieces left once openings are cut.

    Rather than modelling a full wall and booleaning holes out of it, the wall
    is built as the pieces that actually exist: piers between openings, sills
    below them, lintels over them. That yields clean quad geometry with no
    boolean artefacts and no coplanar-face flicker in three.js.

    `extend_ends` pushes each end out by half the wall thickness so that walls
    meeting at a shared centreline point close their corner exactly.
    """
    frame_length = wall.length
    pad = wall.thickness / 2.0 if extend_ends else 0.0

    openings = sorted(wall.openings, key=lambda o: o.offset)
    spans: list[Span] = []

    cursor = -pad
    for opening in openings:
        half = opening.width / 2.0
        left = opening.offset - half
        right = opening.offset + half

        if left > cursor:
            spans.append(Span(cursor, left, 0.0, wall.height, "pier"))

        if opening.sill > 0.0:
            spans.append(Span(left, right, 0.0, opening.sill,
                              f"sill:{opening.name or opening.kind.value}"))

        if opening.head < wall.height:
            spans.append(Span(left, right, opening.head, wall.height,
                              f"lintel:{opening.name or opening.kind.value}"))

        cursor = max(cursor, right)

    end = frame_length + pad
    if end > cursor:
        spans.append(Span(cursor, end, 0.0, wall.height, "pier"))

    return [s for s in spans if not s.is_degenerate]


def opening_centre(wall: Wall, opening: Opening) -> tuple[float, float, float]:
    """World XYZ of the centre of an opening."""
    frame = WallFrame.of(wall)
    x, y = frame.point(opening.offset)
    z = (opening.sill + opening.head) / 2.0
    return (x, y, z)
