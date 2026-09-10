"""Make the Drake lounge suite loadable, and stand it the right way up.

The suite arrives as a generator script rather than a model: run it and it
writes three GLBs. They are correct and they are enormous -- 267,000
triangles and 14.6MB across the three, against 19,596 triangles and 396KB
for EVERY product in the house put together. Dropped in as they are they
would be thirty-seven times the download of the entire existing catalogue,
to replace three sofas weighing 107KB.

None of that weight is detail you can see. The shapes are rounded boxes
carrying two levels of subdivision, and the three 1024px leather maps are
embedded separately in each of the three files, so the same 2.5MB of texture
is downloaded three times over.

WHAT THIS DOES, once, so the repository stores something a browser can open:

  1. Collapses the subdivision back down. The silhouettes are convex boxes,
     which is the case decimation handles best.
  2. Halves the leather maps to 512px. A sofa is looked at across a room.
  3. Turns each piece to face +Y and sets it on the floor, which is the
     convention every other product in the catalogue follows. As exported
     they face -Y and float 270mm above their own origin.

Run from the repo root:

    "…/blender.exe" --background --python blender/tools/prepare_drake_suite.py \
        -- <path to the Drake package> <output dir>

The originals are not kept. The generator that made them is: see the assets
folder, which is the actual source and is 16KB.
"""

import math
import os
import sys

import bpy
from mathutils import Euler, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
PACKAGE = ARGS[0]
OUT_DIR = ARGS[1]

#: About what a detailed sofa should cost. The Sandton three-seater it
#: replaces is 2,744; this leaves the Drake visibly richer without being in a
#: different league from everything standing next to it.
TARGET_TRIS = 9000

#: Leather maps, halved. 1024 on a 2.2m sofa is a texel per two millimetres.
TEXTURE_PX = 512

PIECES = [
    ("Drake_3Seater.glb", "drake-3-seater.glb"),
    ("Drake_2Seater_Console.glb", "drake-2-seater-console.glb"),
    ("Drake_Recliner.glb", "drake-recliner.glb"),
]


def bounds(objects):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], world[axis])
                hi[axis] = max(hi[axis], world[axis])
    return lo, hi


def triangles(meshes):
    total = 0
    for obj in meshes:
        mesh = obj.data
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
    return total


for source_name, out_name in PIECES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(
        filepath=os.path.join(PACKAGE, "output", source_name)
    )

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    roots = [o for o in bpy.data.objects if o.parent is None]
    before = triangles(meshes)

    # -- 1. Collapse the subdivision -------------------------------------
    ratio = min(1.0, TARGET_TRIS / float(before))
    for obj in meshes:
        # Tiny parts -- a hinge, a cup holder rim -- are already cheap and
        # collapse into rubbish. Leave anything that is not a big smooth
        # slab alone.
        mesh = obj.data
        mesh.calc_loop_triangles()
        if len(mesh.loop_triangles) < 400:
            continue
        mod = obj.modifiers.new("collapse", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

    after = triangles(meshes)

    # -- 2. Halve the leather --------------------------------------------
    for image in bpy.data.images:
        if image.size[0] > TEXTURE_PX or image.size[1] > TEXTURE_PX:
            image.scale(TEXTURE_PX, TEXTURE_PX)

    # -- 3. Face +Y, and stand on the floor ------------------------------
    # The back cushions sit at -Z in the exported file, so the front faces
    # +Z, which is a half turn from the house's convention. Measured after
    # the turn rather than assumed.
    # COMPOSED ONTO THE MATRIX rather than written to `rotation_euler`: the
    # glTF importer leaves its objects in quaternion rotation mode, where
    # `rotation_euler` is a field Blender never reads, so assigning to it is
    # discarded in silence.
    rotation = Euler((0.0, 0.0, math.radians(180.0)), "XYZ").to_matrix().to_4x4()
    for root in roots:
        root.matrix_world = rotation @ root.matrix_world
    bpy.context.view_layer.update()

    lo, hi = bounds(meshes)
    offset = Vector((-(lo[0] + hi[0]) / 2.0, -(lo[1] + hi[1]) / 2.0, -lo[2]))
    for root in roots:
        root.location += offset
    bpy.context.view_layer.update()

    lo, hi = bounds(meshes)
    size = tuple(round((hi[i] - lo[i]) * 1000.0, 1) for i in range(3))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, out_name),
        export_format="GLB",
        # JPEG, not PNG. The leather maps are photographic and lossless is
        # paying for exactness nobody can see at 512px across a room; PNG
        # kept the three pieces at 1.27MB each. The normal map goes with
        # them -- a normal map does dislike block artefacts, but this one
        # describes grain, not shape, and the alternative is a megabyte.
        export_image_format="JPEG",
        export_jpeg_quality=82,
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )

    written = os.path.getsize(os.path.join(OUT_DIR, out_name))
    print(
        f"PREPARED {out_name}: {before:,} -> {after:,} tris, "
        f"{written / 1024:.0f}K, {size[0]:.0f} x {size[1]:.0f} x {size[2]:.0f}mm "
        f"(w x d x h in Blender axes)"
    )
