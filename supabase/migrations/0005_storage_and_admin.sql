-- =============================================================================
-- ADMIN MODULE: storage buckets, asset anchoring, and placing by hand
--
-- Until now every product came from Blender: modelled in Python, exported to
-- public/models/, listed in catalog.json. That is the right pipeline for the
-- HOUSE, which is generated. It is the wrong pipeline for a marketplace,
-- where a shop turns up with a .glb of its own sofa and wants it in the
-- living room this afternoon.
--
-- This migration adds the three things that were missing:
--
--   1. Somewhere to put an uploaded file       -- storage buckets + policies
--   2. A way to make an arbitrary .glb behave  -- product_variants.anchor
--   3. A way to place it without a modeller    -- admin_place_product()
--
-- Idempotent, like the others: safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. PROFILE BACKFILL
--
-- handle_new_user() creates a profile for every NEW auth user, but any account
-- that existed before 0001 ran has none -- and with no profile there is no
-- `role`, so is_platform_admin() is false and no policy can ever pass. That
-- looks exactly like a broken login.
-- =============================================================================

insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);


-- =============================================================================
-- 2. HELPERS
-- =============================================================================

-- Storage paths carry a shop SLUG, not a uuid -- `bradlows/sandton-sofa-3/...`
-- is legible in a bucket listing and in a URL, and a uuid is not. So the
-- storage policies need to check rights by slug.
--
-- SECURITY DEFINER for the same reason as the others: a policy that reads
-- shop_members must not re-enter the policy on shop_members.
create or replace function public.can_manage_shop_slug(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shops s
    where s.slug = p_slug and public.can_manage_shop(s.id)
  );
$$;

comment on function public.can_manage_shop_slug is
  'Rights check by shop slug, for storage policies whose only handle on the shop is the first path segment.';


-- Which room contains a point, in scene millimetres.
--
-- This lives in the database rather than in JavaScript because it depends on
-- the room rectangles, which are here. Move a wall in Blender, re-seed the
-- rooms, and placement stays correct without a deploy.
--
-- Returns NULL outside every room -- the yard, the porch, a doorway. That is
-- allowed: an object can stand outside and simply has no room.
create or replace function public.room_at_point(
  p_scene uuid, p_x numeric, p_y numeric
) returns uuid language sql stable set search_path = public as $$
  select r.id
  from rooms r
  where r.scene_id = p_scene
    and r.x0_mm is not null
    and p_x >= r.x0_mm and p_x <= r.x1_mm
    and p_y >= r.y0_mm and p_y <= r.y1_mm
  -- Smallest first: rooms should not overlap, but if a plan ever nests one
  -- inside another the inner room is the honest answer.
  order by (r.x1_mm - r.x0_mm) * (r.y1_mm - r.y0_mm)
  limit 1;
$$;


-- =============================================================================
-- 3. SLOTS MUST BE WRITABLE
--
-- placement_slots had a read policy and no write policy, so with RLS on the
-- default was deny and NOBODY could create one -- not a shop, not an admin.
-- Every slot in the database got there through the seed, which runs as
-- superuser and bypasses policies. The moment a human tries it from the app
-- it fails.
--
-- Slots are inventory the PLATFORM sells, not something a shop should be able
-- to invent for itself, so this is admin-only.
-- =============================================================================

drop policy if exists slots_admin_write on placement_slots;
create policy slots_admin_write on placement_slots
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());


-- =============================================================================
-- 4. ANCHORING AN UPLOADED MODEL
--
-- The placement contract is: origin at the footprint centre, sitting on y=0,
-- facing +Y. Models built by blender/houseluxe obey it because the builder
-- makes them obey it. An uploaded .glb obeys nothing -- exported from any
-- tool it may be centred on its middle, offset by metres, or built in
-- centimetres.
--
-- Two ways to fix that: rewrite the file, or record the correction. Rewriting
-- means re-exporting in the browser, which loses Draco compression and can
-- only make the file bigger. So we record it: the offset is measured from the
-- bounding box once, at upload, and the loader applies it every time.
--
--   anchor = {"dx": .., "dy": .., "dz": ..}   metres, three.js axes
--
-- A model already built to spec measures {0,0,0} and behaves exactly as it
-- does today, so nothing existing changes.
-- =============================================================================

