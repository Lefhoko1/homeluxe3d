"""Bears -- Slumberland pillow-top bed sets.

Modelled from the showroom photographs in `public/bearsFurnitures/Beds/`: a
charcoal pleated base on short dark feet, a damask-banded mattress, and a pale
quilted pillow-top crown sitting proud of it.

WHY A BUILDER AND NOT A MODEL OF ONE BED. Slumberland sells the same
construction in five sizes -- three-quarter, double, queen, king, XL -- and
they differ by two numbers. Modelling the queen would mean modelling the king
again next week, and getting the pillow-top lip subtly different both times.
`BedSpec` is the two numbers; everything else is proportion.

WHAT MAKES IT READ AS A PILLOW-TOP, and it is worth being explicit because a
bed is very easy to build as a grey box:

  * The CROWN IS INSET and rounded hard. A pillow top is a separate quilted
    pad stitched on, so it is narrower than the mattress under it and its
    edges are soft where the mattress edge is square. That overhanging lip and
    the shadow under it is the single feature that says "pillow top" at a
    glance across a room. The QUILTING on it is not modelled -- it is drawn,
    at its real 125mm pitch, in the fabric's bump map. See the note where the
    crown is built.
  * The BASE IS PLEATED. Vertical ribs every 90mm or so, which is what the
    photographs actually show and what stops a 1.5m expanse of dark fabric
    reading as a plinth.
  * The BAND ROUND THE MATTRESS is its own colour. The eye finds the
    horizontal line between base, mattress and crown before it finds anything
    else, and three tones is what puts those lines there.

CONVENTION, shared by every product in the catalogue:
    footprint centred on (0, 0), underside at z = 0, facing +Y.

For a bed, "facing +Y" is taken to mean THE HEAD IS AT +Y. So a placement with
rotation 0 puts the headboard end against a north wall, which is how a bed is
described in a room -- "head against the north wall" -- rather than by which
way a sleeper looks.
"""

from __future__ import annotations

from dataclasses import dataclass

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

from ....core import mesh as meshutil
from ....core.component import BuildContext

# --------------------------------------------------------------------------
# Construction, shared by every size in the range.
#
# Heights come off the photographs against the 152cm width, which is the one
# dimension the product name states outright and so the one that can be
# measured against.
# --------------------------------------------------------------------------
FOOT_HEIGHT = 95.0          # short dark feet, barely clear of the floor
FOOT_INSET = 90.0           # how far in from the corner each foot sits
FOOT_RADIUS = 32.0

BASE_HEIGHT = 300.0         # the pleated divan base
BASE_PLEAT_DEPTH = 12.0     # how far each rib stands out
BASE_PLEAT_PITCH = 95.0     # centres, along the side

MATTRESS_HEIGHT = 250.0     # the sprung body, damask band on show
CROWN_HEIGHT = 105.0        # the pillow top stitched over it
CROWN_INSET = 55.0          # narrower than the mattress: this is the lip

#: How far the crown's top face is domed above its edge.
#:
#: A pillow top is stuffed, so it is not flat -- but it is very nearly flat,
#: and this is the whole of the relief the MESH carries. The quilting itself
#: lives in the texture; see the note where the crown is built.
CROWN_DOME = 14.0

#: Fabrics. See materials/library.py -- three tones, deliberately.
QUILT = "bed_quilt_pearl"
BORDER = "bed_border_ash"
BASE = "bed_base_slate"
FOOT = "furniture_foot"


@dataclass(frozen=True)
class BedSpec:
    """One size in the range.

    `width` and `length` are the mattress size in millimetres -- the numbers a
    bed is sold by. The base is built flush with the mattress, as a divan is.
    """

    width: float
    length: float
    label: str = ""

    @property
    def height(self) -> float:
        """Floor to the top of the pillow top."""
        return FOOT_HEIGHT + BASE_HEIGHT + MATTRESS_HEIGHT + CROWN_HEIGHT


#: The range Bears carries. Botswana/South African sizing.
QUEEN = BedSpec(1520.0, 1880.0, "Queen 152cm")


