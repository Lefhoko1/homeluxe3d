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

import math
from dataclasses import dataclass
from pathlib import Path

try:
    import bpy
    import mathutils
except ModuleNotFoundError:                 # pragma: no cover
    # See lounge.py: the data half of the catalogue is read by plain-Python
    # tools that have no Blender, so bpy must not be required at import time.
    bpy = None
    mathutils = None

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


# ==========================================================================
# Modern Black TV Console -- 1845 x 517 x 780, an UPLOADED model
# ==========================================================================
#
# THIS ONE IS NOT MODELLED HERE. It arrived as a finished .glb built from
# reference photographs -- 26 named meshes, 852 triangles, four flat PBR
# materials and no image textures. Re-modelling it from the pictures would be
# inventing a second, worse copy of something that already exists, so the
# builder IMPORTS it and the catalogue treats it like any other product.
#
# That matters for one reason above all: a product in the catalogue is seen by
# the ROUTE SOLVER. `tour_json` paints the walls, the joinery and the
# catalogue's placements and solves a path clear of all of them. A model
# inserted straight into the database by migration is invisible to it, which
# is how a 3.37m kitchen run came to be standing across a 2.4m doorway with
# every file-reading test still passing. Importing here is what buys the
# guarantee that the walk is solved around this console rather than through it.
#
# WHAT THE FILE NEEDS FIXING. It does not follow the house's conventions, and
# both corrections are measured from the geometry rather than assumed:
#
#   * It is Z-UP. glTF says +Y is up; this file has its height on +Z, so the
#     importer's Y-up conversion lays it on its side. The fix rotates by
#     whichever quarter turn puts the 780mm extent back on Z.
#   * It FACES -Y. The doors and all three handles sit at the minimum-Y face
#     and the cable holes and backboard at the maximum, so the front is -Y.
#     The house convention is +Y, hence the half turn.
#   * Its footprint is off centre by 11mm in depth, so it is recentred.

CONSOLE_W = 1845.0
CONSOLE_D = 517.0
CONSOLE_H = 780.0

CONSOLE_ASSET = "modern_black_tv_console.glb"


def _bounds(objects):
    """World-space bounding box of `objects`, in metres."""
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3

    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], world[axis])
                hi[axis] = max(hi[axis], world[axis])

    return lo, hi


def build_tv_console(ctx: BuildContext) -> list[bpy.types.Object]:
    """Import the supplied console and stand it up in the house's frame."""
    path = Path(__file__).with_name("assets") / CONSOLE_ASSET
    if not path.exists():                       # pragma: no cover
        ctx.warn(f"missing console asset: {path}")
        return []

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [o for o in bpy.data.objects if o not in before]

    roots = [o for o in imported if o.parent is None]
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:                              # pragma: no cover
        ctx.warn("console asset imported no meshes")
        return []

    def rotate_roots(euler):
        # COMPOSED ONTO THE MATRIX, not written to `rotation_euler`. The glTF
        # importer leaves its objects in quaternion rotation mode, and in that
        # mode `rotation_euler` is a field Blender never reads -- assigning to
        # it is silently discarded, so the corrections below appear to run and
        # the model comes out exactly as it arrived. Location survived, which
        # made the failure look like a half-applied transform rather than an
        # ignored one.
        rotation = euler.to_matrix().to_4x4()
        for root in roots:
            root.matrix_world = rotation @ root.matrix_world
        bpy.context.view_layer.update()

    # -- Stand it up -------------------------------------------------------
    # Measured, not assumed: find the axis carrying the 780mm height and turn
    # it onto Z. A quarter turn about X is the only one needed for a file
    # that is Z-up read as Y-up, but this states the test rather than the
    # answer, so a differently-authored replacement file still lands upright.
    for _ in range(4):
        lo, hi = _bounds(meshes)
        if abs((hi[2] - lo[2]) * 1000.0 - CONSOLE_H) < 5.0:
            break
        rotate_roots(mathutils.Euler((math.radians(-90.0), 0.0, 0.0), "XYZ"))
    else:                                       # pragma: no cover
        ctx.warn("console asset: no orientation puts the height on Z")

    # Upright, not merely vertical. The height being on Z says nothing about
    # which end is the floor, and a console standing on its crown measures
    # exactly the same. The plinth is the bottom by name and by function.
    plinth = [o for o in meshes if "plinth" in o.name.lower()]
    if plinth:
        lo, hi = _bounds(meshes)
        plo, phi = _bounds(plinth)
        if (plo[2] + phi[2]) / 2.0 > (lo[2] + hi[2]) / 2.0:
            rotate_roots(mathutils.Euler((math.radians(180.0), 0.0, 0.0), "XYZ"))
    else:                                       # pragma: no cover
        ctx.warn("console asset: no plinth mesh, which way is up not verified")

    # -- Turn it to face +Y ------------------------------------------------
    # The handles are the front. If they are on the -Y side, give it a half
    # turn. Detected from the objects rather than hard-coded, because "which
    # way does this file face" is a property of the file.
    handles = [o for o in meshes if "handle" in o.name.lower()]
    if handles:
        lo, hi = _bounds(meshes)
        centre_y = (lo[1] + hi[1]) / 2.0
        hlo, hhi = _bounds(handles)
        if (hlo[1] + hhi[1]) / 2.0 < centre_y:
            rotate_roots(mathutils.Euler((0.0, 0.0, math.radians(180.0)), "XYZ"))
    else:                                       # pragma: no cover
        ctx.warn("console asset: no handle mesh, facing not verified")

    # -- Footprint centred on the origin, underside on the floor -----------
    lo, hi = _bounds(meshes)
    offset = mathutils.Vector((
        -(lo[0] + hi[0]) / 2.0,
        -(lo[1] + hi[1]) / 2.0,
        -lo[2],
    ))
    for root in roots:
        root.location += offset
    bpy.context.view_layer.update()

    lo, hi = _bounds(meshes)
    got = tuple(round((hi[i] - lo[i]) * 1000.0, 1) for i in range(3))
    want = (CONSOLE_W, CONSOLE_D, CONSOLE_H)
    if any(abs(g - w) > 5.0 for g, w in zip(got, want)):
        ctx.warn(f"console asset is {got}, the catalogue says {want}")

    # -- Bake the correction in and drop the empties -----------------------
    # The importer brings a parent Empty ('world') with the meshes under it,
    # and the builder recalculates normals on everything it is handed -- an
    # Empty has no mesh to recalculate, and hands back None. So the transform
    # is written into the vertices and the empties are thrown away, which
    # also means the exported product carries no rig for the browser to
    # traverse. Mesh data is transformed once even if two nodes share it.
    seen = set()
    for obj in meshes:
        world = obj.matrix_world.copy()
        if obj.data.name not in seen:
            obj.data.transform(world)
            seen.add(obj.data.name)
        obj.parent = None
        obj.matrix_world = mathutils.Matrix()

    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    # ONLY NOW take them out of the collection the importer chose. Doing this
    # any earlier is what broke the first attempt: an object linked to no
    # collection is not in the view layer, so `view_layer.update()` never
    # evaluates it, `matrix_world` stays stale, and every measurement above
    # reads the file exactly as it arrived -- the corrections appear to run
    # and change nothing. The builder links them where they belong.
    for obj in meshes:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)

    return meshes
