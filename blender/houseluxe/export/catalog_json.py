"""Catalogue manifest.

Writes shops, products and per-house placements to a single JSON file the app
reads at runtime. Because placement is data rather than baked-in transforms,
the app can move a sofa, swap a shop's range, or drop a room's furnishing
without anything being re-exported from Blender.

Positions are emitted in THREE.JS space so the app does no conversion --
see `Placement.as_dict`.
"""

from __future__ import annotations

import json
import os

from ..catalog.product import Catalog


def model_url(product, base_url: str) -> str:
    return f"{base_url}{product.shop.id}/{product.id}.glb"


def build_manifest(catalog: Catalog, base_url: str = "/models/products/") -> dict:
    shops = []
    for shop in catalog.shops:
        products = [
            product.as_dict(
                model_url(product, base_url) if product.exportable else None
            )
            for product in catalog.for_shop(shop.id)
        ]
        shops.append(
            {
                "id": shop.id,
                "name": shop.name,
                "tagline": shop.tagline,
                "currency": shop.currency,
                "website": shop.website,
                "products": products,
            }
        )

    houses = {
        house: [p.as_dict() for p in catalog.for_house(house)]
        for house in catalog.houses()
    }

    return {
        "version": 1,
        "generated_by": "blender/houseluxe",
        "shops": shops,
        "houses": houses,
    }


def write_manifest(
    catalog: Catalog,
    path: str,
    base_url: str = "/models/products/",
) -> dict:
    manifest = build_manifest(catalog, base_url)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest


def report(manifest: dict, path: str) -> str:
    lines = ["", "Catalogue", "=" * 60]
    for shop in manifest["shops"]:
        lines.append(f"  {shop['name']} ({shop['id']})")
        for product in shop["products"]:
            price = product.get("price")
            money = f"{shop['currency']} {price:,.0f}" if price else "-"
            lines.append(
                f"      {product['name']:<38} {product['category']:<10} {money:>14}"
            )
    for house, placements in manifest["houses"].items():
        lines.append(f"  placed in '{house}': {len(placements)} item(s)")
        for item in placements:
            lines.append(f"      {item['room']:<10} {item['product']}")
    lines.append("-" * 60)
    lines.append(f"  manifest: {path}")
    return "\n".join(lines)
