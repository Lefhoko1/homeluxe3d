"""Product catalogue: shops, products and where they stand."""

from __future__ import annotations

from .catalog import CATALOG
from .product import (
    Catalog,
    Dimensions,
    Placement,
    Product,
    ProductCategory,
    Shop,
)

__all__ = [
    "CATALOG",
    "Catalog",
    "Dimensions",
    "Placement",
    "Product",
    "ProductCategory",
    "Shop",
]
