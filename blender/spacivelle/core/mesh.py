"""Low-level mesh construction helpers.

This module knows about vertices and faces. It knows nothing about houses.
Components describe *what* they want in millimetres; these functions turn that
into Blender mesh data. Keeping the primitive layer ignorant of architecture is
what lets the component layer stay readable.
"""

from __future__ import annotations

import math

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ModuleNotFoundError:                 # pragma: no cover
    # THE DATA HALF OF THE CATALOGUE HAS TO BE READABLE WITHOUT BLENDER.
    # `catalog/product.py` says so already and keeps bpy behind TYPE_CHECKING
    # for exactly that reason: the plain-Python tools that solve the route and
    # the collision model read the placements, and a module-level Blender
    # import anywhere in the chain puts the whole catalogue out of their reach.
    # It did -- `export_navigation.py` had to read the SHIPPED catalog.json
    # instead of the catalogue, so moving a sofa in the source and re-solving
    # the route without opening Blender quietly used the old position.
    #
    # Every function below needs Blender and will fail loudly without it.
    # Being IMPORTABLE costs nothing.
    bpy = bmesh = Vector = None

from .units import m


def new_object(name: str, mesh: bpy.types.Mesh) -> bpy.types.Object:
    """Wrap mesh data in an object, without linking it to a collection."""
    return bpy.data.objects.new(name, mesh)


