"""Where the trees stand.

The yard's trees used to be geometry: a tapered trunk and seven ellipsoids,
built by `components/site/planting.py` and baked into `yard_planting.glb`.
That was the right call while a tree had to be generated from nothing. It
stopped being the right call the moment there was a real tree to place.

So trees follow the same division as products: **the geometry is an asset,
the position is data.** One `tree.glb` is loaded once and instanced at the
points listed here, which means re-planting the garden is an edit to
`config/site_3bed.py` and a re-run of this writer -- no re-export, no
re-modelling, and the tree can be swapped for a better one without touching
the layout.

Coordinates are converted here rather than in the browser, matching what
`catalog.json` does, so the app never does axis maths:

    Blender (x, y, z) millimetres  ->  three.js (x, z, -y) metres

`height` is the height the tree should be IN THE SCENE. The model's own
height is not recorded: the app measures the GLB it actually loaded and
scales to fit. Bake the model's height in here and replacing the asset
silently resizes every tree in the garden.
"""

from __future__ import annotations

import json
import os

#: Where the app fetches the tree from.
TREE_MODEL_URL = "/models/site/tree.glb"


def _yaw(seed: int) -> float:
    """A repeatable heading per tree, in degrees.

    Eight copies of one model all facing the same way is the giveaway that
    they are one model. Derived from the plant's own seed, so the garden looks
    the same on every build -- randomness that changes between builds makes
    diffs meaningless.
    """
    value = (seed * 2654435761 + 40503) & 0x7FFFFFFF
    return (value % 3600) / 10.0


def build_manifest(site) -> dict:
    """Placement manifest for every tree on a site."""
    trees = []

    for plant in site.plants:
        if plant.kind != "tree":
            continue

        # The terrain, not a nominal level -- the same call every other
        # component makes, so a tree cannot float above its own ground.
        ground = site.elevation(plant.x, plant.y)

        trees.append({
            "seed": plant.seed,
            "position": [
                plant.x / 1000.0,
                ground / 1000.0,
                -plant.y / 1000.0,
            ],
            "height": plant.height / 1000.0,
            "spread": plant.spread / 1000.0,
            "rotation": _yaw(plant.seed),
        })

    return {
        "version": 1,
        "model": TREE_MODEL_URL,
        "trees": trees,
    }


def write_manifest(site, path: str) -> dict:
    """Write the manifest and return it."""
    manifest = build_manifest(site)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict) -> str:
    trees = manifest.get("trees", [])
    if not trees:
        return "planting: no trees"
    heights = [t["height"] for t in trees]
    return (
        f"planting: {len(trees)} tree(s), "
        f"{min(heights):.1f}m to {max(heights):.1f}m tall"
    )
