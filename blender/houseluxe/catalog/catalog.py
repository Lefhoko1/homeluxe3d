"""The assembled catalogue.

The one place that knows every shop and every placement. Adding a shop is two
lines here plus its package; adding a house's furnishing is one line.
"""

from __future__ import annotations

from .placements import house_3bed
from .product import Catalog
from .shops import bradlows

CATALOG = Catalog()

# -- Shops ------------------------------------------------------------------
CATALOG.add_shop(bradlows.SHOP, bradlows.PRODUCTS)

# -- Placements per house ---------------------------------------------------
CATALOG.placements.extend(house_3bed.PLACEMENTS)
