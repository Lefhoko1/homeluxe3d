"""Product catalogue vocabulary.

Everything visible in a house is an advertisement for something a shop sells:
the sofa, the tiles, the paint on the wall, the bath, the television. This
module is the structure that makes that true in the data, not just in
principle.

THE THREE THINGS, kept separate on purpose:

  Shop       Who sells it. Bradlows, and whoever comes next.
  Product    What is for sale. Owns its dimensions, price, and how to build it.
  Placement  Where one instance of it stands in a particular house.

A Product never knows where it is. A Placement never knows how to build
geometry. That split is what lets the same sofa appear in three houses, and
lets a house be re-dressed with a different shop's range without touching
either the geometry or the building.

Products export ONE model each, at the origin, and placements are data. The
alternative -- baking position into the mesh -- would mean re-exporting the
sofa every time it slides across the room, and shipping the same sofa three
times if it appears three times.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

import bpy


class ProductCategory(str, Enum):
    """What kind of thing this is.

    Deliberately broad. A house advertises far more than furniture, and the
    catalogue has to have room for the finishes as well as the objects, so
    that "which shop supplied the tiles" is answerable.
    """

    # Objects placed in rooms
    SOFA = "sofa"
    CHAIR = "chair"
    TABLE = "table"
    BED = "bed"
    STORAGE = "storage"
    TELEVISION = "television"
    APPLIANCE = "appliance"
    LIGHTING = "lighting"
    DECOR = "decor"
    RUG = "rug"

    # Fixtures plumbed or built in
    BATH = "bath"
    BASIN = "basin"
    TOILET = "toilet"
    SHOWER = "shower"
    KITCHEN_UNIT = "kitchen_unit"

    # Finishes applied to surfaces rather than placed
    TILE = "tile"
    PAINT = "paint"
    BRICK = "brick"
    FLOORING = "flooring"
    ROOFING = "roofing"
    WINDOW = "window"
    DOOR = "door"

    @property
    def is_finish(self) -> bool:
        """Finishes are advertised as materials, not as placed objects."""
        return self in {
            ProductCategory.TILE,
            ProductCategory.PAINT,
            ProductCategory.BRICK,
            ProductCategory.FLOORING,
            ProductCategory.ROOFING,
        }


@dataclass(frozen=True)
class Shop:
    """A retailer whose products appear in the houses."""

    id: str
    name: str
    tagline: str = ""
    currency: str = "BWP"
    website: str = ""

    def qualify(self, product_id: str) -> str:
        """Namespace a product id, so two shops can both sell a 'sofa-3'."""
        return f"{self.id}.{product_id}"


@dataclass(frozen=True)
class Dimensions:
    """Overall size in millimetres, as a shop would quote it."""

    width: float
    depth: float
    height: float

    def as_dict(self) -> dict:
        return {"width": self.width, "depth": self.depth, "height": self.height}


@dataclass(frozen=True)
class Product:
    """One thing a shop sells.

    `build` receives a BuildContext and returns the objects making up the
    product, positioned at the ORIGIN with its footprint centred on
    (0, 0) and its underside at z=0, facing +Y. Every product obeys that
    convention so placements are interchangeable.
    """

    id: str
    shop: Shop
    category: ProductCategory
    name: str
    build: Callable[..., list[bpy.types.Object]] | None = None

    price: float | None = None
    dimensions: Dimensions | None = None
    description: str = ""
    colour: str = ""
    materials: tuple[str, ...] = ()
    sku: str = ""

    #: For FINISHES only: the Blender material name this product supplies.
    #:
    #: This is what makes "which shop supplied the floor tiles?" answerable.
    #: A finish has no geometry of its own -- it dresses a surface someone
    #: else built -- so instead of a model it names the material, and the app
    #: can trace any surface in the house back to the product on sale.
    material: str = ""

    #: Optional image for the finish, used both as the three.js texture and
    #: as the swatch a shop panel would show.
    texture: str = ""

    @property
    def qualified_id(self) -> str:
        return self.shop.qualify(self.id)

    @property
    def exportable(self) -> bool:
        """Finishes have no geometry of their own -- they dress a surface."""
        return self.build is not None

    def as_dict(self, model_url: str | None = None) -> dict:
        data = {
            "id": self.qualified_id,
            "shop": self.shop.id,
            "category": self.category.value,
            "name": self.name,
            "description": self.description,
            "colour": self.colour,
            "sku": self.sku,
            "price": self.price,
            "currency": self.shop.currency,
        }
        if self.dimensions:
            data["dimensions"] = self.dimensions.as_dict()
        if model_url:
            data["model"] = model_url
        if self.material:
            data["material"] = self.material
        if self.texture:
            data["texture"] = self.texture
        return data


@dataclass(frozen=True)
class Placement:
    """One instance of a product standing in a house.

    Position is the product's footprint centre, in the house's own
    millimetre coordinates. `rotation` is degrees about Z, counter-clockwise
    seen from above; 0 means the product faces +Y (north).
    """

    product_id: str
    house: str
    room: str
    x: float
    y: float
    rotation: float = 0.0
    z: float = 0.0
    note: str = ""

    def as_dict(self) -> dict:
        """Emit in THREE.JS space, so the app does no conversion.

        The glTF exporter writes Y-up, mapping Blender (x, y, z) to
        three (x, z, -y). A rotation about Blender +Z becomes the same
        rotation about three +Y.
        """
        return {
            "product": self.product_id,
            "room": self.room,
            "position": [self.x / 1000.0, self.z / 1000.0, -self.y / 1000.0],
            "rotationY": self.rotation,
            "note": self.note,
        }


@dataclass
class Catalog:
    """Every shop, product and placement known to the build."""

    shops: list[Shop] = field(default_factory=list)
    products: list[Product] = field(default_factory=list)
    placements: list[Placement] = field(default_factory=list)

    def add_shop(self, shop: Shop, products: list[Product]) -> None:
        self.shops.append(shop)
        self.products.extend(products)

    def product(self, qualified_id: str) -> Product:
        for candidate in self.products:
            if candidate.qualified_id == qualified_id:
                return candidate
        raise KeyError(f"no product {qualified_id!r}")

    def for_shop(self, shop_id: str) -> list[Product]:
        return [p for p in self.products if p.shop.id == shop_id]

    def for_house(self, house: str) -> list[Placement]:
        return [p for p in self.placements if p.house == house]

    def houses(self) -> list[str]:
        seen: list[str] = []
        for placement in self.placements:
            if placement.house not in seen:
                seen.append(placement.house)
        return seen

    def validate(self) -> list[str]:
        """Catch the mistakes that only show up as an empty room."""
        problems: list[str] = []

        ids = [p.qualified_id for p in self.products]
        for pid in ids:
            if ids.count(pid) > 1:
                problems.append(f"duplicate product id {pid!r}")

        known = set(ids)
        for placement in self.placements:
            if placement.product_id not in known:
                problems.append(
                    f"placement in {placement.house}/{placement.room} refers to "
                    f"unknown product {placement.product_id!r}"
                )

        shop_ids = [s.id for s in self.shops]
        for shop_id in shop_ids:
            if shop_ids.count(shop_id) > 1:
                problems.append(f"duplicate shop id {shop_id!r}")

        return problems
