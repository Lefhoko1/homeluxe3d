"""Which doors open, and about what.

A door in a GLB is a slab of geometry like any other. To swing one the browser
has to know three things the model cannot tell it: which object is the leaf,
where its hinge axis is, and how wide it is. This writes them down.

DERIVED FROM THE PLAN, NOT MEASURED FROM THE MESH. The axis is the s0 end of
the opening set out by the lining -- exactly the arithmetic
`openings._hang` does when it sets the leaf's origin. Two programs computing
the same number from the same source cannot drift; a browser measuring a
bounding box and guessing which end the hinges are on drifts the first time a
door is made wider.

WHICH WAY A DOOR SWINGS IS DECIDED AT RUN TIME, and is deliberately not here.
A real door is hung to open one way, and that decision is made on site and
recorded nowhere in this plan. Rather than invent it per door -- and get it
wrong for whoever is walking through -- the browser opens each door AWAY from
whoever is approaching it. Nobody is ever met by a door swinging into their
face, and no visitor has ever noticed a door that opens both ways.

Doorways carry no leaf and are not listed: there is nothing to open. Sliding
doors are not listed either -- they slide rather than swing, and nothing here
would describe them correctly.
"""

from __future__ import annotations

import json
import os

from ..config.plan import OpeningKind

#: Openings with a leaf on hinges.
HINGED = {OpeningKind.DOOR_INTERNAL, OpeningKind.DOOR_EXTERNAL}

from ..config.joinery import AXIS_OFFSET, FRAME_FACE, LINING_FACE


def _face_for(kind: OpeningKind) -> float:
    return FRAME_FACE if kind is OpeningKind.DOOR_EXTERNAL else LINING_FACE


def build_manifest(plan) -> dict:
    doors = []

    for wall in plan.walls:
        (sx, sy), (ex, ey) = wall.start, wall.end
        length = ((ex - sx) ** 2 + (ey - sy) ** 2) ** 0.5
        if length <= 0:
            continue

        # The wall's own frame, same as core.wallmath.WallFrame.
        ux, uy = (ex - sx) / length, (ey - sy) / length
        px, py = -uy, ux

        for opening in wall.openings:
            if opening.kind not in HINGED:
                continue

            face = _face_for(opening.kind)
            half = opening.width / 2.0
            s0 = opening.offset - half
            s1 = opening.offset + half

            axis_s = s0 + face
            leaf_width = (s1 - face) - axis_s

            # World XY of the hinge axis, offset across the wall exactly as
            # `_hang` offsets it.
            ax = sx + ux * axis_s + px * AXIS_OFFSET
            ay = sy + uy * axis_s + py * AXIS_OFFSET

            label = opening.name or f"{wall.name}.{int(opening.offset)}"

            doors.append({
                # The object names in doors.glb. `leaf` swings; `hinges` are
                # the plates screwed to it and swing with it.
                "leaf": f"doors.{label}.leaf",
                "hinge_prefix": f"doors.{label}.hinge",
                "label": label,
                "kind": opening.kind.value,
                "exterior": bool(wall.exterior),
                # three.js house-local metres, converted here as everything
                # else is so the browser never does axis maths.
                "hinge": [round(ax / 1000.0, 4), round(-ay / 1000.0, 4)],
                # Unit vector along the closed leaf, from the hinge towards the
                # latch. The browser needs it to know where the leaf sweeps.
                "along": [round(ux, 6), round(-uy, 6)],
                "width_m": round(leaf_width / 1000.0, 4),
                "height_m": round((opening.head - face) / 1000.0, 4),
            })

    return {
        "version": 1,
        "scene": plan.name,
        "doors": doors,
    }


def write_manifest(plan, path: str) -> dict:
    manifest = build_manifest(plan)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict, path: str = "") -> str:
    doors = manifest.get("doors", [])
    external = sum(1 for d in doors if d["kind"] == "door_external")
    line = (
        f"doors: {len(doors)} hinged leaf/leaves "
        f"({external} external, {len(doors) - external} internal)"
    )
    if path:
        line += f"\n  {path}"
    return line
