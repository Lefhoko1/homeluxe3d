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

from ...product import Dimensions, Product, ProductCategory, Shop

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
        build=None,            # a finish, not an object
        material=PYC61001_MATERIAL,
        texture="/textures/floor/pyc61001.jpg",
    ),
]
