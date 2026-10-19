"""Products as components.

Each product becomes one Component so it flows through the existing build and
export machinery unchanged, and lands in its own .glb. The category doubles as
the output path, so a product exports to:

    public/models/products/<shop>/<product>.glb

Products build at the ORIGIN. They are not positioned here -- placement is
data, applied by the app -- so one sofa model serves every room it appears in.
"""

from __future__ import annotations

import bpy

from ..catalog.product import Product
from ..core.component import BuildContext, Component


class ProductComponent(Component):
    """Wraps one catalogue product as a buildable, exportable component."""

    def __init__(self, product: Product):
        self.product = product
        # Shop-qualified path: two shops may both sell a "sofa-3".
        self.category = f"{product.shop.id}/{product.id}"
        self.label = product.name

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        if self.product.build is None:
            ctx.warn(f"product {self.product.qualified_id!r} has no builder")
            return []
        return self.product.build(ctx)


def product_components(products: list[Product]) -> list[Component]:
    """One component per product that has geometry."""
    return [ProductComponent(p) for p in products if p.exportable]
