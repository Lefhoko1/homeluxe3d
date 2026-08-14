-- =============================================================================
-- Room scoping and promotions
--
-- Two things the first cut left implicit:
--
--  1. SCOPING. A product declares which KINDS of room it suits, and a room
--     declares its kind. A bath is never offered for the living room. It is a
--     type and not a room on purpose: master, bedroom 2 and bedroom 3 are all
--     "bedroom", because a shop advertises for bedrooms, not for bedroom 3.
--
--  2. PROMOTIONS THAT EXPIRE THEMSELVES. A special carries an end date, and
--     when it passes the product stops being advertised. Nobody should have
--     to remember to take an advert down, and nothing should have to be
--     deleted for it to disappear.
--
-- Run after 0001_init.sql.
-- =============================================================================

create type room_type as enum (
  'living', 'dining', 'kitchen', 'bedroom', 'bathroom',
  'ensuite', 'laundry', 'hallway', 'storage', 'outdoor'
);

-- =============================================================================
-- 1. SCOPING
-- =============================================================================

alter table rooms
  add column room_type room_type not null default 'living';

comment on column rooms.room_type is
  'The scoping key. A type, not an identity: all three bedrooms are "bedroom".';

alter table placement_slots
  add column room_type room_type;

comment on column placement_slots.room_type is
  'Denormalised from the slot''s room so scope can be filtered without a join.';

-- A product suits zero or more room types. NO ROWS MEANS ANY ROOM -- a rug
-- goes anywhere, and forcing every product to enumerate every room would be
-- noise.
create table product_room_types (
  product_id uuid not null references products(id) on delete cascade,
  room_type  room_type not null,
  primary key (product_id, room_type)
);

alter table product_room_types enable row level security;

create policy product_room_types_read on product_room_types
  for select using (exists (
    select 1 from products p where p.id = product_id and (
      (p.status = 'published' and public.shop_is_live(p.shop_id))
      or public.is_shop_member(p.shop_id)
    )
  ));

create policy product_room_types_write on product_room_types
  for all using (exists (
    select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)
  )) with check (exists (
    select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)
  ));

/**
 * Does this product suit this kind of room?
 *
 * No rows for the product means unscoped, which means yes.
 */
create or replace function public.product_fits_room(p_product uuid, p_room room_type)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from product_room_types t where t.product_id = p_product)
      or exists (
        select 1 from product_room_types t
        where t.product_id = p_product and t.room_type = p_room
      );
$$;

-- Enforce it. A placement into a slot the product is not scoped for is a
-- data error, not something to discover in a screenshot.
create or replace function public.check_placement_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product uuid;
  v_room    room_type;
begin
  select p.id into v_product
  from product_variants v join products p on p.id = v.product_id
  where v.id = new.variant_id;

  select coalesce(sl.room_type, r.room_type) into v_room
  from placement_slots sl
  left join rooms r on r.id = sl.room_id
  where sl.id = new.slot_id;

  if v_room is not null and not public.product_fits_room(v_product, v_room) then
    raise exception
      'product % is not scoped for % rooms', v_product, v_room
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger placements_scope_check
  before insert or update of variant_id, slot_id on placements
  for each row execute function public.check_placement_scope();

-- =============================================================================
-- 2. PROMOTIONS
-- =============================================================================

create table promotions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  label       text not null,
  terms       text,
  starts_on   date,
  ends_on     date,
  -- Either a replacement price or a percentage off, not both.
  promo_price_cents integer check (promo_price_cents >= 0),
  percent_off numeric(5,2) check (percent_off > 0 and percent_off < 100),
  created_at  timestamptz not null default now(),
  constraint promo_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint promo_one_discount check (
    promo_price_cents is null or percent_off is null
  )
);

alter table promotions enable row level security;

create policy promotions_read on promotions
  for select using (public.shop_is_live(shop_id) or public.is_shop_member(shop_id));
create policy promotions_write on promotions
  for all using (public.can_manage_shop(shop_id))
  with check (public.can_manage_shop(shop_id));

alter table products
  add column promotion_id uuid references promotions(id) on delete set null;

/** Is the promotion running today? */
create or replace function public.promotion_is_live(p_promo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from promotions pr
    where pr.id = p_promo
      and (pr.starts_on is null or pr.starts_on <= current_date)
      and (pr.ends_on   is null or pr.ends_on   >= current_date)
  );
$$;

/**
 * Should this product be advertised right now?
 *
 * Three independent gates: the product is published, its shop is live and
 * paying, and any attached promotion has not ended. THE EXPIRY IS THE POINT --
 * a special goes dark on its end date with no job to run and nothing deleted.
 */
create or replace function public.product_is_active(p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from products p
    where p.id = p_product
      and p.status = 'published'
      and public.shop_is_live(p.shop_id)
      and (p.promotion_id is null or public.promotion_is_live(p.promotion_id))
  );
$$;

-- =============================================================================
-- 3. READ MODEL
--
-- Replaces v_live_placements with one that filters inactive products and
-- carries the advert detail the click panel needs.
-- =============================================================================

create or replace view v_live_placements as
select
  pl.id                   as placement_id,
  sc.slug                 as scene_slug,
  r.code                  as room_code,
  coalesce(sl.room_type, r.room_type) as room_type,
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
  -- The price actually being advertised.
  case
    when pr.id is null or not public.promotion_is_live(pr.id) then p.price_cents
    when pr.promo_price_cents is not null then pr.promo_price_cents
    when pr.percent_off is not null
      then round(p.price_cents * (1 - pr.percent_off / 100.0))::integer
    else p.price_cents
  end                     as effective_price_cents,
  p.width_mm, p.depth_mm, p.height_mm,
  p.thumbnail_url,
  v.id                    as variant_id,
  v.colour,
  v.model_url,
  v.material_name,
  v.texture_url,
  v.texture_tile_mm,
  pr.label                as promo_label,
  pr.terms                as promo_terms,
  pr.starts_on            as promo_starts_on,
  pr.ends_on              as promo_ends_on,
  (pr.id is not null and public.promotion_is_live(pr.id)) as promo_is_live,
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
where pl.status = 'live'
  and sc.is_published
  and public.product_is_active(p.id);

comment on view v_live_placements is
  'Everything needed to dress a scene AND to show the advert when one is clicked. Inactive products and ended promotions drop out on their own.';

/** What a shop could still sell into: unfilled slots, by room type. */
create or replace view v_available_slots as
select
  sc.slug as scene_slug,
  sl.id, sl.code, sl.label,
  coalesce(sl.room_type, r.room_type) as room_type,
  sl.category_code, sl.kind,
  sl.max_width_mm, sl.max_depth_mm, sl.max_height_mm,
  sl.base_price_cents, sl.is_premium
from placement_slots sl
join scenes sc on sc.id = sl.scene_id
left join rooms r on r.id = sl.room_id
where sl.is_active
  and sc.is_published
  and not exists (
    select 1 from placements pl where pl.slot_id = sl.id and pl.status = 'live'
  );

comment on view v_available_slots is
  'Advertising inventory currently for sale.';
