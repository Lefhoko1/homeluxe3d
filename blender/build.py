"""Build entrypoint.

Run inside Blender:

    blender --background --python blender/build.py

or from a running Blender (this is what the MCP bridge does):

    import sys; sys.path.append(r"<repo>/blender")
    import build; build.main()

The build is generative and idempotent -- it wipes the scene first, so running
it twice gives the same result as running it once.
"""

from __future__ import annotations

import os
import sys

# Allow `import houseluxe` when Blender runs this file directly.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import bpy  # noqa: E402

from houseluxe.catalog import CATALOG  # noqa: E402
from houseluxe.catalog.staging import stage_house  # noqa: E402
from houseluxe.components import default_components  # noqa: E402
from houseluxe.components.character import CharacterComponent  # noqa: E402
from houseluxe.components.products import product_components  # noqa: E402
from houseluxe.components.site import site_components  # noqa: E402
from houseluxe.config.plan_3bed import PLAN, TOUR_ORDER  # noqa: E402
from houseluxe.config.site_3bed import SITE  # noqa: E402
from houseluxe.core.scene import SceneBuilder, purge_scene  # noqa: E402
from houseluxe.export.catalog_json import (  # noqa: E402
    report as catalog_report,
    write_manifest,
)
from houseluxe.export.gltf import GLBExporter, report as export_report  # noqa: E402
from houseluxe.export.planting_json import (  # noqa: E402
    report as planting_report,
    write_manifest as write_planting_manifest,
)
from houseluxe.export.tour_json import (  # noqa: E402
    report as tour_report,
    verify as verify_tour,
    write_manifest as write_tour_manifest,
)
from houseluxe.materials.library import MaterialLibrary  # noqa: E402

REPO_ROOT = os.path.dirname(_HERE)
MODEL_DIR = os.path.join(REPO_ROOT, "public", "models", "house")
SITE_MODEL_DIR = os.path.join(REPO_ROOT, "public", "models", "site")
PRODUCT_MODEL_DIR = os.path.join(REPO_ROOT, "public", "models", "products")
TOUR_MODEL_DIR = os.path.join(REPO_ROOT, "public", "models", "tour")
CATALOG_PATH = os.path.join(PRODUCT_MODEL_DIR, "catalog.json")
TREES_PATH = os.path.join(SITE_MODEL_DIR, "trees.json")
TOUR_PATH = os.path.join(TOUR_MODEL_DIR, "tour.json")
BLEND_PATH = os.path.join(_HERE, "house_3bed.blend")


