"""Bradlows -- the media wall: a television and the stand it sits on.

Modelled from the product photographs and the dimensioned drawing, which is
why these two are in one module: the television is 1120mm wide and the stand
1870mm, and the whole point of putting them in a surveyed house is that the
one sits on the other with 375mm of plank either side. Two files would make
that relationship a coincidence.

CONVENTION, shared by every product in the catalogue:
    footprint centred on (0, 0), underside at z = 0, facing +Y.

THE SCREEN IS ITS OWN MATERIAL, and that is not decoration. `tv_screen` is
the surface the browser hangs a video texture on -- see the `television`
renderer. A television showing nothing is a black rectangle, which is the one
thing a television in a showroom must not be.
"""

from __future__ import annotations

from dataclasses import dataclass

try:
    import bpy
except ModuleNotFoundError:                 # pragma: no cover
    # See lounge.py: the data half of the catalogue is read by plain-Python
    # tools that have no Blender, so bpy must not be required at import time.
    bpy = None

from ....core import mesh as meshutil
from ....core.component import BuildContext

# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
LACQUER = "lacquer_black"       # the stand's black gloss
HANDLE = "handle_chrome"
BEZEL = "tv_bezel"
SCREEN = "tv_screen"


# ==========================================================================
# Juliet TV stand -- 1870 x 500 x 800, from the dimensioned drawing
# ==========================================================================

STAND_W = 1870.0
STAND_D = 500.0
STAND_H = 800.0

PLINTH_H = 60.0
PLINTH_INSET = 45.0             # the base is recessed, so the carcass floats
CARCASS_TOP = 690.0
PLANK_H = 60.0                  # the top plank, and the gap under it
CABINET_W = 470.0               # each end cabinet
SHELF_T = 22.0


def build_tv_stand(ctx: BuildContext) -> list[bpy.types.Object]:
    """The Juliet: two end cabinets, open centre shelving, floating top."""
    hw = STAND_W / 2.0
    hd = STAND_D / 2.0
    objects: list[bpy.types.Object] = []

    def black(obj):
        ctx.materials.assign(obj, LACQUER)
        objects.append(obj)
        return obj

    # -- Recessed plinth ---------------------------------------------------
    # Inset on all four sides so the carcass reads as hovering rather than
    # sitting in a puddle of itself. It is the shadow you see, not the block.
    black(meshutil.box(
        "juliet.plinth",
        -hw + PLINTH_INSET, -hd + PLINTH_INSET, 0.0,
        hw - PLINTH_INSET, hd - PLINTH_INSET, PLINTH_H,
    ))

    # -- Carcass -----------------------------------------------------------
    # Two closed end cabinets with a shelved opening between them.
    inner_left = -hw + CABINET_W
    inner_right = hw - CABINET_W

    for side, x0, x1 in (("left", -hw, inner_left),
                         ("right", inner_right, hw)):
        black(meshutil.box(
            f"juliet.cabinet_{side}",
            x0, -hd, PLINTH_H, x1, hd, CARCASS_TOP,
        ))

        # A slim horizontal pull, set low on the door as in the photograph.
        handle = meshutil.box(
            f"juliet.handle_{side}",
            x0 + 95.0, hd, PLINTH_H + 300.0,
            x1 - 95.0, hd + 26.0, PLINTH_H + 318.0,
        )
        ctx.materials.assign(handle, HANDLE)
        objects.append(handle)

    # The open middle: a back, a floor, a top and two shelves. Open at the
    # front, which is what it is for -- the photograph has DVDs in it.
    black(meshutil.box(
        "juliet.centre_back",
        inner_left, hd - 24.0, PLINTH_H, inner_right, hd, CARCASS_TOP,
    ))
    black(meshutil.box(
        "juliet.centre_floor",
        inner_left, -hd, PLINTH_H, inner_right, hd, PLINTH_H + SHELF_T,
    ))
    black(meshutil.box(
        "juliet.centre_top",
        inner_left, -hd, CARCASS_TOP - SHELF_T, inner_right, hd, CARCASS_TOP,
    ))

    # Two shelves. The upper is short and set back, so the bay below it takes
    # a row of DVDs standing up -- that is what the drawing shows.
    black(meshutil.box(
        "juliet.shelf_lower",
        inner_left, -hd, 330.0, inner_right, hd, 330.0 + SHELF_T,
    ))
    black(meshutil.box(
        "juliet.shelf_upper",
        inner_left, -hd + 120.0, 500.0, inner_right, hd, 500.0 + SHELF_T,
    ))

    # -- Floating top plank ------------------------------------------------
    # The signature of this piece: a full-width plank standing off the carcass
    # on a hidden riser, so a shadow runs the whole length under it.
    black(meshutil.box(
        "juliet.riser",
        -420.0, -hd + 90.0, CARCASS_TOP, 420.0, hd - 40.0, STAND_H - PLANK_H,
    ))
    black(meshutil.box(
        "juliet.top",
        -hw, -hd, STAND_H - PLANK_H, hw, hd, STAND_H,
    ))

    return objects


