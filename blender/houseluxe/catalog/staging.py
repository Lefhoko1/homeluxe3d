"""Stage placed products into the Blender scene.

Products are BUILT at the origin so each exports as a reusable model, which
leaves them stacked on top of each other in the viewport. That is correct for
export and useless for looking at.

This runs AFTER export and moves each product into its placement, so the saved
.blend shows a furnished house and renders make sense. Because it runs after,
the exported models are unaffected -- position stays data, exactly as the app
consumes it.

A product placed more than once is duplicated, sharing mesh data, so ten
dining chairs cost one mesh.
"""

from __future__ import annotations

import math

try:
    import bpy
except ModuleNotFoundError:                 # pragma: no cover
    # THE DATA HALF OF THE CATALOGUE HAS TO BE READABLE WITHOUT BLENDER.
    # `product.py` says so already and keeps bpy behind TYPE_CHECKING for
    # exactly this reason: the plain-Python tools that solve the route and the
    # collision model read the placements, and a module-level `import bpy`
    # three files away put the whole catalogue out of their reach.
    #
    # The builders below genuinely need Blender and will say so loudly if they
    # are called without it. Everything else in this module -- the dimensions,
    # the products, where they stand -- is plain data.
    bpy = None

from ..core.units import m
from .product import Catalog


def stage_house(
    catalog: Catalog,
    house: str,
    product_objects: dict[str, list[bpy.types.Object]],
) -> tuple[int, list[str]]:
    """Move built products into their placements for `house`.

    `product_objects` maps qualified product id -> the objects built for it.
    Returns (placed count, warnings).
    """
    warnings: list[str] = []
    placed = 0

    for placement in catalog.for_house(house):
        originals = product_objects.get(placement.product_id)
        if not originals:
            warnings.append(
                f"placement in {placement.room} has no built geometry for "
                f"{placement.product_id!r}"
            )
            continue

        instances = _instances_for(placement, originals, placed_before=placed)

        for obj in instances:
            # Each product object was built with its origin at the world
            # origin, which is also the product's footprint centre -- so
            # object-level transforms place it correctly with no offset maths.
            obj.rotation_euler[2] = math.radians(placement.rotation)
            obj.location = (m(placement.x), m(placement.y), m(placement.z))

        placed += 1

    return placed, warnings


def _instances_for(placement, originals, placed_before: int):
    """The objects to transform for this placement.

    The first placement of a product reuses the originals; any further
    placement gets linked duplicates that share mesh data.
    """
    seen_key = f"_staged_{placement.product_id}"

    if not originals[0].get(seen_key):
        for obj in originals:
            obj[seen_key] = True
        return originals

    copies = []
    for obj in originals:
        copy = obj.copy()          # links the same mesh data
        for collection in obj.users_collection:
            collection.objects.link(copy)
        copies.append(copy)
    return copies
