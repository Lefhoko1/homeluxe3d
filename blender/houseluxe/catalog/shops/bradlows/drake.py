"""Bradlows -- the Drake three-piece lounge suite.

NOT MODELLED HERE. The suite arrived as a generator script of its own, which
writes three GLBs; `blender/tools/prepare_drake_suite.py` runs it, brings the
result down to a weight a browser can open, and stands each piece the way
this catalogue expects. What is left for these builders to do is import the
prepared file, which is why they are three lines of work and a page of
explanation.

WHY IMPORT RATHER THAN RE-MODEL. A product in the catalogue is seen by the
ROUTE SOLVER: `tour_json` paints the walls, the joinery and the catalogue's
own placements and solves a path clear of all of them. Anything inserted
straight into the database is invisible to it, which is how a 3.37m kitchen
run came to be standing across a 2.4m doorway with every test still passing.
Re-modelling the suite from the same photographs would also mean maintaining
a second, worse copy of something that already exists.

WHAT THE PREPARATION DID, and why the numbers below are not the ones in the
supplied README:

    piece                    supplied            prepared
    three-seater      99,972 tris, 5.0MB    9,161 tris, 379K
    two-seater        104,328 tris, 5.2MB   9,788 tris, 418K
    recliner          62,824 tris, 4.4MB    9,151 tris, 372K

267,124 triangles and 14.6MB, against 19,596 triangles and 396KB for every
other product in this house put together. None of it was detail anyone could
see: the shapes are rounded boxes carrying two levels of subdivision, and the
three 1024px leather maps were embedded separately in each of the three
files. The dimensions here are measured off the prepared models rather than
taken from the README, which gives the designer's intended width and depth
and no height at all.
"""

from __future__ import annotations

from pathlib import Path

try:
    import bpy
    import mathutils
except ModuleNotFoundError:                 # pragma: no cover
    # The data half of the catalogue is read by plain-Python tools that have
    # no Blender, so bpy must not be required at import time. See lounge.py.
    bpy = None
    mathutils = None

from ....core.component import BuildContext

#: Measured from the prepared GLBs: width, depth, height in millimetres.
THREE_SEATER = (2229.0, 816.0, 1026.0)
TWO_SEATER = (1840.0, 830.0, 1025.0)
RECLINER = (983.0, 908.0, 1055.0)

#: One code for the three-piece suite is all the package supplies. The pieces
#: are not given their own, and a stock code is not something to invent.
SUITE_SKU = "714280"


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


def _import_piece(ctx: BuildContext, filename: str, expected):
    """Import one prepared piece and hand its meshes to the builder.

    The file is already in the catalogue's convention -- footprint centred on
    the origin, underside at z = 0, facing +Y -- because the preparation tool
    put it there. This still MEASURES what it imported: a silent disagreement
    between the tool and the catalogue would put a sofa through a wall, and
    the check costs nothing.
    """
    path = Path(__file__).with_name("assets") / filename
    if not path.exists():                       # pragma: no cover
        ctx.warn(f"missing Drake asset: {path}")
        return []

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]

    if not meshes:                              # pragma: no cover
        ctx.warn(f"{filename} imported no meshes")
        return []

    lo, hi = _bounds(meshes)
    got = tuple(round((hi[i] - lo[i]) * 1000.0, 1) for i in range(3))
    if any(abs(g - w) > 5.0 for g, w in zip(got, expected)):
        ctx.warn(f"{filename} is {got}, the catalogue says {expected}")
    if abs(lo[2]) > 0.005:
        ctx.warn(f"{filename} does not sit on the floor: z starts at {lo[2]:.3f}")

    # Bake the import's transforms into the vertices and drop the empties.
    # The builder recalculates normals on everything it is handed, and an
    # Empty has no mesh to recalculate -- it hands back None and the build
    # stops. Mesh data is transformed once even where two nodes share it.
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

    # ONLY NOW take them out of the collection the importer chose. An object
    # linked to no collection is not in the view layer, so `view_layer.update`
    # never evaluates it and every measurement above would read the file
    # exactly as it arrived -- the checks appear to run and test nothing.
    for obj in meshes:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)

    return meshes


def build_drake_three_seater(ctx: BuildContext) -> list:
    """2229mm three-seater, beige leather, individual reclining sections."""
    return _import_piece(ctx, "drake-3-seater.glb", THREE_SEATER)


def build_drake_two_seater(ctx: BuildContext) -> list:
    """1840mm two-seater with a storage console and two cup holders."""
    return _import_piece(ctx, "drake-2-seater-console.glb", TWO_SEATER)


def build_drake_recliner(ctx: BuildContext) -> list:
    """983mm single recliner, with a separate back and footrest."""
    return _import_piece(ctx, "drake-recliner.glb", RECLINER)
