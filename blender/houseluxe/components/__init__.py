"""Component catalogue.

`default_components()` is the build order for the standard house. Adding a
part to the building means adding a class and listing it here; removing one
means deleting a line. Nothing else has to know.
"""

from __future__ import annotations

from ..core.component import Component
from .ceiling import CeilingComponent
from .floors import FloorFinishComponent
from .lights import LightsComponent
from .openings import DoorsComponent, WindowsComponent
from .porch import PorchComponent
from .roof import RoofComponent
from .slab import SlabComponent
from .wallfinish import WallFinishComponent
from .walls import ExteriorWallsComponent, InteriorWallsComponent

__all__ = [
    "SlabComponent",
    "FloorFinishComponent",
    "ExteriorWallsComponent",
    "InteriorWallsComponent",
    "WallFinishComponent",
    "WindowsComponent",
    "DoorsComponent",
    "CeilingComponent",
    "LightsComponent",
    "RoofComponent",
    "PorchComponent",
    "default_components",
]


def default_components() -> list[Component]:
    """Build order: structure, then enclosure, then joinery, then roof."""
    return [
        SlabComponent(),
        FloorFinishComponent(),
        ExteriorWallsComponent(),
        InteriorWallsComponent(),
        WallFinishComponent(),
        WindowsComponent(),
        DoorsComponent(),
        CeilingComponent(),
        LightsComponent(),
        PorchComponent(),
        RoofComponent(),
    ]
