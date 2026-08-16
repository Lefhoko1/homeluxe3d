# The admin module

Uploading a model, saying who sells it and where it may stand, then placing it
in the house — without a modeller, a rebuild or a deploy.

## Becoming an admin

There are two kinds, and the policies already tell them apart:

| Role | Sees and edits |
|---|---|
| `platform_admin` | every shop, every scene, every slot |
| shop `owner` / `manager` | their own shop's products only |

An account becomes a platform admin by having its profile promoted. Sign up
through the app first (or use an account that already exists), then:

```sql
update profiles set role = 'platform_admin'
where id = (select id from auth.users where email = 'you@example.com');
```

To give a shop's staff access to their own products instead:

```sql
insert into shop_members (shop_id, user_id, role)
select s.id, u.id, 'manager'
from shops s, auth.users u
where s.slug = 'bradlows' and u.email = 'staff@bradlows.co.bw';
```

`handle_new_user()` creates a profile for every new sign-up. Accounts created
before migration 0001 ran had none — 0005 backfills them.

## Why this needed real auth first

Every table has row-level security on and every write policy resolves through
`auth.uid()`:

```sql
create policy placements_write on placements for all
  using (public.can_manage_shop(shop_id));
```

The old `?admin=true` showed the toolbar to anyone who typed it and authorised
nothing — the first save came back *"new row violates row-level security
policy"*. That was the schema working, not a bug to route around.

## Uploading

The form asks for the shop, the category, the room types it may stand in, the
price, a `.glb`, and photographs. **The model is parsed in the browser before
anything is sent**, which:

- catches a bad export immediately rather than at the next page load
- fills in the dimensions from the geometry — the file already knows how big
  it is
- measures the **anchor**

### The anchor

The placement contract is *origin at the footprint centre, sitting on the
floor, facing +Y*. Everything from `blender/houseluxe` obeys it because the
builder makes it obey. An uploaded file obeys nothing — it may be centred on
its middle, offset by metres, or exported in centimetres.

Rather than rewrite the file (which would decompress any Draco geometry and
make the download bigger), the correction is measured once and stored in
`product_variants.anchor` as `{dx, dy, dz}` in metres. `ProductLoader` wraps
the model in a Group with that offset. A model already built to spec measures
`{0,0,0}` and is unaffected.

## Storage

```
product-models/<shop-slug>/<product-slug>/<variant>.glb
product-media/<shop-slug>/<product-slug>/<n>-<stamp>.jpg
```

Both buckets are **public-read**: `GLTFLoader` and `<img>` fetch without an
Authorization header, and signing every URL would cost a round trip per file
before the scene could draw. There is nothing private about an advert.

Writes are governed by the **first path segment**, which names the owning
shop:

```sql
can_manage_shop_slug((storage.foldername(name))[1])
```

so a shop can read another's files but never write into their folder.

Uploaded assets cannot go in `public/` — that directory is baked into the
build and the filesystem is read-only at runtime.

## Placing

`admin_place_product()` does the whole job in one statement: resolves the room
from the coordinates, finds or creates the slot, inserts or updates the
placement.

One call rather than three inserts from the browser **because they must
agree**. A placement's room comes from its slot and its position from its own
columns; written separately they can disagree, and you get a sofa standing
visibly in a bedroom while the bedroom's list says the room is empty. Nothing
in the 3D view would show that. One statement makes the state unreachable.

The function is **not** `security definer` — the caller's rights are checked by
the same policies as a direct insert.

### The slot follows the object

Drag something into another room and its slot's `room_id` changes with it.
The slot's `code` stays as minted (it is the stable identifier); its `label`
follows the room.

Slots created this way are named `auto-<room>-<hex>`. Removing a placement
deletes an auto slot with it, so no phantom inventory is left behind — a
hand-authored slot is kept, because that one was sold.

### Scoping is enforced

A product scoped to `living` cannot be placed in a bedroom: the trigger from
migration 0002 refuses it. The toolbar translates the error rather than
showing the raw message, which names the product by uuid.

## The editor

| Key | Action |
|---|---|
| `G` | move |
| `R` | rotate (yaw only) |
| `S` | scale (uniform) |
| `Esc` | deselect |

Snapping is 50 mm / 15° / 5%. **Scale is uniform** because `placements.scale`
is one column, not three — a non-uniform gizmo would silently discard two
thirds of what was just done. **Y is locked to the floor** by default, with a
toggle: a free three-axis translate gizmo produces floating furniture far more
reliably than it produces wall units.

The readout shows the millimetres about to be written, because "roughly there"
in a 3D view is 80 mm into a wall.

## What is still missing

- **No self-service sign-up for shops.** A shop is created in SQL, and its
  staff are added in SQL.
- **Variants cannot be added from the UI.** Upload creates one `default`
  variant. A second colourway needs a row.
- **Finishes cannot be uploaded.** Paint, gamazine and tiles are still
  authored in `blender/houseluxe/catalog/shops/`. The schema supports
  uploading them; the form only offers `object` categories.
- **No undo beyond Revert.** Revert restores the transform the object had when
  it was selected; there is no history.
- **Deleting a product removes its files.** Storage does not cascade, so this
  is done in application code and logged rather than thrown if it fails.
