"""Regenerate the two manifests the walk-through depends on, without Blender.

    python blender/tools/export_navigation.py

`collision.json` and `tour.json` are both solved from `config/plan_3bed.py`
alone -- walls, openings and rooms, all of them plain values. Neither touches
`bpy`, so neither needs the 400MB of Blender or a two-minute geometry build to
regenerate. That matters more than the saved time: it means the route and the
collision model can be re-solved and re-verified in a second while tuning
them, and it makes them testable in CI on a machine with no Blender at all.

The full `blender/build.py` writes exactly the same two files, using the same
two functions, so this is a shortcut and never a second source of truth. Run
it after changing the plan or the furniture; run the full build when the
GEOMETRY has to change with it.
"""

from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BLENDER = os.path.dirname(_HERE)
_REPO = os.path.dirname(_BLENDER)
if _BLENDER not in sys.path:
    sys.path.insert(0, _BLENDER)

from houseluxe.config.plan_3bed import PLAN, TOUR_ORDER     # noqa: E402
from houseluxe.config.slots import check as check_slots     # noqa: E402
from houseluxe.config.slots_3bed import SLOTS               # noqa: E402
from houseluxe.export.collision_json import (               # noqa: E402
    report as collision_report,
    write_manifest as write_collision_manifest,
)
from houseluxe.export.doors_json import (                   # noqa: E402
    report as doors_report,
    write_manifest as write_doors_manifest,
)
from houseluxe.export.slots_json import (                   # noqa: E402
    report as slots_report,
    write_manifest as write_slots_manifest,
)
from houseluxe.export.tour_json import (                    # noqa: E402
    report as tour_report,
    verify as verify_tour,
    write_manifest as write_tour_manifest,
)

COLLISION_PATH = os.path.join(_REPO, "public", "models", "house", "collision.json")
TOUR_PATH = os.path.join(_REPO, "public", "models", "tour", "tour.json")
DOORS_PATH = os.path.join(_REPO, "public", "models", "house", "doors.json")
SLOTS_PATH = os.path.join(_REPO, "public", "models", "house", "slots.json")
CATALOG_PATH = os.path.join(_REPO, "public", "models", "products", "catalog.json")


def furniture_footprints(plan):
    """The placed products, as flat rectangles the route must go around.

    The route has to avoid the furniture as well as the walls, because the
    walk collides with both -- the living room's centre is inside the coffee
    table.

    READ FROM THE SHIPPED MANIFEST, not from the Python catalogue. The
    catalogue's shop modules build their models with `bpy` and so cannot be
    imported outside Blender, whereas `catalog.json` is the very file the app
    loads: taking the footprints from it means the route is solved against the
    furniture the visitor will actually meet. The full build passes the
    catalogue objects instead and reaches the same numbers.

    The manifest is in three.js metres and the grid works in plan
    millimetres, so the conversion of `Placement.as_dict` is undone here:
    three (x, y, z) came from plan (x, y) as (x/1000, z/1000, -y/1000).
    """
    try:
        with open(CATALOG_PATH, encoding="utf-8") as handle:
            catalog = json.load(handle)
    except FileNotFoundError:
        print(f"  ! no catalog.json at {CATALOG_PATH} -- solving walls only")
        return []

    sizes = {
        product["id"]: product.get("dimensions") or {}
        for shop in catalog.get("shops", [])
        for product in shop.get("products", [])
    }

    footprints = []
    for placement in catalog.get("houses", {}).get(plan.name, []):
        if placement.get("isFinish") or not placement.get("position"):
            continue
        x_m, _y_m, z_m = placement["position"]
        size = sizes.get(placement["product"], {})
        footprints.append({
            "x": x_m * 1000.0,
            "y": -z_m * 1000.0,
            "rotation": placement.get("rotationY", 0.0) or 0.0,
            "width": size.get("width", 0.0) or 0.0,
            "depth": size.get("depth", 0.0) or 0.0,
        })
    return footprints


def main() -> int:
    plan = PLAN
    furniture = furniture_footprints(plan)

    collision = write_collision_manifest(plan, COLLISION_PATH)
    print(collision_report(collision, COLLISION_PATH))

    doors = write_doors_manifest(plan, DOORS_PATH)
    print(doors_report(doors, DOORS_PATH))

    # The advertising inventory. A slot has to be able to exist EMPTY --
    # that is what a shop buys -- so these are declared in the plan and
    # never derived from what happens to be standing there.
    slot_problems = check_slots(SLOTS, {r.name: r for r in plan.rooms})
    slots = write_slots_manifest(plan, SLOTS, SLOTS_PATH)
    print(slots_report(slots, slot_problems, SLOTS_PATH))

    route = write_tour_manifest(
        plan, TOUR_PATH, order=TOUR_ORDER, furniture=furniture
    )
    problems = verify_tour(plan, route, furniture)
    print(tour_report(route, problems))
    print(f"  {TOUR_PATH}")

    # A route that does not verify is one the tour will walk into a wall on,
    # so it is a failure and not a warning.
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