# ==========================================================================
# Sansui 50-inch FHD Google TV
# ==========================================================================

#: 50 inches on the diagonal, 16:9. The panel is the diagonal resolved into
#: its sides -- 1270mm across the corners gives 1107 x 623 of picture -- and
#: everything else is measured off that rather than guessed.
SCREEN_W = 1107.0
SCREEN_H = 623.0
BEZEL_W = 9.0                   # the thin frame around the picture
PANEL_D = 62.0
FOOT_H = 78.0                   # how far the feet lift it off the stand
FOOT_SPREAD = 0.78              # feet at 78% of the panel width apart

TV_W = SCREEN_W + BEZEL_W * 2
TV_H = SCREEN_H + BEZEL_W * 2
TV_TOTAL_H = TV_H + FOOT_H


def build_television(ctx: BuildContext) -> list[bpy.types.Object]:
    """A 50-inch flat panel on two splayed feet."""
    hw = TV_W / 2.0
    hd = PANEL_D / 2.0
    objects: list[bpy.types.Object] = []

    def bezel(obj):
        ctx.materials.assign(obj, BEZEL)
        objects.append(obj)
        return obj

    # -- The panel ---------------------------------------------------------
    bezel(meshutil.box(
        "sansui.panel",
        -hw, -hd, FOOT_H, hw, hd, FOOT_H + TV_H,
    ))

    # -- The picture -------------------------------------------------------
    # A separate object, a hair proud of the panel front, carrying its own
    # material. This is the thing the browser plays video on; leaving it as
    # part of the panel would mean texturing the back of the television too.
    #
    # The product faces +Y, so the picture is on the +Y face.
    screen = meshutil.box(
        "sansui.screen",
        -SCREEN_W / 2.0, hd - 3.0, FOOT_H + BEZEL_W,
        SCREEN_W / 2.0, hd + 1.0, FOOT_H + BEZEL_W + SCREEN_H,
    )
    ctx.materials.assign(screen, SCREEN)
    objects.append(screen)

    # -- Feet --------------------------------------------------------------
    # Splayed, as in the photograph: each foot is a wedge leaning outward, so
    # the television stands on two points well inboard of its own width. A
    # 50-inch panel on a 1870mm stand has room for that.
    foot_x = (TV_W * FOOT_SPREAD) / 2.0

    for side, sign in (("left", -1.0), ("right", 1.0)):
        # The angled leg: narrow at the top where it meets the panel, wide at
        # the floor. `prism` takes the four corners of the base and a height.
        bezel(meshutil.box(
            f"sansui.foot_{side}_leg",
            sign * foot_x - 26.0, -hd + 8.0, 0.0,
            sign * foot_x + 26.0, hd - 8.0, FOOT_H,
        ))
        # The pad on the floor, splayed outward from the leg.
        bezel(meshutil.box(
            f"sansui.foot_{side}_pad",
            sign * foot_x - (78.0 if sign > 0 else 150.0), -hd - 4.0, 0.0,
            sign * foot_x + (150.0 if sign > 0 else 78.0), hd + 4.0, 14.0,
        ))

    return objects


@dataclass(frozen=True)
class MediaSpec:
    """Sizes the rest of the catalogue needs without building anything."""

    stand_width: float = STAND_W
    stand_depth: float = STAND_D
    stand_height: float = STAND_H
    tv_width: float = TV_W
    tv_depth: float = PANEL_D + 8.0     # the feet stand slightly proud
    tv_height: float = TV_TOTAL_H


MEDIA = MediaSpec()
