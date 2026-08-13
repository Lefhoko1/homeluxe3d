"""Windows and doors.

Each opening kind gets a small factory class, and factories are looked up in a
registry keyed by `OpeningKind`. That indirection is the point: to change every
window in the house you write one new factory and register it, and to change a
single window you override its kind in the plan. Neither edit touches wall
geometry, because walls already carry the holes.

Every opening becomes its own named object -- `windows.bed3.north.frame` --
so a single window can be found and swapped at runtime in three.js.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import bpy

from ..core import mesh as meshutil
from ..core.component import BuildContext, Component
from ..core.wallmath import WallFrame
from ..config.plan import Opening, OpeningKind, Wall
from ..materials.library import MaterialLibrary

# Joinery dimensions. Millimetres, as everywhere.
FRAME_FACE = 60.0        # visible width of a frame member
FRAME_DEPTH = 120.0      # how far the frame reaches through the wall
GLASS_THICKNESS = 8.0
LEAF_THICKNESS = 40.0
LINING_FACE = 30.0
SASH_FACE = 45.0


def _piece(
    name: str,
    frame: WallFrame,
    s0: float, s1: float, z0: float, z1: float,
    depth: float,
) -> bpy.types.Object:
    """A box spanning `s0..s1` along the wall and `z0..z1` up it.

    `depth` is the across-wall dimension, centred on the wall's centreline.
    """
    inset = (frame.thickness - depth) / 2.0
    x0, y0, x1, y1 = frame.bounds(s0, s1, inset)
    return meshutil.box(name, x0, y0, z0, x1, y1, z1)


def _ring(
    name: str,
    frame: WallFrame,
    s0: float, s1: float, z0: float, z1: float,
    face: float,
    depth: float,
    include_sill: bool = True,
) -> bpy.types.Object:
    """Frame members around the perimeter of an opening."""
    members = [
        _piece(f"{name}.jamb_a", frame, s0, s0 + face, z0, z1, depth),
        _piece(f"{name}.jamb_b", frame, s1 - face, s1, z0, z1, depth),
        _piece(f"{name}.head", frame, s0 + face, s1 - face, z1 - face, z1, depth),
    ]
    if include_sill:
        members.append(
            _piece(f"{name}.sill", frame, s0 + face, s1 - face, z0, z0 + face, depth)
        )
    return meshutil.join(members, name)


class OpeningFactory(ABC):
    """Builds the joinery that fills one opening."""

    #: Which finish the frame/leaf gets.
    frame_finish: str = "alu_dark"

    @abstractmethod
    def build(
        self,
        name: str,
        wall: Wall,
        opening: Opening,
        frame: WallFrame,
        materials: MaterialLibrary,
    ) -> list[bpy.types.Object]:
        ...

    def _extents(self, opening: Opening) -> tuple[float, float, float, float]:
        half = opening.width / 2.0
        return (
            opening.offset - half,
            opening.offset + half,
            opening.sill,
            opening.head,
        )


class WindowFactory(OpeningFactory):
    """Aluminium-framed fixed window with a glazed panel."""

    frame_finish = "alu_dark"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        depth = min(FRAME_DEPTH, wall.thickness - 20.0)

        joinery = _ring(f"{name}.frame", frame, s0, s1, z0, z1, FRAME_FACE, depth)
        materials.assign(joinery, self.frame_finish)

        glass = _piece(
            f"{name}.glass", frame,
            s0 + FRAME_FACE, s1 - FRAME_FACE,
            z0 + FRAME_FACE, z1 - FRAME_FACE,
            GLASS_THICKNESS,
        )
        materials.assign(glass, "glass")

        return [joinery, glass]


class SlidingDoorFactory(OpeningFactory):
    """Two-panel aluminium slider, both leaves glazed."""

    frame_finish = "alu_dark"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        depth = min(FRAME_DEPTH, wall.thickness - 20.0)

        members = [_ring(f"{name}.outer", frame, s0, s1, z0, z1,
                         FRAME_FACE, depth, include_sill=True)]

        # Two sashes meeting at the centre, offset across the wall so they
        # read as sliding past one another rather than as one fixed pane.
        mid = (s0 + s1) / 2.0
        for index, (a, b) in enumerate(((s0 + FRAME_FACE, mid + SASH_FACE / 2.0),
                                        (mid - SASH_FACE / 2.0, s1 - FRAME_FACE))):
            members.append(
                _ring(f"{name}.sash{index}", frame, a, b,
                      z0 + FRAME_FACE, z1 - FRAME_FACE, SASH_FACE, depth / 2.0)
            )

        joinery = meshutil.join(members, f"{name}.frame")
        materials.assign(joinery, self.frame_finish)

        glass = _piece(
            f"{name}.glass", frame,
            s0 + FRAME_FACE, s1 - FRAME_FACE,
            z0 + FRAME_FACE, z1 - FRAME_FACE,
            GLASS_THICKNESS,
        )
        materials.assign(glass, "glass")

        return [joinery, glass]


class ExternalDoorFactory(OpeningFactory):
    """Solid timber entry door in an aluminium frame."""

    frame_finish = "alu_dark"
    leaf_finish = "timber_door"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        depth = min(FRAME_DEPTH, wall.thickness - 20.0)

        joinery = _ring(f"{name}.frame", frame, s0, s1, z0, z1,
                        FRAME_FACE, depth, include_sill=False)
        materials.assign(joinery, self.frame_finish)

        leaf = _piece(
            f"{name}.leaf", frame,
            s0 + FRAME_FACE, s1 - FRAME_FACE,
            z0, z1 - FRAME_FACE,
            LEAF_THICKNESS,
        )
        materials.assign(leaf, self.leaf_finish)

        return [joinery, leaf]


class InternalDoorFactory(OpeningFactory):
    """Painted hinged door in a timber lining."""

    frame_finish = "door_painted"
    leaf_finish = "door_painted"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        depth = wall.thickness

        lining = _ring(f"{name}.lining", frame, s0, s1, z0, z1,
                       LINING_FACE, depth, include_sill=False)
        materials.assign(lining, self.frame_finish)

        leaf = _piece(
            f"{name}.leaf", frame,
            s0 + LINING_FACE, s1 - LINING_FACE,
            z0, z1 - LINING_FACE,
            LEAF_THICKNESS,
        )
        materials.assign(leaf, self.leaf_finish)

        return [lining, leaf]


class DoorwayFactory(OpeningFactory):
    """A cased opening: lining only, no leaf."""

    frame_finish = "door_painted"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        lining = _ring(f"{name}.lining", frame, s0, s1, z0, z1,
                       LINING_FACE, wall.thickness, include_sill=False)
        materials.assign(lining, self.frame_finish)
        return [lining]


class GarageDoorFactory(OpeningFactory):
    """Panel-lift garage door. Registered but unused by the 3-bed plan."""

    frame_finish = "garage_panel"

    def build(self, name, wall, opening, frame, materials):
        s0, s1, z0, z1 = self._extents(opening)
        panels = []
        count = 4
        step = (z1 - z0) / count
        for i in range(count):
            panels.append(
                _piece(f"{name}.panel{i}", frame, s0, s1,
                       z0 + i * step + 8.0, z0 + (i + 1) * step - 8.0, 60.0)
            )
        door = meshutil.join(panels, f"{name}.door")
        materials.assign(door, self.frame_finish)
        return [door]


#: The extension point. Add a kind here to change how it is built.
FACTORIES: dict[OpeningKind, OpeningFactory] = {
    OpeningKind.WINDOW: WindowFactory(),
    OpeningKind.SLIDING_DOOR: SlidingDoorFactory(),
    OpeningKind.DOOR_EXTERNAL: ExternalDoorFactory(),
    OpeningKind.DOOR_INTERNAL: InternalDoorFactory(),
    OpeningKind.DOORWAY: DoorwayFactory(),
    OpeningKind.GARAGE_DOOR: GarageDoorFactory(),
}


class _OpeningsBase(Component):
    """Walks every wall and fills the openings this component is responsible for."""

    kinds: frozenset[OpeningKind] = frozenset()

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        objects: list[bpy.types.Object] = []

        for wall in ctx.plan.walls:
            frame = WallFrame.of(wall)
            for opening in wall.openings:
                if opening.kind not in self.kinds:
                    continue

                factory = FACTORIES.get(opening.kind)
                if factory is None:
                    ctx.warn(f"no factory registered for {opening.kind}")
                    continue

                label = opening.name or f"{wall.name}.{int(opening.offset)}"
                objects.extend(
                    factory.build(
                        self.object_name(label), wall, opening, frame, ctx.materials
                    )
                )

        return objects


class WindowsComponent(_OpeningsBase):
    """All glazing, including sliding doors."""

    category = "windows"
    label = "Windows & glazing"
    kinds = frozenset({OpeningKind.WINDOW, OpeningKind.SLIDING_DOOR})


class DoorsComponent(_OpeningsBase):
    """All hinged doors and cased openings."""

    category = "doors"
    label = "Doors"
    kinds = frozenset({
        OpeningKind.DOOR_EXTERNAL,
        OpeningKind.DOOR_INTERNAL,
        OpeningKind.DOORWAY,
        OpeningKind.GARAGE_DOOR,
    })
