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

Doorways carry no leaf and are not listed: there is nothing to open.

SLIDING DOORS ARE LISTED TOO, with a `motion` of "slide" instead of "swing".
A slider has no hinge and no angle -- it has a travel, along the wall, of one
sash width -- so it carries a direction and a distance where a hinged door
carries an axis. Same trigger, same manifest, different verb.

HOW THE BROWSER FINDS THE MOVING PARTS. Not by name: three.js strips '.' from
every node name as it loads a GLB, so `doors.master.door.leaf` arrives as
`doorsmasterdoorleaf` and a lookup by the recorded name finds nothing. The
objects carry the door's label as a custom property instead, which survives
as glTF `extras` and lands in `userData` untouched -- see `_hang` and
`SlidingDoorFactory` in components/openings.py. This manifest names the door;
the objects say which door they belong to.
"""

from __future__ import annotations

import json
import os

from ..config.plan import OpeningKind

#: Openings with a leaf on hinges.
HINGED = {OpeningKind.DOOR_INTERNAL, OpeningKind.DOOR_EXTERNAL}

#: And the one that runs sideways instead.
SLIDING = {OpeningKind.SLIDING_DOOR}

from ..config.joinery import AXIS_OFFSET, FRAME_FACE, LINING_FACE, SASH_FACE


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
            if opening.kind in SLIDING:
                half = opening.width / 2.0
                s0 = opening.offset - half
                s1 = opening.offset + half
                mid = (s0 + s1) / 2.0
                # The moving sash spans the first half of the opening and
                # runs the length of itself to end up behind the fixed one.
                travel = (mid + SASH_FACE / 2.0) - (s0 + FRAME_FACE)
                label = opening.name or f"{wall.name}.{int(opening.offset)}"
                # Middle of the moving sash when shut, for the trigger.
                cs = (s0 + FRAME_FACE + mid + SASH_FACE / 2.0) / 2.0
                cx = sx + ux * cs
                cy = sy + uy * cs
                doors.append({
                    "label": label,
                    "motion": "slide",
                    "kind": opening.kind.value,
                    "exterior": bool(wall.exterior),
                    "centre": [round(cx / 1000.0, 4), round(-cy / 1000.0, 4)],
                    # Which way the sash runs, and how far.
                    "along": [round(ux, 6), round(-uy, 6)],
                    "travel_m": round(travel / 1000.0, 4),
                    "width_m": round(travel / 1000.0, 4),
                })
                continue

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
                "label": label,
                "motion": "swing",
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
    swinging = sum(1 for d in doors if d.get("motion") == "swing")
    sliding = len(doors) - swinging
    line = f"doors: {swinging} hinged, {sliding} sliding"
    if path:
        line += f"\n  {path}"
    return line
