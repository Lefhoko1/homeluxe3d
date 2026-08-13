"""Bradlows -- the first shop in the catalogue.

Everything here is one retailer's range. A second shop is a sibling package
with the same shape; nothing outside this directory needs to change to add
one.
"""

from __future__ import annotations

from ...product import Dimensions, Product, ProductCategory, Shop
from .lounge import (
    DEPTH,
    SofaSpec,
    build_coffee_table,
    build_rug,
    build_sofa,
)

SHOP = Shop(
    id="bradlows",
    name="Bradlows",
    tagline="Furniture, appliances and home",
    currency="BWP",
)

SOFA_3 = SofaSpec(seats=3, accent_cushions=1)
SOFA_2 = SofaSpec(seats=2, accent_cushions=1)
RECLINER = SofaSpec(seats=1, footrest=True, accent_cushions=0)

PRODUCTS = [
    Product(
        id="sandton-sofa-3",
        shop=SHOP,
        category=ProductCategory.SOFA,
        name="Sandton 3-Seater Recliner Sofa",
        description=(
            "Deep-seated three-seater in taupe bonded leather, with rolled "
            "arms and twin back cushions."
        ),
        colour="Taupe",
        materials=("Bonded leather", "Hardwood frame"),
        price=18999.0,
        sku="BRD-SAND-3S",
        dimensions=Dimensions(SOFA_3.width, DEPTH, 1020.0),
        build=build_sofa(SOFA_3),
    ),
    Product(
        id="sandton-sofa-2",
        shop=SHOP,
        category=ProductCategory.SOFA,
        name="Sandton 2-Seater Recliner Sofa",
        description="Matching two-seater from the Sandton lounge suite.",
        colour="Taupe",
        materials=("Bonded leather", "Hardwood frame"),
        price=14499.0,
        sku="BRD-SAND-2S",
        dimensions=Dimensions(SOFA_2.width, DEPTH, 1020.0),
        build=build_sofa(SOFA_2),
    ),
    Product(
        id="sandton-recliner",
        shop=SHOP,
        category=ProductCategory.CHAIR,
        name="Sandton Recliner Armchair",
        description=(
            "Single-seat recliner with extending footrest, shown reclined."
        ),
        colour="Taupe",
        materials=("Bonded leather", "Hardwood frame"),
        price=8999.0,
        sku="BRD-SAND-1R",
        dimensions=Dimensions(RECLINER.width, RECLINER.depth, 1020.0),
        build=build_sofa(RECLINER),
    ),
    Product(
        id="oakwood-coffee-table",
        shop=SHOP,
        category=ProductCategory.TABLE,
        name="Oakwood Coffee Table",
        description="Dark timber coffee table with glass inset and lower shelf.",
        colour="Dark walnut",
        materials=("Solid timber", "Tempered glass"),
        price=4299.0,
        sku="BRD-OAK-CT",
        dimensions=Dimensions(1200.0, 700.0, 450.0),
        build=build_coffee_table,
    ),
    Product(
        id="woven-jute-rug",
        shop=SHOP,
        category=ProductCategory.RUG,
        name="Woven Jute Rug 3.0 x 2.2m",
        description="Hand-woven natural jute rug.",
        colour="Natural",
        materials=("Jute",),
        price=2799.0,
        sku="BRD-JUTE-32",
        dimensions=Dimensions(3000.0, 2200.0, 16.0),
        build=build_rug,
    ),
]
