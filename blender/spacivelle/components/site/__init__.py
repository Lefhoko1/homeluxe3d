"""Site component catalogue.

The yard's equivalent of `components.default_components()`. Kept as its own
list so a house can be built with no yard at all, and a yard can be re-exported
without rebuilding the house.
"""

from __future__ import annotations

from ...core.component import Component
from .fence import FenceComponent
from .ground import GroundComponent
from .paving import GardenBedComponent, PavingComponent
from .planting import HedgeComponent, PlantingComponent
from .pool import PoolComponent
from .poolfence import PoolFenceComponent

__all__ = [
    "GroundComponent",
    "PavingComponent",
    "GardenBedComponent",
    "PoolComponent",
    "PoolFenceComponent",
    "PlantingComponent",
    "HedgeComponent",
    "FenceComponent",
    "site_components",
]


def site_components() -> list[Component]:
    """Build order: ground, then things on it, then things in it."""
    return [
        GroundComponent(),
        PavingComponent(),
        GardenBedComponent(),
        PoolComponent(),
        PoolFenceComponent(),
        PlantingComponent(),
        HedgeComponent(),
        FenceComponent(),
    ]
