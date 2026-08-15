"""Tubod Enterprises -- tiles and floor finishes.

The catalogue's first FINISH-only shop, and the thing that proves the model
works for more than furniture.

A finish has no geometry. Nobody places a tile: the floor already exists,
built by `components/floors.py`, and the tile decides what that floor looks
like. So instead of a `build` function these products carry a `material` --
the Blender material name they supply. Any surface in the house wearing that
material is an advert for this product, and the app can trace it back.

That is why `build=None` here: `exportable` is False, so nothing is exported
to `public/models/products/`, but the product still appears in the catalogue
manifest with its price, SKU and swatch.
"""

from __future__ import annotations

from ...product import (
    Dimensions,
    Product,
    ProductCategory,
    RoomType,
    Shop,
    Variant,
)

SHOP = Shop(
    id="tubod",
    name="Tubod Enterprises",
    tagline="Tiles, sanitaryware and building supplies",
    currency="BWP",
)

#: Blender material name this shop's tile drives. Referenced by the room
#: finishes in `config/plan_3bed.py` -- change it in one place and both the
#: floor and the catalogue entry follow.
PYC61001_MATERIAL = "tile_pyc61001"

PRODUCTS = [
    Product(
        id="pyc61001",
        shop=SHOP,
        category=ProductCategory.TILE,
        name="PYC61001 Carrara Polished Porcelain 600x600",
        description=(
            "White marble-effect polished porcelain floor tile with soft grey "
            "veining. Rectified edges, suitable for living areas and bedrooms."
        ),
        colour="Carrara White",
        materials=("Polished porcelain",),
        price=189.0,           # per square metre
        sku="TUBOD-PYC61001",
        dimensions=Dimensions(600.0, 600.0, 9.0),
        room_types=(
            RoomType.LIVING, RoomType.DINING, RoomType.BEDROOM,
            RoomType.HALLWAY, RoomType.KITCHEN,
        ),
        build=None,            # a finish, not an object
        material=PYC61001_MATERIAL,
        texture="/textures/floor/pyc61001.jpg",
    ),
]


# --------------------------------------------------------------------------
# Gamazine -- textured wall coating.
#
# ONE coating, many colours, which is why this is the product that forced
# variants into the model. Modelling each colour as its own product would
# repeat the description, the scoping and the price band for every shade.
#
# The supplied image is a COLOUR CHART photographed in a showroom, not a
# tileable texture, so it is the product's swatch board. The wall texture
# itself is generated in three.js and tinted per variant -- one generator,
# any number of colours.
# --------------------------------------------------------------------------
GAMAZINE_EXTERIOR_MATERIAL = "gamazine_exterior"
GAMAZINE_INTERIOR_MATERIAL = "gamazine_interior"

#: Colours off the chart. Adding one is a line here, not a code change.
GAMAZINE_COLOURS = [
    ("ivory",      "Ivory",       "#e8e2d4"),
    ("sandstone",  "Sandstone",   "#c9b489"),
    ("terracotta", "Terracotta",  "#b5543a"),
    ("slate",      "Slate Grey",  "#4d5560"),
    ("ochre",      "Ochre",       "#d1a03c"),
    ("sky",        "Sky Blue",    "#6fa8c9"),
    ("rose",       "Dusty Rose",  "#c98b93"),
    ("olive",      "Olive",       "#7c8557"),
]


def _gamazine_variants(material: str, sku_prefix: str) -> tuple[Variant, ...]:
    """A variant per colour, all supplying the same coating material.

    The material name carries the colour so two walls in different shades are
    distinguishable -- otherwise every gamazine wall would look up the same
    texture.
    """
    return tuple(
        Variant(
            slug=slug,
            name=f"Gamazine {label}",
            colour=label,
            sku=f"{sku_prefix}-{slug.upper()}",
            material=f"{material}_{slug}",
            swatch=hex_colour,
            is_default=(slug == "ivory"),
        )
        for slug, label, hex_colour in GAMAZINE_COLOURS
    )


