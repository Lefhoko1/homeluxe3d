"""Bradlows -- the first shop in the catalogue.

Everything here is one retailer's range. A second shop is a sibling package
with the same shape; nothing outside this directory needs to change to add
one.
"""

from __future__ import annotations

from ...product import (
    Dimensions,
    Product,
    ProductCategory,
    Promotion,
    RoomType,
    Shop,
)
from .lounge import (
    DEPTH,
    SofaSpec,
    build_coffee_table,
    build_rug,
    build_sofa,
)
from .media import (
    CONSOLE_D, CONSOLE_H, CONSOLE_W, MEDIA,
    build_television, build_tv_console, build_tv_stand,
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

#: Lounge pieces suit living and dining rooms, and nothing else -- a sofa is
#: not offered for the bathroom.
LOUNGE_ROOMS = (RoomType.LIVING, RoomType.DINING)

#: A television and the unit it stands on suit a lounge OR a bedroom, which
#: is not true of the sofas above -- nobody puts a three-seater in bed 2. The
#: distinction matters: `room_types` is what the catalogue validator checks a
#: placement against, and it refused this pair outright when they carried the
#: lounge's scope and were placed against a bedroom wall.
MEDIA_ROOMS = (RoomType.LIVING, RoomType.DINING, RoomType.BEDROOM)

#: The September media promotion. Both pieces, both ending the same day.
#:
#: PRICES ARE IN RAND on the shop's own tickets and the catalogue is in Pula.
#: They are carried across at face value rather than converted, because a
#: made-up exchange rate is a made-up price -- see the note in migration 0023.
MEDIA_SALE = Promotion(
    label="September media sale",
    starts_on="2026-09-01",
    ends_on="2026-09-16",
    terms="While stocks last. Ends Wednesday, 16 September 2026.",
)

#: A dated special on the suite. When it ends the products stop being
#: advertised on their own; nobody has to remember to take them down.
WINTER_SALE = Promotion(
    label="Winter Lounge Sale -- 20% off the Sandton suite",
    starts_on="2026-06-01",
    ends_on="2026-12-31",
    terms="While stocks last. In-store collection or delivery within Gaborone.",
)

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
        room_types=LOUNGE_ROOMS,
        promotion=WINTER_SALE,
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
        room_types=LOUNGE_ROOMS,
        promotion=WINTER_SALE,
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
        room_types=LOUNGE_ROOMS,
        promotion=WINTER_SALE,
        build=build_sofa(RECLINER),
    ),
    Product(
        id="sansui-50-fhd-google-tv",
        shop=SHOP,
        category=ProductCategory.TELEVISION,
        name="Sansui 50-inch FHD Google TV",
        description=(
            "50-inch full-HD smart television running Google TV, on two "
            "splayed feet. Shown standing on the Juliet media unit."
        ),
        colour="Black",
        materials=("Aluminium bezel", "Polymer feet"),
        price=4499.95,
        sku="000000000010320024",
        dimensions=Dimensions(MEDIA.tv_width, MEDIA.tv_depth, MEDIA.tv_height),
        room_types=MEDIA_ROOMS,
        promotion=MEDIA_SALE,
        # WHAT IS ON THE SCREEN. `texture` is the surface source for any
        # product; for a television the surface is the picture, and
        # products/screens.js hangs a THREE.VideoTexture on it when the URL
        # names a video file.
        #
        # NOT A YOUTUBE LINK, and that is not a shortcut taken. A cross-origin
        # iframe's pixels cannot be read by the page around it -- that is the
        # origin model working, not a gap -- so no frame of a YouTube player
        # can reach a texture. The only way anything gets one is by pulling
        # the underlying stream, which is both against YouTube's terms and
        # somebody else's film.
        #
        # This clip is CC0 -- public domain, free to copy and to serve -- and
        # it is served from this app rather than linked, so the picture does
        # not depend on somebody else's host still answering, and there is no
        # cross-origin request to be refused. See public/media/README.md.
        texture="/media/screen-loop.mp4",
        build=build_television,
    ),
    Product(
        id="juliet-tv-stand",
        shop=SHOP,
        category=ProductCategory.STORAGE,
        name="Juliet TV Stand",
        description=(
            "Black gloss media unit with two cupboards, open centre "
            "shelving and a floating top plank. 1870mm wide."
        ),
        colour="Black gloss",
        materials=("Melamine board", "Chrome handles"),
        price=4999.95,
        sku="000000000010103946",
        dimensions=Dimensions(
            MEDIA.stand_width, MEDIA.stand_depth, MEDIA.stand_height
        ),
        room_types=MEDIA_ROOMS,
        promotion=MEDIA_SALE,
        build=build_tv_stand,
    ),
    Product(
        id="modern-black-tv-console",
        shop=SHOP,
        category=ProductCategory.STORAGE,
        name="Modern Black TV Console",
        description=(
            "Black satin laminate media console, 1845mm wide: two cupboards "
            "on a recessed plinth, an open centre cubby, and a raised top "
            "deck on four supports with cable openings behind it."
        ),
        colour="Black satin",
        materials=("Black laminate", "Brushed aluminium"),
        # NO PRICE. The package that supplied this model gives dimensions,
        # materials and photographs, and no money. A price is the one field
        # on an advert that must never be guessed, so the panel shows the
        # console without one and "Shop this room" leaves it out of the
        # total. Fill it in from the Products screen and both follow.
        price=None,
        dimensions=Dimensions(CONSOLE_W, CONSOLE_D, CONSOLE_H),
        room_types=MEDIA_ROOMS,
        build=build_tv_console,
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
        room_types=LOUNGE_ROOMS,
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
        # Deliberately unscoped: a rug suits any room.
        build=build_rug,
    ),
]
