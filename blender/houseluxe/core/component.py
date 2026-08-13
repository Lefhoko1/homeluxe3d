"""The Component contract.

Every buildable part of the house is a Component subclass. A Component:

  * owns exactly one category of real-world part (walls, roof, windows, ...)
  * builds only its own geometry and never reaches into a sibling
  * declares the collection it lives in and the GLB it exports to

That contract is the whole point of the exercise. Because a Component is the
unit of building *and* the unit of export, swapping the roof means editing one
class and re-exporting one file -- nothing else in the scene moves.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import bpy

from ..config.plan import HousePlan
from ..config.site import SiteSpec
from ..materials.library import MaterialLibrary


@dataclass
class BuildContext:
    """Everything a Component is allowed to see.

    Passing this in rather than letting components import globals keeps them
    testable and makes the dependency explicit: geometry depends on the plan
    and on the material library, and on nothing else.

    `site` is None for a house-only build. Site components must check for it
    rather than assume a yard exists -- the house has to stand on its own.
    """

    plan: HousePlan
    materials: MaterialLibrary
    collection: bpy.types.Collection
    site: SiteSpec | None = None
    warnings: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


class Component(ABC):
    """Base class for every part of the house.

    Subclasses override :attr:`category` and :meth:`build`. They must return
    the objects they created; registration into the collection is handled by
    the builder so no subclass has to remember to do it.
    """

    #: Short slug. Names the collection, the GLB file, and the object prefix.
    category: str = "component"

    #: Human-readable label used in the build report.
    label: str = "Component"

    #: Set False to keep a component in the .blend but out of the export set.
    exportable: bool = True

    @abstractmethod
    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        """Create and return this component's objects.

        Implementations work in world millimetres and must not link objects
        into any collection -- the builder owns scene graph placement.
        """

    def object_name(self, *parts: str) -> str:
        """Namespaced object name, e.g. ``walls.exterior.north``.

        Stable, predictable names matter: they survive into the GLB and become
        the handles three.js uses to find and swap a part.
        """
        return ".".join((self.category, *parts))

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<{type(self).__name__} category={self.category!r}>"