def main(
    export: bool = True,
    save: bool = True,
    site: bool = True,
    products: bool = True,
) -> int:
    plan = PLAN
    site_spec = SITE if site else None

    print(f"\nBuilding '{plan.name}'")
    print("=" * 60)

    problems = plan.validate()
    if problems:
        print("Plan validation FAILED:")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print(f"  plan validated: {len(plan.walls)} walls, {len(plan.rooms)} rooms")
    print(f"  declared living area: {plan.living_area():.1f} m2")

    if site_spec is not None:
        site_problems = site_spec.validate()
        if site_problems:
            print("Site validation FAILED:")
            for problem in site_problems:
                print(f"  ! {problem}")
            return 1
        print(
            f"  site validated: {site_spec.width / 1000:.0f}m x "
            f"{site_spec.depth / 1000:.0f}m = {site_spec.area:.0f} m2, "
            f"{len(site_spec.plants)} plants"
        )

    if products:
        # Pass the plan's room types so scoping is checked: a product
        # placed in a room it is not scoped for fails the build.
        room_types = {r.name: r.room_type for r in plan.rooms}
        catalog_problems = CATALOG.validate(room_types)
        if catalog_problems:
            print("Catalogue validation FAILED:")
            for problem in catalog_problems:
                print(f"  ! {problem}")
            return 1
        print(
            f"  catalog validated: {len(CATALOG.shops)} shop(s), "
            f"{len(CATALOG.products)} product(s), "
            f"{len(CATALOG.placements)} placement(s)"
        )
        inactive = [p for p in CATALOG.products if not p.is_active]
        if inactive:
            print(f"  {len(inactive)} product(s) inactive "
                  f"(disabled or promotion ended): "
                  f"{', '.join(p.qualified_id for p in inactive)}")

    purge_scene()

    materials = MaterialLibrary()
    builder = SceneBuilder(plan, materials, site=site_spec)

    # Two passes into one scene. The house and the yard are separate concerns
    # with separate output directories, but they share a coordinate system --
    # the yard is built around the house where it already stands.
    house_results = builder.build(default_components())
    site_results = builder.build(site_components()) if site_spec else []

    # Products build at the origin, on top of each other. That is fine --
    # each is exported to its own file, and the app positions them from the
    # catalogue manifest.
    product_results = (
        builder.build(product_components(CATALOG.products)) if products else []
    )

    # The tour character. Built at the origin like a product; the app drives
    # it around from there.
    tour_results = builder.build([CharacterComponent()])

    print(builder.report())

    notes = list(plan.notes) + (list(site_spec.notes) if site_spec else [])
    if notes:
        print("\nPlan notes")
        print("-" * 60)
        for note in notes:
            print(f"  * {note}")

    if export:
        batches = [("house", MODEL_DIR, house_results)]
        if site_results:
            batches.append(("site", SITE_MODEL_DIR, site_results))
        if product_results:
            batches.append(("products", PRODUCT_MODEL_DIR, product_results))
        if tour_results:
            batches.append(("tour", TOUR_MODEL_DIR, tour_results))

        for label, directory, results in batches:
            exporter = GLBExporter(directory)
            exports = exporter.export_all(results)
            print(export_report(exports))
            print(f"\n  {label} output: {directory}")
            failures = [e for e in exports if not e.ok]
            if failures:
                print(f"  {len(failures)} export(s) failed")

        if products:
            manifest = write_manifest(CATALOG, CATALOG_PATH)
            print(catalog_report(manifest, CATALOG_PATH))

        # Trees are placed from a manifest rather than built as geometry --
        # the app instances one real tree model at these points. See
        # export/planting_json.py.
        if site_spec is not None:
            trees = write_planting_manifest(site_spec, TREES_PATH)
            print(planting_report(trees))

        # The guided walk-through, solved over the plan's own walls and
        # doorways so it cannot route through one. See export/tour_json.py.
        # The route must avoid the furniture as well as the walls: the walk
        # collides with both, and the living room's centre is inside the
        # coffee table.
        furniture = [
            {
                "x": pl.x, "y": pl.y, "rotation": pl.rotation,
                "width": getattr(product.dimensions, "width", 0.0) if product else 0.0,
                "depth": getattr(product.dimensions, "depth", 0.0) if product else 0.0,
            }
            for pl in CATALOG.for_house(plan.name)
            if not pl.is_finish
            for product in [CATALOG.product(pl.product_id)]
        ]
        route = write_tour_manifest(
            plan, TOUR_PATH, order=TOUR_ORDER, furniture=furniture
        )
        # The walk trusts this route instead of re-testing the walls as it
        # goes, so the route has to be proved walkable here. See
        # export/tour_json.verify.
        print(tour_report(route, verify_tour(plan, route, furniture)))

    # Stage the furniture into the scene AFTER exporting, so the saved .blend
    # shows a furnished house while the exported models stay at the origin.
    if product_results:
        built = {
            f"{r.category.replace('/', '.')}": r.objects for r in product_results
        }
        staged, staging_warnings = stage_house(CATALOG, plan.name, built)
        print(f"\n  staged {staged} product(s) into '{plan.name}'")
        for warning in staging_warnings:
            print(f"  ! {warning}")

    if save:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
        print(f"  saved:  {BLEND_PATH}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
