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
from datetime import date
from enum import Enum
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:                       # pragma: no cover
    # Only ever used in an annotation, and `from __future__ import
    # annotations` leaves those as strings -- so importing Blender at runtime
    # buys nothing and costs the catalogue its independence. Keeping it out
    # means the placements can be read by the plain-Python tools that solve
    # the route and the collision model. See blender/tools/export_navigation.py.
    import bpy


class RoomType(str, Enum):
    """What kind of room a product belongs in.

    Scoping is what stops a bath being offered for the living room. A product
    declares the room types it suits; a slot declares the room type it is in;
    the two must agree before a product can be placed.

    Deliberately a TYPE, not a room. "bedroom" covers the master, bedroom 2
    and bedroom 3 -- a shop advertises for bedrooms, not for bedroom 3.
    """

    LIVING = "living"
    DINING = "dining"
    KITCHEN = "kitchen"
    BEDROOM = "bedroom"
    BATHROOM = "bathroom"
    ENSUITE = "ensuite"
    LAUNDRY = "laundry"
    HALLWAY = "hallway"
    STORAGE = "storage"
    OUTDOOR = "outdoor"

    @classmethod
    def wet_areas(cls) -> tuple["RoomType", ...]:
        return (cls.BATHROOM, cls.ENSUITE, cls.LAUNDRY, cls.KITCHEN)


