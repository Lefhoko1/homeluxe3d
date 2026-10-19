"""2D polygon helpers.

Shared by any component that needs to grow or shrink the building outline --
the slab pushes it out to form the apron, the ceiling pulls it in to the
internal face of the walls. Neither should import from the other, so the
operation lives here.
"""

from __future__ import annotations

Polygon = tuple[tuple[float, float], ...]


def offset_polygon(polygon: Polygon, distance: float) -> list[tuple[float, float]]:
    """Offset a rectilinear polygon by `distance`; negative shrinks it.

    Every vertex moves diagonally away from the centroid, which is exact for
    the 90-degree corners this project uses and wrong for anything else. The
    plans are entirely axis-aligned, so that restriction costs nothing.
    """
    n = len(polygon)
    centre_x = sum(p[0] for p in polygon) / n
    centre_y = sum(p[1] for p in polygon) / n

    result: list[tuple[float, float]] = []
    for x, y in polygon:
        dx = 1.0 if x >= centre_x else -1.0
        dy = 1.0 if y >= centre_y else -1.0
        result.append((x + dx * distance, y + dy * distance))

    return result