alter table product_variants
  add column if not exists anchor jsonb;

comment on column product_variants.anchor is
  'Correction applied when loading: {dx,dy,dz} in metres, three.js axes. Moves the model so its footprint centre sits at the origin on the floor. NULL means none needed.';

-- What the file actually is, measured at upload. Useful in the admin list
-- ("why is this scene slow?") and to reject a 2-million-triangle sofa before
-- a visitor downloads it.
alter table product_variants
  add column if not exists model_bytes    bigint,
  add column if not exists triangle_count integer;


-- =============================================================================
-- 5. PLACING A PRODUCT BY HAND
--
-- One call does the whole job: resolve the room from the coordinates, find or
-- create the slot, insert or update the placement.
--
-- Why a function rather than three inserts from the browser? Because they
-- must agree. A placement whose slot points at a different room than its
-- coordinates shows up in the wrong room list, and there is no way to notice
-- from the 3D view. Keeping it in one statement makes that state unreachable.
--
-- NOT security definer. The caller's rights are checked by the same policies
-- as a direct insert -- this is a convenience, not a back door.
-- =============================================================================

create or replace function public.admin_place_product(
  p_scene_slug    text,
  p_variant       uuid,
  p_x_mm          numeric,
  p_y_mm          numeric,
  p_z_mm          numeric default 0,
  p_rotation_deg  numeric default 0,
  p_scale         numeric default 1,
  p_placement     uuid    default null,
  p_note          text    default null,
  p_status        text    default 'live'
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_scene     uuid;
  v_shop      uuid;
  v_kind      product_kind;
  v_category  text;
  v_room      uuid;
  v_room_code text;
  v_slot      uuid;
  v_slot_code text;
  v_id        uuid;
begin
  select id into v_scene from scenes where slug = p_scene_slug;
  if v_scene is null then
    raise exception 'unknown scene %', p_scene_slug using errcode = 'no_data_found';
  end if;

  select p.shop_id, p.category_code, c.kind
    into v_shop, v_category, v_kind
  from product_variants v
  join products p            on p.id = v.product_id
  join product_categories c  on c.code = p.category_code
  where v.id = p_variant;

  if v_shop is null then
    raise exception 'unknown variant %', p_variant using errcode = 'no_data_found';
  end if;

  v_room := public.room_at_point(v_scene, p_x_mm, p_y_mm);
  select code into v_room_code from rooms where id = v_room;

  if p_placement is not null then
    -- MOVING something already placed.
    select slot_id into v_slot from placements where id = p_placement;
  end if;

  if v_slot is null then
    -- New position: mint a slot for it. The slot is the sellable unit, so
    -- even a hand-placed object becomes inventory that can be re-sold when
    -- this shop's campaign ends.
    v_slot_code := 'auto-' || coalesce(v_room_code, 'outside') || '-'
                   || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into placement_slots
      (scene_id, room_id, code, label, category_code, kind,
       x_mm, y_mm, z_mm, rotation_deg, notes)
    values
      (v_scene, v_room, v_slot_code,
       initcap(coalesce(v_room_code, 'outside')) || ' position',
       v_category, v_kind,
       p_x_mm, p_y_mm, p_z_mm, p_rotation_deg,
       'Created by the admin placement tool.')
    returning id into v_slot;
  else
    -- THE SLOT FOLLOWS THE OBJECT. Drag a sofa from the living room into a
    -- bedroom and its room must change with it, because the room lists read
    -- the slot's room and not the placement's coordinates.
    update placement_slots
       set room_id      = v_room,
           x_mm         = p_x_mm,
           y_mm         = p_y_mm,
           z_mm         = p_z_mm,
           rotation_deg = p_rotation_deg,
           -- The CODE stays as it was minted: it is the slot's stable
           -- identifier and other rows may reference it. The LABEL follows
           -- the room, so an inventory listing does not describe a dining
           -- room position as a living room one.
           label        = case
                            when code like 'auto-%'
                              then initcap(coalesce(v_room_code, 'outside')) || ' position'
                            else label
                          end
     where id = v_slot;
  end if;

  if p_placement is null then
    insert into placements
      (scene_id, slot_id, variant_id, shop_id,
       x_mm, y_mm, z_mm, rotation_deg, scale, status, note)
    values
      (v_scene, v_slot, p_variant, v_shop,
       p_x_mm, p_y_mm, p_z_mm, p_rotation_deg, p_scale,
       p_status::placement_status, p_note)
    returning id into v_id;
  else
    update placements
       set slot_id      = v_slot,
           variant_id   = p_variant,
           x_mm         = p_x_mm,
           y_mm         = p_y_mm,
           z_mm         = p_z_mm,
           rotation_deg = p_rotation_deg,
           scale        = p_scale,
           status       = p_status::placement_status,
           note         = coalesce(p_note, note)
     where id = p_placement
    returning id into v_id;

    if v_id is null then
      raise exception 'placement % not found, or not yours', p_placement
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.admin_place_product is
  'Place or move a product variant in a scene. Resolves the room from the coordinates, keeps the slot in step, and returns the placement id.';


-- Removing a placement should not leave its auto-generated slot behind as
-- phantom inventory. A hand-authored slot is kept -- that one was sold.
create or replace function public.admin_remove_placement(p_placement uuid)
returns void language plpgsql set search_path = public as $$
declare v_slot uuid; v_code text;
begin
  select slot_id into v_slot from placements where id = p_placement;
  delete from placements where id = p_placement;

  if v_slot is not null then
    select code into v_code from placement_slots where id = v_slot;
    if v_code like 'auto-%' then
      delete from placement_slots where id = v_slot;
    end if;
  end if;
end;
$$;


-- =============================================================================
-- 6. STORAGE
--
-- Uploaded assets cannot live in public/ -- that directory is baked into the
-- build and the filesystem is read-only at runtime. They go in buckets.
--
-- Both are PUBLIC-READ, deliberately: GLTFLoader and <img> fetch without an
-- Authorization header, and signing every URL would mean the 3D scene could
-- not load a model without a round trip per file. There is nothing private
-- about an advert.
--
-- Writes are another matter. The path convention is
--
--     <shop-slug>/<product-slug>/<file>
--
-- so the first segment names the owner, and the policy checks the caller can
-- manage that shop. A shop cannot write into another shop's folder even
-- though it can read it.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-models', 'product-models', true, 26214400,
   array['model/gltf-binary', 'application/octet-stream']),
  ('product-media',  'product-media',  true, 8388608,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read. Note this is scoped to OUR buckets by bucket_id -- the
-- other buckets in this project belong to a different application and are
-- left exactly as they are.
drop policy if exists homeluxe_assets_read on storage.objects;
create policy homeluxe_assets_read on storage.objects
  for select to public
  using (bucket_id in ('product-models', 'product-media'));

drop policy if exists homeluxe_assets_insert on storage.objects;
create policy homeluxe_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-models', 'product-media')
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );

