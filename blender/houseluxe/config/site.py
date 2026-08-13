"""Site data model -- the vocabulary a yard is described in.

Deliberately separate from `plan.py`. The house and the land it sits on are
different concerns with different lifespans: you will re-clad the house far
more often than you will move the boundary fence, and neither change should
require touching the other's data.

Same conventions as the house: millimetres, +X east, +Y north, +Z up, and
Z = 0 is the house's finished floor level. The yard therefore sits at a
NEGATIVE Z, which is what makes the slab edge visible above the lawn.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


def _hash01(ix: int, iy: int) -> float:
    """Deterministic 0..1 hash of an integer lattice point."""
    h = (ix * 374761393 + iy * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _value_noise(x: float, y: float, cell: float) -> float:
    """Smooth value noise in 0..1. Deterministic, so builds are repeatable."""
    fx, fy = x / cell, y / cell
    ix, iy = math.floor(fx), math.floor(fy)
    tx, ty = fx - ix, fy - iy

    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)

    n00, n10 = _hash01(ix, iy), _hash01(ix + 1, iy)
    n01, n11 = _hash01(ix, iy + 1), _hash01(ix + 1, iy + 1)

    a = n00 + (n10 - n00) * sx
    b = n01 + (n11 - n01) * sx
    return a + (b - a) * sy


@dataclass(frozen=True)
class Rect:
    """Axis-aligned plan rectangle with a name and a finish."""

    name: str
    x0: float
    y0: float
    x1: float
    y1: float
    finish: str = "paving"
    thickness: float = 80.0

    @property
    def width(self) -> float:
        return abs(self.x1 - self.x0)

    @property
    def depth(self) -> float:
        return abs(self.y1 - self.y0)

    @property
    def area(self) -> float:
        """Square metres."""
        return (self.width * self.depth) / 1_000_000.0

    def distance_to(self, x: float, y: float) -> float:
        """Distance from a point to this rectangle; 0 if inside."""
        dx = max(self.x0 - x, 0.0, x - self.x1)
        dy = max(self.y0 - y, 0.0, y - self.y1)
        return math.hypot(dx, dy)

    def overlaps(self, other: "Rect") -> bool:
        return not (
            self.x1 <= other.x0
            or other.x1 <= self.x0
            or self.y1 <= other.y0
            or other.y1 <= self.y0
        )


@dataclass(frozen=True)
class PoolSpec:
    """An in-ground pool.

    `x0..y1` is the WATER edge -- the wet rectangle you would quote as the
    pool size. Shell walls, coping and floor are built outward and downward
    from it, so changing the pool size never leaves the coping behind.
    """

    name: str
    x0: float
    y0: float
    x1: float
    y1: float

    depth_shallow: float = 1100.0   # at the y0 end
    depth_deep: float = 1900.0      # at the y1 end
    wall_thickness: float = 250.0
    floor_thickness: float = 200.0

    coping_overhang: float = 30.0   # how far coping laps over the water
    coping_thickness: float = 60.0
    water_level: float = -120.0     # below paving level

    @property
    def width(self) -> float:
        return abs(self.x1 - self.x0)

    @property
    def length(self) -> float:
        return abs(self.y1 - self.y0)

    @property
    def shell(self) -> tuple[float, float, float, float]:
        """Outer face of the pool structure."""
        t = self.wall_thickness
        return (self.x0 - t, self.y0 - t, self.x1 + t, self.y1 + t)

    def validate(self) -> list[str]:
        problems: list[str] = []
        if self.width <= 0 or self.length <= 0:
            problems.append(f"pool {self.name!r} has non-positive size")
        if self.depth_shallow <= 0 or self.depth_deep <= 0:
            problems.append(f"pool {self.name!r} has non-positive depth")
        if self.water_level >= 0:
            problems.append(
                f"pool {self.name!r} water level is at or above paving level"
            )
        return problems


@dataclass(frozen=True)
class Plant:
    """One tree or shrub.

    `seed` drives the small random offsets that stop repeated planting from
    looking stamped. Same seed, same plant, every rebuild.
    """

    kind: str          # "tree" | "shrub"
    x: float
    y: float
    height: float
    spread: float
    seed: int = 0
    foliage: str = "foliage"


@dataclass(frozen=True)
class HedgeRun:
    """A clipped hedge along a straight line."""

    name: str
    start: tuple[float, float]
    end: tuple[float, float]
    width: float = 800.0
    height: float = 1500.0
    finish: str = "hedge"


@dataclass(frozen=True)
class PoolFence:
    """Pool safety barrier: glass panels between posts, with one gate.

    Modelled separately from the boundary fence because it is a different
    thing with different rules. Most jurisdictions require a pool to be
    enclosed by its OWN barrier -- a boundary fence around the whole property
    does not satisfy it, because the house doors open inside the yard.

    The gate is a gap in one side; `gate_side` picks which.
    """

    name: str
    x0: float
    y0: float
    x1: float
    y1: float

    height: float = 1200.0          # typical minimum barrier height
    post_size: float = 50.0
    post_spacing: float = 1200.0
    panel_inset: float = 12.0       # glass sits inside the post face
    gate_side: str = "south"        # south | north | east | west
    gate_position: float = 0.0      # along that side, from its low end
    gate_width: float = 900.0
    open_sides: tuple[str, ...] = ()  # sides to omit, e.g. against a wall

    post_finish: str = "alu_dark"
    panel_finish: str = "glass"

    def validate(self) -> list[str]:
        problems: list[str] = []
        if self.gate_side not in ("south", "north", "east", "west"):
            problems.append(f"pool fence {self.name!r} has bad gate_side")
        if self.gate_width <= 0:
            problems.append(f"pool fence {self.name!r} has non-positive gate")
        for side in self.open_sides:
            if side not in ("south", "north", "east", "west"):
                problems.append(f"pool fence {self.name!r} has bad open side {side!r}")
        if self.gate_side in self.open_sides:
            problems.append(
                f"pool fence {self.name!r} puts its gate on an omitted side"
            )
        return problems


@dataclass(frozen=True)
class FenceRun:
    """Boundary fence: posts at centres, with rails between them."""

    name: str
    start: tuple[float, float]
    end: tuple[float, float]
    height: float = 1800.0
    post_spacing: float = 2400.0
    post_size: float = 90.0
    rail_thickness: float = 32.0
    rail_count: int = 3
    finish: str = "fence_timber"


@dataclass
class SiteSpec:
    """A complete yard.

    Everything is optional except the boundary, so a bare site is a legal
    site -- useful when you want the lawn and nothing else.
    """

    name: str
    bounds: tuple[float, float, float, float]   # x0, y0, x1, y1
    ground_level: float = -150.0                # top of lawn, below FFL
    soil_depth: float = 600.0

    # -- Terrain ------------------------------------------------------------
    # The lawn is not flat. It falls away from the building for drainage and
    # carries low undulation so it does not read as a billiard table.
    #
    # `flat_zones` are held at exactly `ground_level`: anything the contour
    # must not disturb -- the house, the paving, the pool. Terrain blends in
    # over `flat_falloff` beyond them.
    contour_fall: float = 260.0        # drop from centre to boundary
    contour_amplitude: float = 90.0    # +/- undulation
    contour_cell: float = 7000.0       # noise wavelength
    flat_zones: list[Rect] = field(default_factory=list)
    flat_falloff: float = 3500.0

    pool: PoolSpec | None = None
    pool_fence: PoolFence | None = None
    paving: list[Rect] = field(default_factory=list)
    beds: list[Rect] = field(default_factory=list)
    plants: list[Plant] = field(default_factory=list)
    hedges: list[HedgeRun] = field(default_factory=list)
    fences: list[FenceRun] = field(default_factory=list)
    notes: tuple[str, ...] = ()

    @property
    def width(self) -> float:
        return abs(self.bounds[2] - self.bounds[0])

    @property
    def depth(self) -> float:
        return abs(self.bounds[3] - self.bounds[1])

    @property
    def area(self) -> float:
        """Square metres."""
        return (self.width * self.depth) / 1_000_000.0

    def contains(self, x: float, y: float) -> bool:
        x0, y0, x1, y1 = self.bounds
        return x0 <= x <= x1 and y0 <= y <= y1

    def flat_blend(self, x: float, y: float) -> float:
        """0 where terrain must stay flat, 1 where it is free to move."""
        if not self.flat_zones:
            return 1.0
        distance = min(zone.distance_to(x, y) for zone in self.flat_zones)
        if distance <= 0.0:
            return 0.0
        return min(1.0, distance / self.flat_falloff)

    def elevation(self, x: float, y: float) -> float:
        """Ground height at a point.

        THE single source of truth for where the ground is. Every component
        that puts something on the ground -- trees, shrubs, hedges, fence
        posts -- must call this rather than using `ground_level` directly,
        or it will float above the contour or sink into it.
        """
        blend = self.flat_blend(x, y)
        if blend <= 0.0:
            return self.ground_level

        x0, y0, x1, y1 = self.bounds
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        half = max(self.width, self.depth) / 2.0
        radial = min(1.0, math.hypot(x - cx, y - cy) / half)

        fall = radial * self.contour_fall
        undulation = (_value_noise(x, y, self.contour_cell) - 0.5) * 2.0 \
            * self.contour_amplitude

        return self.ground_level - blend * (fall + undulation)

    def lowest_elevation(self) -> float:
        """Worst-case ground height, for sizing what must be buried."""
        return self.ground_level - self.contour_fall - self.contour_amplitude

    def validate(self) -> list[str]:
        problems: list[str] = []

        if self.width <= 0 or self.depth <= 0:
            problems.append("site bounds are degenerate")

        if self.pool_fence is not None:
            problems.extend(self.pool_fence.validate())
        elif self.pool is not None:
            problems.append(
                f"pool {self.pool.name!r} has no safety barrier -- set "
                "SiteSpec.pool_fence, or state explicitly why none is needed"
            )

        if self.pool is not None:
            problems.extend(self.pool.validate())
            sx0, sy0, sx1, sy1 = self.pool.shell
            if not (self.contains(sx0, sy0) and self.contains(sx1, sy1)):
                problems.append(
                    f"pool {self.pool.name!r} extends outside the site boundary"
                )

        seen: set[str] = set()
        for rect in list(self.paving) + list(self.beds):
            if rect.name in seen:
                problems.append(f"duplicate paved/bed area name {rect.name!r}")
            seen.add(rect.name)
            if not (self.contains(rect.x0, rect.y0) and self.contains(rect.x1, rect.y1)):
                problems.append(f"area {rect.name!r} extends outside the site boundary")

        for plant in self.plants:
            if not self.contains(plant.x, plant.y):
                problems.append(
                    f"{plant.kind} at ({plant.x:.0f}, {plant.y:.0f}) is off-site"
                )

        return problems

    def paved_area(self) -> float:
        return sum(rect.area for rect in self.paving)
