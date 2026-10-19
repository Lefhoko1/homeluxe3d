"""Bears -- bedding, sleep and home.

The second furniture retailer in the catalogue, and the one that proves the
shape works: nothing outside this directory changed to add it except one line
in `catalog.py` and one placement.

Bears is the RETAILER; Slumberland is a brand it stocks. That distinction is
kept in the product name rather than in a separate field, because it is what a
shopper sees on the ticket -- "Slumberland Maharani" under the Bears banner --
and because inventing a brand table for one product would be inventing a
schema for a guess.
"""

from __future__ import annotations

from ...product import (
    Dimensions,
    Product,
    ProductCategory,
    RoomType,
    Shop,
)
from .beds import QUEEN, build_bed

SHOP = Shop(
    id="bears",
    name="Bears",
    tagline="Beds, bedroom and home",
    currency="BWP",
)

#: A bed is offered for bedrooms and nothing else. Scoping is what stops it
#: being advertised into the living room by an admin in a hurry.
BEDROOMS = (RoomType.BEDROOM,)

PRODUCTS = [
    Product(
        id="slumberland-maharani-queen",
        shop=SHOP,
        category=ProductCategory.BED,
        name="Slumberland Maharani Queen 152cm Pillow-Top Medium Bed Set",
        description=(
            "Pillow-top queen bed set for sleepers up to 120kg, built for "
            "people who want to sink in without losing support underneath. "
            "The quilted pillow top relieves pressure and softens the surface "
            "the moment you lie down, while the Firmalator support system "
            "keeps the mattress stable and the eco-friendly BioRenew layer "
            "eases pressure points without giving up sustainability. "
            "Active Edge support keeps the sides firm so the whole surface "
            "stays usable and the edges do not sag, and it reduces motion "
            "transfer night after night. The cover is soft but hard-wearing "
            "and holds its shape, with Active Shield treatment to keep "
            "allergens and bacteria out of the sleep surface. No flipping "
            "needed -- rotate it occasionally and that is the whole of the "
            "care routine."
        ),
        colour="Charcoal base, pearl pillow top",
        materials=(
            "Firmalator support system",
            "BioRenew comfort layer",
            "Active Edge perimeter support",
            "Active Shield treated cover",
        ),
        price=8999.99,
        sku="711479",
        # Mattress size, and the height of the made-up set off the floor.
        dimensions=Dimensions(QUEEN.width, QUEEN.length, QUEEN.height),
        room_types=BEDROOMS,
        # Bears' own showroom photographs, the ones the model was built from.
        # The generated bed is there so a visitor can walk round it and judge
        # the scale; these are what they look at before spending P9,000.
        thumbnail="/bearsFurnitures/Beds/BedFull.png",
        media=(
            "/bearsFurnitures/Beds/BedFull.png",
            "/bearsFurnitures/Beds/1.png",
            "/bearsFurnitures/Beds/2.png",
            "/bearsFurnitures/Beds/3.png",
            "/bearsFurnitures/Beds/4.png",
            "/bearsFurnitures/Beds/5.png",
        ),
        build=build_bed(QUEEN),
    ),
]