PRODUCTS += [
    Product(
        id="gamazine-exterior",
        shop=SHOP,
        category=ProductCategory.PAINT,
        name="Gamazine Exterior Textured Coating",
        description=(
            "Weather-resistant textured wall coating for exterior walls. "
            "Hides hairline cracks and needs no repainting for years. "
            "Available in the full colour range."
        ),
        colour="Multiple",
        materials=("Acrylic polymer", "Marble aggregate",),
        price=145.0,               # per square metre applied
        sku="TUBOD-GAM-EXT",
        room_types=(RoomType.OUTDOOR,),
        build=None,
        material=GAMAZINE_EXTERIOR_MATERIAL,
        texture="/textures/wall/GamazineColours.png",
        variants=_gamazine_variants(GAMAZINE_EXTERIOR_MATERIAL, "TUBOD-GAM-EXT"),
    ),
    Product(
        id="gamazine-interior",
        shop=SHOP,
        category=ProductCategory.PAINT,
        name="Gamazine Interior Textured Coating",
        description=(
            "The same textured coating in an interior grade, for feature "
            "walls and full rooms. Washable and low odour."
        ),
        colour="Multiple",
        materials=("Acrylic polymer", "Marble aggregate",),
        price=120.0,
        sku="TUBOD-GAM-INT",
        # Interior coating suits dry rooms; wet areas get tile instead.
        room_types=(
            RoomType.LIVING, RoomType.DINING, RoomType.BEDROOM,
            RoomType.HALLWAY,
        ),
        build=None,
        material=GAMAZINE_INTERIOR_MATERIAL,
        texture="/textures/wall/GamazineColours.png",
        variants=_gamazine_variants(GAMAZINE_INTERIOR_MATERIAL, "TUBOD-GAM-INT"),
    ),
    Product(
        id="wall-tile-satin-white",
        shop=SHOP,
        category=ProductCategory.TILE,
        name="Satin White Wall Tile 300x600",
        description=(
            "Glazed ceramic wall tile for kitchen splashbacks and bathroom "
            "walls. Rectified edges, satin finish."
        ),
        colour="Satin White",
        materials=("Glazed ceramic",),
        price=165.0,
        sku="TUBOD-WT-SW36",
        dimensions=Dimensions(300.0, 600.0, 8.0),
        # Wall tile is a WET-AREA product. Scoping is what stops it being
        # offered for a bedroom wall.
        room_types=RoomType.wet_areas(),
        build=None,
        material="wall_tile_satin_white",
        texture="/textures/wall/GamazineSilver.png",
    ),
]


# --------------------------------------------------------------------------
# Ordinary interior paint.
#
# The plain alternative to gamazine, and the reason both exist as PRODUCTS
# rather than as a texture switch: a wall is either coated or painted, both
# are sold by somebody, and the house should be able to show either.
# --------------------------------------------------------------------------
PAINT_MATERIAL = "paint_interior"

PAINT_COLOURS = [
    ("chalk",     "Chalk White",   "#f2efe9"),
    ("linen",     "Linen",         "#e6ddcc"),
    ("stone",     "Stone Grey",    "#b9b6ae"),
    ("sage",      "Sage",          "#9aa88c"),
    ("clay",      "Clay",          "#c08b6e"),
    ("midnight",  "Midnight Blue", "#38465c"),
]

PRODUCTS += [
    Product(
        id="premium-interior-paint",
        shop=SHOP,
        category=ProductCategory.PAINT,
        name="Premium Acrylic Interior Paint",
        description=(
            "Low-sheen washable acrylic for interior walls and ceilings. "
            "Smooth finish, unlike the textured gamazine coating."
        ),
        colour="Multiple",
        materials=("Acrylic emulsion",),
        price=38.0,                 # per square metre applied
        sku="TUBOD-PAINT-INT",
        room_types=(
            RoomType.LIVING, RoomType.DINING, RoomType.BEDROOM,
            RoomType.HALLWAY, RoomType.KITCHEN, RoomType.STORAGE,
        ),
        build=None,
        material=PAINT_MATERIAL,
        variants=tuple(
            Variant(
                slug=slug,
                name=f"{label}",
                colour=label,
                sku=f"TUBOD-PAINT-{slug.upper()}",
                material=f"{PAINT_MATERIAL}_{slug}",
                swatch=hex_colour,
                is_default=(slug == "chalk"),
            )
            for slug, label, hex_colour in PAINT_COLOURS
        ),
    ),
]
