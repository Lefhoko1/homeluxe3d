"""The advertising inventory, as a manifest.

Written for two readers and they want the same thing for different reasons.

THE BROWSER draws a marker in every empty slot, so somebody can walk through
the house and see where products will go before any have been bought. That is
what turns a plan into a sales tool: an empty slot is the thing being sold,
and until it can be SEEN it can only be described.

THE DATABASE IMPORT mirrors these rows into `placement_slots`, keyed on the
stable id. Blender is the master for structural slots -- a position only means
something if a product physically fits there, and that is a modelling fact --
so a rebuild republishes the same ids and the database updates rather than
duplicates.

Millimetres in, three.js metres out, converted here as everything else is so
the browser never does axis maths.
"""

from __future__ import annotations

import json
import os


def build_manifest(plan, slots) -> dict:
    rooms = {r.name: r for r in plan.rooms}

    out = []
    for slot in slots:
        room = rooms.get(slot.room)
        out.append({
            "id": slot.id,
            "room": slot.room,
            "roomLabel": room.label if room else slot.room,
            "roomType": room.room_type if room else None,
            "type": slot.slot_type,
            "category": slot.category or None,
            "label": slot.label,
            "priority": slot.priority,
            # three.js house-local metres. The Y of a slot is the height of
            # its BASE, not its centre: a product stands ON the slot.
            "position": [
                round(slot.x / 1000.0, 4),
                round(slot.z / 1000.0, 4),
                round(-slot.y / 1000.0, 4),
            ],
            "rotationY": slot.rotation,
            # The envelope, in metres. The largest thing that fits.
            "size": [
                round(slot.width / 1000.0, 4),
                round(slot.height / 1000.0, 4),
                round(slot.depth / 1000.0, 4),
            ],
        })

    return {
        "version": 1,
        "scene": plan.name,
        "slots": out,
    }


def write_manifest(plan, slots, path: str) -> dict:
    manifest = build_manifest(plan, slots)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict, problems=None, path: str = "") -> str:
    slots = manifest.get("slots", [])
    rooms = len({s["room"] for s in slots})
    kinds = len({s["type"] for s in slots})
    line = f"slots: {len(slots)} across {rooms} room(s), {kinds} kind(s)"
    if problems:
        line += f"\n  ! {len(problems)} PROBLEM(S):"
        for problem in problems[:8]:
            line += f"\n      {problem}"
    if path:
        line += f"\n  {path}"
    return line