@dataclass(frozen=True)
class Promotion:
    """A dated special on a product.

    The point of the end date is that it EXPIRES ON ITS OWN. A shop should not
    have to remember to pull a special down -- when `ends_on` passes the
    product stops being advertised, which is what `Product.is_active` checks.

    Dates are ISO strings so the whole catalogue stays plain, diffable data.
    """

    label: str
    ends_on: str                    # "2026-09-30"
    starts_on: str | None = None
    promo_price: float | None = None
    terms: str = ""

    def _as_date(self, value: str | None) -> date | None:
        return date.fromisoformat(value) if value else None

    def is_live(self, today: date | None = None) -> bool:
        today = today or date.today()
        start = self._as_date(self.starts_on)
        end = self._as_date(self.ends_on)
        if start and today < start:
            return False
        return end is None or today <= end

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "startsOn": self.starts_on,
            "endsOn": self.ends_on,
            "promoPrice": self.promo_price,
            "terms": self.terms,
            "isLive": self.is_live(),
        }


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

    # Fittings screwed to the building rather than standing in it
    HARDWARE = "hardware"

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
class Variant:
    """One buyable version of a product.

    Gamazine is the case that forces this: it is ONE coating sold in dozens of
    colours. Modelling each colour as its own product would duplicate the
    description, the room scoping and the price band forty times over, and a
    shop changing its terms would have to change them forty times.

    A variant supplies its own material name so the app can tell the colours
    apart on a wall, and its own texture or tint.
    """

    slug: str
    name: str
    colour: str = ""
    sku: str = ""
    price: float | None = None

    #: Material name this variant supplies, for finishes.
    material: str = ""
    texture: str = ""

    #: sRGB hex, for a swatch and for tinting a procedural texture.
    swatch: str = ""

    is_default: bool = False

    def as_dict(self) -> dict:
        return {
            "slug": self.slug,
            "name": self.name,
            "colour": self.colour,
            "sku": self.sku,
            "price": self.price,
            "material": self.material,
            "texture": self.texture,
            "swatch": self.swatch,
            "isDefault": self.is_default,
        }


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

    #: The shop's own photograph of the thing, and any further shots.
    #:
    #: THE MODEL IS NOT THE PRODUCT. A generated sofa is close enough to place
    #: in a room and judge the scale of, and it is not what a buyer wants to
    #: look at before spending nine thousand pula. The advert panel has always
    #: been able to show a photograph -- `advertFor` in ProductLoader.js reads
    #: `thumbnail` and `media` -- but nothing in the static catalogue ever
    #: supplied one, so the database path showed pictures and the file path
    #: showed none. That is exactly the kind of difference that only turns up
    #: in production.
    #:
    #: Paths are site-absolute, served straight out of `public/`.
    thumbnail: str = ""
    media: tuple[str, ...] = ()

    #: Room types this may be placed in. EMPTY MEANS ANY -- a rug goes
    #: anywhere, a bath does not. Scoping is what stops a shop advertising a
    #: bath in the living room.
    room_types: tuple[RoomType, ...] = ()

    #: A dated special. When it ends the product stops being advertised.
    promotion: Promotion | None = None

    #: The shop's own on/off switch, independent of any promotion.
    enabled: bool = True

    #: Buyable versions. Empty means the product IS its own single variant.
    variants: tuple[Variant, ...] = ()

    @property
    def qualified_id(self) -> str:
        return self.shop.qualify(self.id)

    @property
    def exportable(self) -> bool:
        """Finishes have no geometry of their own -- they dress a surface."""
        return self.build is not None

    @property
    def is_active(self) -> bool:
        """Should this be advertised right now?

        Two independent gates: the shop's switch, and the promotion's dates.
        A product tied to an expired special goes dark by itself, which is the
        whole point of putting an end date on it -- nobody has to remember to
        take the advert down.
        """
        if not self.enabled:
            return False
        if self.promotion is not None and not self.promotion.is_live():
            return False
        return True

    @property
    def effective_price(self) -> float | None:
        """Promo price while the special runs, list price otherwise."""
        if self.promotion and self.promotion.is_live() and self.promotion.promo_price:
            return self.promotion.promo_price
        return self.price

    def fits_room(self, room_type: RoomType | str | None) -> bool:
        """True if this product may be placed in that kind of room."""
        if not self.room_types:
            return True                    # unscoped: anywhere
        if room_type is None:
            return False
        value = room_type.value if isinstance(room_type, RoomType) else str(room_type)
        return any(rt.value == value for rt in self.room_types)

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
            "effectivePrice": self.effective_price,
            "currency": self.shop.currency,
            "roomTypes": [rt.value for rt in self.room_types],
            "isActive": self.is_active,
            "enabled": self.enabled,
        }
        if self.promotion:
            data["promotion"] = self.promotion.as_dict()
        if self.materials:
            data["madeOf"] = list(self.materials)
        if self.variants:
            data["variants"] = [v.as_dict() for v in self.variants]
            data["defaultVariant"] = next(
                (v.slug for v in self.variants if v.is_default),
                self.variants[0].slug,
            )
        if self.dimensions:
            data["dimensions"] = self.dimensions.as_dict()
        if model_url:
            data["model"] = model_url
        if self.material:
            data["material"] = self.material
        if self.texture:
            data["texture"] = self.texture
        if self.thumbnail:
            data["thumbnail"] = self.thumbnail
        if self.media:
            data["media"] = list(self.media)
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
    x: float = 0.0
    y: float = 0.0
    rotation: float = 0.0
    z: float = 0.0
    note: str = ""

    #: For a FINISH: the surface it dresses -- the material name Blender baked
    #: into the mesh, such as `wall.living` or `tile_pyc61001`. Set this and the
    #: placement stops being an object standing somewhere and becomes a coat of
    #: something on a surface.
    surface: str = ""

    #: Which colour, for a product sold in several.
    variant: str = ""

    @property
    def is_finish(self) -> bool:
        return bool(self.surface)

    def as_dict(self) -> dict:
        """Emit in THREE.JS space, so the app does no conversion.

        A finish carries no position -- it dresses a whole surface -- so it
        emits `surface` instead, and the app keys off `isFinish`.

        The glTF exporter writes Y-up, mapping Blender (x, y, z) to
        three (x, z, -y). A rotation about Blender +Z becomes the same
        rotation about three +Y.
        """
        data = {
            "product": self.product_id,
            "room": self.room,
            "note": self.note,
        }
        if self.is_finish:
            data.update({
                "isFinish": True,
                "surface": self.surface,
                "variant": self.variant or None,
                "position": None,
            })
        else:
            data.update({
                "isFinish": False,
                "position": [self.x / 1000.0, self.z / 1000.0, -self.y / 1000.0],
                "rotationY": self.rotation,
            })
        return data


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

    def validate(self, room_types: dict[str, str] | None = None) -> list[str]:
        """Catch the mistakes that only show up as an empty room.

        `room_types` maps room code -> room type, so scoping can be checked:
        a bath placed in the living room is a build failure, not something to
        discover in a screenshot.
        """
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

        # Room scoping. Only checkable when the caller supplies the plan's
        # room types, so a house-less catalogue still validates.
        if room_types:
            for placement in self.placements:
                if placement.product_id not in known:
                    continue                      # already reported above
                product = self.product(placement.product_id)
                if placement.room == "exterior":
                    continue          # outdoors is not a room in the plan
                room_type = room_types.get(placement.room)
                if room_type is None:
                    problems.append(
                        f"placement of {placement.product_id!r} names room "
                        f"{placement.room!r}, which is not in the plan"
                    )
                elif not product.fits_room(room_type):
                    allowed = ", ".join(rt.value for rt in product.room_types)
                    problems.append(
                        f"{placement.product_id!r} is scoped to [{allowed}] but "
                        f"is placed in {placement.room!r} (a {room_type})"
                    )

        return problems

    def active_products(self) -> list[Product]:
        """Products that should be advertised right now."""
        return [p for p in self.products if p.is_active]

    def for_room_type(self, room_type: str) -> list[Product]:
        """Active products that may be placed in that kind of room."""
        return [p for p in self.active_products() if p.fits_room(room_type)]