drop policy if exists homeluxe_assets_update on storage.objects;
create policy homeluxe_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('product-models', 'product-media')
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );

drop policy if exists homeluxe_assets_delete on storage.objects;
create policy homeluxe_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('product-models', 'product-media')
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );


-- =============================================================================
-- 7. THE READ VIEW CARRIES THE NEW FIELDS
--
-- `anchor` so the loader can correct an uploaded model, and `media_urls` so
-- the advert panel has pictures. The thumbnail was already selected here and
-- carried all the way to the browser, where nothing rendered it.
--
-- Dropped and recreated rather than replaced: `create or replace view` cannot
-- change the column list except by appending, and this is easier to reason
-- about than remembering which end is safe.
-- =============================================================================

drop view if exists v_live_placements;

create view v_live_placements as
select
  pl.id                   as placement_id,
  sc.slug                 as scene_slug,
  r.code                  as room_code,
  coalesce(sl.room_type, r.room_type) as room_type,
  sl.material_name        as slot_material_name,
  s.slug                  as shop_slug,
  s.name                  as shop_name,
  s.phone                 as shop_phone,
  s.email                 as shop_email,
  s.currency,
  p.id                    as product_id,
  s.slug || '.' || p.slug as qualified_id,
  p.name                  as product_name,
  p.description,
  p.category_code,
  p.sku,
  p.price_cents,
  case
    when pr.id is null or not public.promotion_is_live(pr.id) then p.price_cents
    when pr.promo_price_cents is not null then pr.promo_price_cents
    when pr.percent_off is not null
      then round(p.price_cents * (1 - pr.percent_off / 100.0))::integer
    else p.price_cents
  end                     as effective_price_cents,
  p.width_mm, p.depth_mm, p.height_mm,
  p.thumbnail_url,
  -- Every image for the product, thumbnail first, for the advert gallery.
  array(
    select m.url from product_media m
    where m.product_id = p.id and m.kind = 'image'
    order by m.sort_order, m.id
  )                       as media_urls,
  v.id                    as variant_id,
  v.slug                  as variant_slug,
  v.name                  as variant_name,
  v.colour,
  v.model_url,
  v.material_name,
  v.texture_url,
  v.texture_tile_mm,
  v.anchor,
  pr.label                as promo_label,
  pr.terms                as promo_terms,
  pr.starts_on            as promo_starts_on,
  pr.ends_on              as promo_ends_on,
  (pr.id is not null and public.promotion_is_live(pr.id)) as promo_is_live,
  b.code                  as batch_code,
  b.day_part,
  array(
    select t.room_type::text from product_room_types t where t.product_id = p.id
  )                       as room_types,
  coalesce(pl.x_mm, sl.x_mm)                 as x_mm,
  coalesce(pl.y_mm, sl.y_mm)                 as y_mm,
  coalesce(pl.z_mm, sl.z_mm)                 as z_mm,
  coalesce(pl.rotation_deg, sl.rotation_deg) as rotation_deg,
  pl.scale,
  pl.note
