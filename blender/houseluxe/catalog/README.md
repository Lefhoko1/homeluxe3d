# Catalogue — shops, products, placements

Everything visible in a house is an advertisement for something a shop sells:
the sofa, the tiles, the paint, the bath, the television. This package is the
structure that makes that true in the data.

```
catalog/
  product.py            Shop, Product, ProductCategory, Placement, Catalog
  catalog.py            the assembled CATALOG — one place lists every shop
  staging.py            moves built products into placements for the .blend
  shops/
    bradlows/
      __init__.py       SHOP + PRODUCTS (the range)
      lounge.py         geometry builders for the lounge suite
  placements/
    house_3bed.py       what stands where, in that house
```

## The three things, kept apart

| | knows | does not know |
|---|---|---|
| **Shop** | who sells it | anything about geometry |
| **Product** | dimensions, price, how to build it | where it is |
| **Placement** | where one instance stands, in which house and room | how to build anything |

A `Product` never knows where it is. A `Placement` never knows how to build
geometry. That split is what lets the same sofa appear in three houses, and
lets a house be re-dressed with a different shop's range without touching
either the geometry or the building.

## Organised by shop, then by house

Products are grouped by **shop** (`shops/bradlows/`), because that is who is
advertising. Placements are grouped by **house** (`placements/house_3bed.py`),
because that is where the advert appears. The catalogue joins them.

Adding a shop is a sibling package under `shops/` plus one line in
`catalog.py`. Nothing else changes.

## Products build at the origin

Every product builds with its **footprint centred on (0, 0), underside at
z = 0, facing +Y**. Placements assume it, so a product that ignores the
convention lands in the wrong place.

Position is never baked into the mesh. Baking it would mean re-exporting the
sofa every time it slides across the room, and shipping the same sofa three
times if it appears three times. Instead each product exports **one** model:

```
public/models/products/<shop>/<product>.glb
public/models/products/catalog.json
```

The manifest carries shops, prices, SKUs and per-house placements, with
positions already converted to three.js space so the app does no coordinate
maths. Move a sofa here, rebuild, and it moves in the app — no code change.

## Staging

Because products build at the origin they sit stacked on top of each other,
which is right for export and useless for looking at. `staging.py` runs
**after** export and moves each into its placement, so the saved `.blend`
shows a furnished house. Exported models are unaffected.

A product placed more than once is duplicated with **linked mesh data**, so
ten dining chairs cost one mesh.

## Categories

`ProductCategory` covers more than furniture, because a house advertises its
finishes too — `TILE`, `PAINT`, `BRICK`, `FLOORING`, `ROOFING`. Those are
flagged `is_finish`: they dress a surface rather than being placed, so they
carry no geometry and no placement. Wiring a finish to the material it drives
is not built yet — see the gap below.

## Known gaps

- **Finishes are declared but not wired.** `ProductCategory.TILE` and friends
  exist, but nothing yet links "the tile in the bathroom" to a shop's product.
  That needs a mapping from material name to product id.
- **Only Bradlows.** One shop, five products, one house.
- **Scatter cushions are part of the sofa model**, not their own SKU. In a real
  catalogue they would be separately purchasable.
- **No product variants.** One colourway per product; a leather range would
  need a variant axis on `Product`.
- **Placement is not collision-checked.** Two products can be placed
  overlapping and the build will not complain.
