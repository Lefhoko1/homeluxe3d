"""Joinery dimensions, in millimetres.

These lived in `components/openings.py`, which is the only place that needed
them until doors started opening. Now the browser needs a door's hinge axis
too, and that axis is computed from the lining face and the leaf thickness --
so a second program has to know the same numbers.

IT MUST NOT KNOW THEM BY COPY. `export/doors_json.py` cannot import
`components/openings.py`, which imports `bpy`, so the first version of that
exporter simply repeated the constants -- and got two of the three wrong,
putting every hinge axis 28mm out. The bug was invisible in the manifest and
would have shown up as doors that swing about a point slightly inside the
wall.

Pure values, no Blender, so both sides import the same ones.
"""

from __future__ import annotations

FRAME_FACE = 60.0        # visible width of a frame member
FRAME_DEPTH = 120.0      # how far the frame reaches through the wall
GLASS_THICKNESS = 8.0
LEAF_THICKNESS = 40.0
LINING_FACE = 30.0
SASH_FACE = 45.0

#: How far the hinge axis stands off the face of the closed leaf.
#:
#: Half the leaf plus the knuckle. A door hung on its own centreline binds
#: against the lining as soon as it starts to turn; setting the axis proud is
#: what lets it swing clear, and it is why a real hinge has a barrel at all.
AXIS_OFFSET = LEAF_THICKNESS / 2.0 + 6.0
