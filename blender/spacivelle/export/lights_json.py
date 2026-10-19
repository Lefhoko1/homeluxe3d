"""Where the ceiling lights are.

`components/lights.py` builds the fittings; this writes down where it put
them, so the three.js side can hang an actual light at each one. Both read
`LightsComponent.fittings()`, so the glowing lens and the light it appears to
cast cannot end up in different places.

DAYLIGHT, NOT LAMPLIGHT. The colour here is about 5000K -- the neutral white
of a modern LED panel -- rather than the 2700K of a filament bulb. Warm light
is pleasant in a photograph of a living room and wrong here: it tints the
merchandise. A sofa advertised as grey has to look grey.

INTENSITY FOLLOWS FLOOR AREA. A 2m bathroom and a 4.5m living room lit at the
same figure give a blown-out bathroom or a gloomy lounge. Each fitting carries
a share of what its room needs.
"""

from __future__ import annotations

import json
import os

from ..components.lights import LightsComponent

#: Roughly 5000K, as a linear sRGB hex. Neutral enough not to tint a product.
DAYLIGHT = "#f4f7ff"

#: Watts-ish per square metre, in three.js point-light terms. Tuned against
#: the hemisphere and ambient already in the scene: high enough that a room
#: reads as lit, low enough not to blow out a white ceiling right above it.
#: EVERY FITTING IS THE SAME BRIGHTNESS, and bigger rooms get more of them.
#:
#: The first version shared a per-square-metre total between a room's fittings,
#: which is exactly backwards: the WC came out at 3.5 and the living room at
#: 17 each, so the small room was gloomy and the large one glaring. Real
#: downlights are identical parts; a bigger room is wired with more.
#:
#: The figure itself: three.js point lights use physical falloff, so
#: illuminance under a fitting is intensity / distance squared. The ceiling is
#: 2.31m up, giving about I/5.3 at the floor, and the scene already carries
#: roughly 1.6 from the hemisphere and ambient. 8.5 puts about 1.6 more
#: directly under each fitting -- a clear pool of light without blowing out
#: the white ceiling it is mounted in.
INTENSITY = 8.5

#: How far a fitting's light carries. Beyond this it contributes nothing, so
#: a bedroom light cannot wash across the hall.
RANGE_M = 6.5


def build_manifest(plan) -> dict:
    fittings = LightsComponent.fittings(plan)

    lights = []
    for room, x, y in fittings:
        lights.append({
            "room": room.name,
            "label": room.label,
            # three.js house-local metres, converted here as everything else
            # is, so the browser never does axis maths. The light sits just
            # below the lens rather than inside it, or the fitting shadows
            # its own room.
            "position": [
                x / 1000.0,
                (plan.ceiling.height - LightsComponent.RIM
                 - LightsComponent.DROP - 40.0) / 1000.0,
                -y / 1000.0,
            ],
            "intensity": INTENSITY,
            "distance": RANGE_M,
        })

    return {
        "version": 1,
        "colour": DAYLIGHT,
        "lights": lights,
    }


def write_manifest(plan, path: str) -> dict:
    manifest = build_manifest(plan)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict) -> str:
    lights = manifest.get("lights", [])
    if not lights:
        return "lights: none"

    rooms: dict[str, int] = {}
    for light in lights:
        rooms[light["label"]] = rooms.get(light["label"], 0) + 1
    busiest = max(rooms.items(), key=lambda item: item[1])

    return (
        f"lights: {len(lights)} fitting(s) across {len(rooms)} room(s), "
        f"up to {busiest[1]} in the {busiest[0]}"
    )