from placements pl
join scenes sc              on sc.id = pl.scene_id
join product_variants v     on v.id = pl.variant_id
join products p             on p.id = v.product_id
join shops s                on s.id = pl.shop_id
left join promotions pr     on pr.id = p.promotion_id
left join placement_slots sl on sl.id = pl.slot_id
left join rooms r           on r.id = sl.room_id
left join ad_batches b      on b.id = pl.batch_id
where pl.status = 'live'
  and sc.is_published
  and public.product_is_active(p.id)
  and (pl.batch_id is null or public.batch_is_live(pl.batch_id));


-- =============================================================================
-- 8. WHAT AN ADMIN MANAGES
--
-- The catalogue view above only shows what is LIVE. An admin needs the
-- opposite: everything, including drafts, unplaced products and products with
-- no model yet -- because those are the ones needing attention.
-- =============================================================================

create or replace view v_admin_products as
select
  p.id                    as product_id,
  s.id                    as shop_id,
  s.slug                  as shop_slug,
  s.name                  as shop_name,
  s.currency,
  p.slug,
  s.slug || '.' || p.slug as qualified_id,
  p.name,
  p.description,
  p.category_code,
  p.status,
  p.price_cents,
  p.width_mm, p.depth_mm, p.height_mm,
  p.thumbnail_url,
  p.created_at,
  array(
    select t.room_type::text from product_room_types t where t.product_id = p.id
  )                       as room_types,
  (select count(*) from product_variants v where v.product_id = p.id)
                          as variant_count,
  (select count(*) from product_media m where m.product_id = p.id)
                          as media_count,
  (select count(*) from product_variants v
     where v.product_id = p.id and v.model_url is not null)
                          as model_count,
  (select count(*) from placements pl
     join product_variants v on v.id = pl.variant_id
    where v.product_id = p.id and pl.status = 'live')
                          as live_placements
from products p
join shops s on s.id = p.shop_id;

comment on view v_admin_products is
  'Every product a caller may manage, live or not. RLS on products decides which rows appear.';
