"""Door hardware.

The butt hinge from Tubod, modelled off `public/DoorHinge.png`: two
rectangular leaves with four countersunk holes each, a four-knuckle barrel and
a pin, all in matte black.

WHY IT IS TWO OBJECTS AND NOT ONE. A hinge is the one piece of joinery in a
house that is deliberately in two halves: one leaf is screwed to the frame and
stays put, the other is screwed to the door and swings with it. Modelled as a
single object it has to belong to one or the other, and then either the frame
plate swings away from the frame or the door plate stays behind as the door
opens. Both look wrong the moment somebody walks up to a door -- which, now
that doors open, is exactly what a visitor does.

So `build_hinge` returns the two halves separately and the caller decides what
each is attached to. The BARREL GOES WITH THE FRAME. Its knuckles interleave
in reality, and it sits on the axis of rotation, so it looks identical whether
it turns or not -- putting it on the fixed side is free.

Everything is in world millimetres, positioned by the hinge's axis point and a
direction along the wall, because that is what both callers already have: the
door factory knows where its leaf hangs, and the catalogue knows where it
wants to show one off.
"""

from __future__ import annotations

try:
    import bpy
except ModuleNotFoundError:                 # pragma: no cover
    # Importable without Blender, so the plain-Python tools that solve the
    # route and the collision model can read the catalogue. See core/mesh.py.
    bpy = None

from ..core import mesh as meshutil

#: The 100mm butt hinge in the photograph.
LEAF_HEIGHT = 100.0     # along the door edge
LEAF_WIDTH = 44.0       # across, from the pin to the outer edge of one plate
LEAF_THICKNESS = 3.0
KNUCKLE_RADIUS = 7.0
PIN_RADIUS = 3.4
PIN_OVERHANG = 5.0      # the pin head standing proud, top and bottom

#: Four countersunk holes per plate, as in the photograph. Modelled as shallow
#: dishes rather than cut through: a 5mm hole in a 3mm plate seen from two
#: metres is a dark dot either way, and a boolean per hole is 48 booleans on a
#: house with eight doors.
HOLE_RADIUS = 4.2
HOLE_DEPTH = 1.1

FINISH = "hinge_black"


def build_hinge(
    name: str,
    x_mm: float,
    y_mm: float,
    z_mm: float,
    along: tuple[float, float],
    across: tuple[float, float],
    materials,
) -> tuple[list[bpy.types.Object], list[bpy.types.Object]]:
    """One hinge, centred on its axis at (x, y, z).

    `along` is the unit vector down the wall the door sits in; `across` is its
    perpendicular, pointing into the room the leaf swings towards. The plates
    lie in the plane of the closed door, which is the `along` direction, and
    the barrel stands vertically on the axis.

    @returns (frame_side, leaf_side) -- objects to attach to the lining, and
             objects that swing with the door.
    """
    frame_side: list[bpy.types.Object] = []
    leaf_side: list[bpy.types.Object] = []

    ax, ay = along
    cx, cy = across

    def plate(tag: str, sign: int) -> bpy.types.Object:
        """One leaf of the hinge, offset from the pin along the wall.

        `sign` picks which side of the barrel it lies on: -1 is the half
        screwed to the frame reveal, +1 the half screwed to the door edge.
        """
        # Corners of the plate, in world XY.
        near = KNUCKLE_RADIUS * 0.4
        far = near + LEAF_WIDTH

        x0 = x_mm + ax * sign * near
        y0 = y_mm + ay * sign * near
        x1 = x_mm + ax * sign * far
        y1 = y_mm + ay * sign * far

        # Thickness is across the door; height is vertical.
        hx = cx * LEAF_THICKNESS / 2.0
        hy = cy * LEAF_THICKNESS / 2.0

        return meshutil.box(
            f"{name}.{tag}",
            min(x0, x1) - abs(hx), min(y0, y1) - abs(hy), z_mm - LEAF_HEIGHT / 2.0,
            max(x0, x1) + abs(hx), max(y0, y1) + abs(hy), z_mm + LEAF_HEIGHT / 2.0,
        )

    def holes(tag: str, sign: int) -> list[bpy.types.Object]:
        """Four countersunk dishes down one plate."""
        out = []
        near = KNUCKLE_RADIUS * 0.4
        for i in range(4):
            # Evenly down the plate, and centred across its width.
            t = (i + 0.5) / 4.0
            z = z_mm - LEAF_HEIGHT / 2.0 + t * LEAF_HEIGHT
            d = near + LEAF_WIDTH * 0.55
            hx = x_mm + ax * sign * d
            hy = y_mm + ay * sign * d
            out.append(
                meshutil.cylinder(
                    f"{name}.{tag}_hole{i}", hx, hy,
                    z - HOLE_DEPTH / 2.0, z + HOLE_DEPTH / 2.0,
                    HOLE_RADIUS, radius_top_mm=HOLE_RADIUS * 0.55, segments=8,
                )
            )
        return out

    # -- The fixed half: frame plate, barrel and pin ------------------------
    frame_side.append(plate("frame_plate", -1))
    frame_side.extend(holes("frame", -1))

    # Four knuckles. Drawn as separate short cylinders with a hairline between
    # them, which is what reads as a hinge rather than as a rod.
    knuckle = LEAF_HEIGHT / 4.0
    for i in range(4):
        z0 = z_mm - LEAF_HEIGHT / 2.0 + i * knuckle + 1.0
        frame_side.append(
            meshutil.cylinder(
                f"{name}.knuckle{i}", x_mm, y_mm, z0, z0 + knuckle - 2.0,
                KNUCKLE_RADIUS, segments=12,
            )
        )

    frame_side.append(
        meshutil.cylinder(
            f"{name}.pin", x_mm, y_mm,
            z_mm - LEAF_HEIGHT / 2.0 - PIN_OVERHANG,
            z_mm + LEAF_HEIGHT / 2.0 + PIN_OVERHANG,
            PIN_RADIUS, segments=10,
        )
    )

    # -- The swinging half --------------------------------------------------
    leaf_side.append(plate("leaf_plate", 1))
    leaf_side.extend(holes("leaf", 1))

    for obj in (*frame_side, *leaf_side):
        materials.assign(obj, FINISH)

    return frame_side, leaf_side


#: Where the hinges go on a leaf, as a fraction of its height.
#:
#: Three hinges, and the top and bottom ones are NOT symmetrical about the
#: middle: a door is hung with its top hinge higher above the head than the
#: bottom one is above the floor, because the top hinge carries the load. The
#: numbers are the standard 150mm from the head and 250mm from the floor on a
#: 2.1m leaf, expressed as fractions so they follow the door height.
HINGE_HEIGHTS = (0.119, 0.5, 0.929)


def hinge_points(z0: float, z1: float) -> list[float]:
    """The heights of the three hinges on a leaf running z0..z1."""
    height = z1 - z0
    return [z0 + f * height for f in HINGE_HEIGHTS]