def mesh_from_pydata(
    name: str,
    verts: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> bpy.types.Object:
    """Build an object from raw vertex/face lists given in metres."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = new_object(name, mesh)
    return obj


def box(
    name: str,
    x0: float,
    y0: float,
    z0: float,
    x1: float,
    y1: float,
    z1: float,
) -> bpy.types.Object:
    """Axis-aligned box from two opposite corners, in MILLIMETRES.

    Corners may be given in any order; they are normalised here so callers can
    pass "start" and "end" without worrying about direction.
    """
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))

    ax0, ay0, az0 = m(x0), m(y0), m(z0)
    ax1, ay1, az1 = m(x1), m(y1), m(z1)

    verts = [
        (ax0, ay0, az0), (ax1, ay0, az0), (ax1, ay1, az0), (ax0, ay1, az0),
        (ax0, ay0, az1), (ax1, ay0, az1), (ax1, ay1, az1), (ax0, ay1, az1),
    ]
    faces = [
        (0, 1, 2, 3),  # bottom
        (7, 6, 5, 4),  # top
        (0, 4, 5, 1),  # -Y
        (1, 5, 6, 2),  # +X
        (2, 6, 7, 3),  # +Y
        (3, 7, 4, 0),  # -X
    ]
    return mesh_from_pydata(name, verts, faces)


def prism(
    name: str,
    polygon_mm: list[tuple[float, float]],
    z0: float,
    z1: float,
) -> bpy.types.Object:
    """Extrude a closed 2D polygon (millimetres, CCW) between two heights."""
    az0, az1 = m(z0), m(z1)
    n = len(polygon_mm)

    verts = [(m(x), m(y), az0) for x, y in polygon_mm]
    verts += [(m(x), m(y), az1) for x, y in polygon_mm]

    faces: list[tuple[int, ...]] = []
    faces.append(tuple(range(n - 1, -1, -1)))      # bottom, reversed for normal
    faces.append(tuple(range(n, 2 * n)))           # top
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))         # side quad

    return mesh_from_pydata(name, verts, faces)


def rounded_box(
    name: str,
    x0: float,
    y0: float,
    z0: float,
    x1: float,
    y1: float,
    z1: float,
    radius: float = 40.0,
    segments: int = 3,
) -> bpy.types.Object:
    """Box with bevelled edges, in MILLIMETRES.

    Upholstery is the reason this exists. A sofa built from hard-edged boxes
    reads as cardboard however good the material is, because real cushions
    catch a highlight along every edge. Three bevel segments is enough to
    produce that highlight and cheap enough to use on every cushion.

    The bevel is clamped to just under half the smallest dimension, so a thin
    cushion cannot collapse into itself.
    """
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))

    smallest = min(x1 - x0, y1 - y0, z1 - z0)
    radius = max(0.0, min(radius, smallest * 0.49))

    obj = box(name, x0, y0, z0, x1, y1, z1)
    if radius <= 0.0:
        return obj

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bevel(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        offset=m(radius),
        segments=segments,
        profile=0.5,
        affect="EDGES",
    )
    bm.to_mesh(obj.data)
    bm.free()

    obj.data.update()
    return obj


def cylinder(
    name: str,
    x_mm: float,
    y_mm: float,
    z0_mm: float,
    z1_mm: float,
    radius_mm: float,
    radius_top_mm: float | None = None,
    segments: int = 12,
) -> bpy.types.Object:
    """Vertical cylinder or tapered cone, positioned in MILLIMETRES.

    Tree trunks and fence posts are the only round things on the site, and
    both taper slightly, hence the separate top radius.
    """
    bm = bmesh.new()
    top = radius_top_mm if radius_top_mm is not None else radius_mm
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=m(radius_mm),
        radius2=m(top),
        depth=m(z1_mm - z0_mm),
    )
    # create_cone builds around the origin; move it into place.
    bmesh.ops.translate(
        bm,
        verts=bm.verts,
        vec=Vector((m(x_mm), m(y_mm), m((z0_mm + z1_mm) / 2.0))),
    )

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_object(name, mesh)


def sphere(
    name: str,
    x_mm: float,
    y_mm: float,
    z_mm: float,
    radius_mm: float,
    subdivisions: int = 2,
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> bpy.types.Object:
    """Icosphere, positioned in MILLIMETRES.

    `scale` squashes it into an ellipsoid, which is what stops a row of
    shrubs from reading as a row of identical billiard balls.
    """
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=m(radius_mm))

    if scale != (1.0, 1.0, 1.0):
        bmesh.ops.scale(bm, verts=bm.verts, vec=Vector(scale))

    bmesh.ops.translate(
        bm, verts=bm.verts, vec=Vector((m(x_mm), m(y_mm), m(z_mm)))
    )

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_object(name, mesh)


def sloped_box(
    name: str,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    z_bottom: float,
    z_top_y0: float,
    z_top_y1: float,
) -> bpy.types.Object:
    """Box with a top face that ramps along Y. All values in MILLIMETRES.

    Written for the pool floor, which falls from the shallow end to the deep
    end. A flat floor would be simpler but reads as a plunge pool.
    """
    ax0, ay0, ax1, ay1 = m(x0), m(y0), m(x1), m(y1)
    zb, t0, t1 = m(z_bottom), m(z_top_y0), m(z_top_y1)

    verts = [
        (ax0, ay0, zb), (ax1, ay0, zb), (ax1, ay1, zb), (ax0, ay1, zb),
        (ax0, ay0, t0), (ax1, ay0, t0), (ax1, ay1, t1), (ax0, ay1, t1),
    ]
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    return mesh_from_pydata(name, verts, faces)


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    """Merge several objects into one, returning the survivor.

    Used inside a single component (e.g. the many boxes that make up one
    window frame) so the exported GLB has one clean mesh per real-world part.
    """
    if not objects:
        raise ValueError(f"join({name!r}) got no objects")
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]

    bm = bmesh.new()
    for obj in objects:
        bm.from_mesh(obj.data)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    merged = new_object(name, mesh)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return merged


def shade_flat(obj: bpy.types.Object) -> None:
    """Architectural geometry reads better faceted than smoothed."""
    for poly in obj.data.polygons:
        poly.use_smooth = False


def recalc_normals(obj: bpy.types.Object) -> None:
    """Make all normals point outward. Cheap insurance before export."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def uv_project_box(obj: bpy.types.Object, texel_per_m: float = 1.0) -> None:
    """Give the mesh a simple planar-per-face UV set.

    Not a substitute for a proper unwrap, but it means brick and metal
    textures land at a sane scale in three.js without a manual UV pass.
    """
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data

    for poly in mesh.polygons:
        normal = poly.normal
        ax, ay, az = abs(normal.x), abs(normal.y), abs(normal.z)
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, co.y      # roughly horizontal face
            elif ax >= ay:
                u, v = co.y, co.z      # faces +/-X
            else:
                u, v = co.x, co.z      # faces +/-Y
            uv_layer[loop_index].uv = (u * texel_per_m, v * texel_per_m)


def solidify(obj: bpy.types.Object, thickness_mm: float, offset: float = -1.0) -> None:
    """Apply a Solidify modifier and bake it in.

    Roof planes are authored as single surfaces because that is how a roof is
    actually described (pitch + eave line); thickness is a finishing step.
    """
    modifier = obj.modifiers.new(name="Solidify", type="SOLIDIFY")
    modifier.thickness = m(thickness_mm)
    modifier.offset = offset

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    baked = bpy.data.meshes.new_from_object(evaluated)

    obj.modifiers.clear()
    old = obj.data
    obj.data = baked
    bpy.data.meshes.remove(old)


def rotate_z(obj: bpy.types.Object, degrees: float) -> None:
    """Rotate about the object's own Z origin."""
    obj.rotation_euler[2] = math.radians(degrees)


def set_origin(obj: bpy.types.Object, x_mm: float, y_mm: float, z_mm: float) -> None:
    """Move mesh data so the object origin sits at the given world point.

    Components build in world millimetres for legibility; this recentres the
    result so the exported GLB has a useful pivot for three.js.
    """
    offset = Vector((m(x_mm), m(y_mm), m(z_mm)))
    for vert in obj.data.vertices:
        vert.co -= offset
    obj.location = offset