def build_bed(spec: BedSpec):
    """Return a build function for one size."""

    def build(ctx: BuildContext) -> list[bpy.types.Object]:
        hw = spec.width / 2.0
        hl = spec.length / 2.0
        objects: list[bpy.types.Object] = []

        def add(obj, finish):
            ctx.materials.assign(obj, finish)
            objects.append(obj)
            return obj

        # -- Feet ----------------------------------------------------------
        # Four, set in from the corners as the photographs show. Round rather
        # than square: they are turned wooden feet with a dark stain.
        for sx in (-1, 1):
            for sy in (-1, 1):
                add(
                    meshutil.cylinder(
                        f"bed.foot_{'e' if sx > 0 else 'w'}{'n' if sy > 0 else 's'}",
                        sx * (hw - FOOT_INSET),
                        sy * (hl - FOOT_INSET),
                        0.0,
                        FOOT_HEIGHT,
                        FOOT_RADIUS,
                        radius_top_mm=FOOT_RADIUS * 0.78,
                        segments=10,
                    ),
                    FOOT,
                )

        base_z0 = FOOT_HEIGHT
        base_z1 = base_z0 + BASE_HEIGHT

        # -- The divan base ------------------------------------------------
        add(
            meshutil.box("bed.base", -hw, -hl, base_z0, hw, hl, base_z1),
            BASE,
        )

        # Vertical pleats. Built as shallow ribs standing off each face rather
        # than as cut grooves -- same silhouette from any angle a visitor will
        # see, and no boolean.
        def pleat_run(length_mm, place):
            """Ribs evenly spaced along a face, inset from both ends."""
            usable = length_mm - BASE_PLEAT_PITCH
            count = max(1, int(usable // BASE_PLEAT_PITCH))
            # Centre the run, so a base is never pleated lopsidedly.
            span = (count - 1) * BASE_PLEAT_PITCH
            for i in range(count):
                place(-span / 2.0 + i * BASE_PLEAT_PITCH, i)

        rib_top = base_z1 - 26.0      # stop under the top piping
        rib_bottom = base_z0 + 12.0

        def rib(name, x0, y0, x1, y1):
            add(
                meshutil.rounded_box(name, x0, y0, rib_bottom, x1, y1, rib_top,
                                     radius=5.0, segments=2),
                BASE,
            )

        pleat_run(spec.width, lambda x, i: (
            rib(f"bed.pleat_n{i}", x - 16.0, hl, x + 16.0, hl + BASE_PLEAT_DEPTH),
            rib(f"bed.pleat_s{i}", x - 16.0, -hl - BASE_PLEAT_DEPTH, x + 16.0, -hl),
        ))
        pleat_run(spec.length, lambda y, i: (
            rib(f"bed.pleat_e{i}", hw, y - 16.0, hw + BASE_PLEAT_DEPTH, y + 16.0),
            rib(f"bed.pleat_w{i}", -hw - BASE_PLEAT_DEPTH, y - 16.0, -hw, y + 16.0),
        ))

        # The piping that finishes the top of the base. A hard line here is
        # what separates the base from the mattress at a distance.
        add(
            meshutil.rounded_box(
                "bed.base_piping",
                -hw - 8.0, -hl - 8.0, base_z1 - 26.0,
                hw + 8.0, hl + 8.0, base_z1 + 6.0,
                radius=9.0, segments=2,
            ),
            BORDER,
        )

        # -- The mattress --------------------------------------------------
        mat_z0 = base_z1 + 6.0
        mat_z1 = mat_z0 + MATTRESS_HEIGHT

        add(
            meshutil.rounded_box(
                "bed.mattress",
                -hw, -hl, mat_z0, hw, hl, mat_z1,
                radius=28.0, segments=3,
            ),
            BORDER,
        )

        # Handles: four on the long sides, the small detail that reads as a
        # real mattress rather than a block of foam.
        for sy in (-1, 1):
            for x in (-spec.width * 0.22, spec.width * 0.22):
                add(
                    meshutil.rounded_box(
                        f"bed.handle_{'n' if sy > 0 else 's'}{int(x)}",
                        x - 95.0, sy * hl, mat_z0 + MATTRESS_HEIGHT * 0.42,
                        x + 95.0, sy * (hl + 14.0), mat_z0 + MATTRESS_HEIGHT * 0.62,
                    ),
                    BASE,
                )

        # -- The pillow top ------------------------------------------------
        # Inset and rounded. See the module docstring: the lip and the shadow
        # under it are what say "pillow top".
        crown_x = hw - CROWN_INSET
        crown_y = hl - CROWN_INSET
        crown_top = mat_z1 + CROWN_HEIGHT

        # THE QUILTING IS NOT GEOMETRY, and that was worth getting wrong once
        # to learn. The crown was first built as a grid of puffed pads, on the
        # reasoning that stitching pulls the cover down and the filling puffs
        # up between the stitches. True of how a quilt is made; wrong as a
        # model of this one. The photographs show quilted figures about 125mm
        # across, and pads that small are a hundred and twenty bevelled boxes
        # on every bed -- so they came out at 280mm instead, and then the mesh
        # was quilted at one pitch while the fabric was quilted at another.
        # Two grids visibly at odds.
        #
        # A relief that fine is shading rather than silhouette at any distance
        # a visitor stands, so it belongs in the bump map, where it costs
        # nothing and is drawn at the real pitch. See
        # `createQuiltedKnitTexture` in house/textures/proceduralTextures.js.
        #
        # What stays in the mesh is what IS silhouette: the inset, the lip,
        # and the slight dome of something stuffed.
        add(
            meshutil.rounded_box(
                "bed.pillow_top",
                -crown_x, -crown_y, mat_z1 - 8.0,
                crown_x, crown_y, crown_top - CROWN_DOME,
                radius=24.0, segments=3,
            ),
            QUILT,
        )
        add(
            meshutil.rounded_box(
                "bed.pillow_dome",
                -crown_x + 26.0, -crown_y + 26.0, crown_top - CROWN_DOME - 20.0,
                crown_x - 26.0, crown_y - 26.0, crown_top,
                radius=40.0, segments=4,
            ),
            QUILT,
        )

        return objects

    return build
