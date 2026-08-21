-- =============================================================================
-- Rooms name and order themselves
--
-- `v_live_placements` carried a room CODE -- `master`, `wir`, `bed2` -- and
-- nothing else about the room. So the browser kept its own table:
--
--     const ROOM_LABELS = {
--       master: { label: "Master Bedroom", icon: "🛏️" },
--       wir:    { label: "Walk-in Robe",   icon: "👔" },
--       ...
--     };
--
-- Thirteen room names typed into a JavaScript file, beside a database that
-- already knew all thirteen -- `rooms.name` has said "Master Bedroom" since
-- the first migration. Two places holding the same fact is one place waiting
-- to be wrong, and it already was: the plan grew a fourth bedroom and a
-- garage, and neither was in that table, so the room strip showed them as the
-- raw codes `bed4` and `garage`.
--
-- THE ORDER WAS INVENTED TOO. The browser sorted room codes alphabetically --
-- bathroom, bed2, bed3, bed4, dining, ensuite -- which is nobody's idea of a
-- route through a house. `rooms.sort_order` is the order the plan lists them
-- in, which is roughly the order you would walk them.
--
-- And the shop's logo comes along, because the browser had a second lookup
-- table of the same kind: an emoji per shop slug, which a fourth shop was
-- never going to be in.
--
-- THIS IS A COPY OF THE EXISTING VIEW WITH THREE COLUMNS ADDED. It was
-- tempting to retype it from memory; the first attempt at that invented
-- `promotions.product_id` (it is `products.promotion_id`), joined shops
-- through the product rather than the placement, and rewrote the WHERE clause
-- into something subtly different. Everything below the select list is
-- verbatim from `pg_get_viewdef`.
--
-- Run after 0017.
-- =============================================================================

create or replace view v_live_placements as
select pl.id as placement_id,
       sc.slug as scene_slug,
       r.code as room_code,
       coalesce(sl.room_type, r.room_type) as room_type,
       sl.material_name as slot_material_name,
       s.slug as shop_slug,
       s.name as shop_name,
       s.phone as shop_phone,
       s.email as shop_email,
       s.currency,
       p.id as product_id,
       (s.slug || '.'::text) || p.slug as qualified_id,
       p.name as product_name,
       p.description,
       p.category_code,
       p.sku,
       p.price_cents,
       case
         when pr.id is null or not promotion_is_live(pr.id) then p.price_cents
         when pr.promo_price_cents is not null then pr.promo_price_cents
         when pr.percent_off is not null
           then round(p.price_cents::numeric * (1::numeric - pr.percent_off / 100.0))::integer
         else p.price_cents
       end as effective_price_cents,
       p.width_mm,
       p.depth_mm,
       p.height_mm,
       p.thumbnail_url,
       array( select m.url
                from product_media m
               where m.product_id = p.id and m.kind = 'image'::text
               order by m.sort_order, m.id) as media_urls,
       v.id as variant_id,
       v.slug as variant_slug,
       v.name as variant_name,
       v.colour,
       v.model_url,
       v.material_name,
       v.texture_url,
       v.texture_tile_mm,
       v.anchor,
       pr.label as promo_label,
       pr.terms as promo_terms,
       pr.starts_on as promo_starts_on,
       pr.ends_on as promo_ends_on,
       pr.id is not null and promotion_is_live(pr.id) as promo_is_live,
       b.code as batch_code,
       b.day_part,
       array( select t.room_type::text as room_type
                from product_room_types t
               where t.product_id = p.id) as room_types,
       coalesce(pl.x_mm, sl.x_mm) as x_mm,
       coalesce(pl.y_mm, sl.y_mm) as y_mm,
       coalesce(pl.z_mm, sl.z_mm) as z_mm,
       coalesce(pl.rotation_deg, sl.rotation_deg) as rotation_deg,
       pl.scale,
       pl.note,

       -- APPENDED, NOT INSERTED. `create or replace view` may add columns at
       -- the end and may not move or rename the ones already there -- putting
       -- these beside `room_code` where they belong got
       -- "cannot change name of view column room_type to room_name", because
       -- Postgres matches the list by POSITION. Readability loses to not
       -- dropping and recreating a view that four other things select from.
       r.name as room_name,
       r.sort_order as room_sort,
       s.logo_url as shop_logo_url
  from placements pl
  join scenes sc on sc.id = pl.scene_id
  join product_variants v on v.id = pl.variant_id
  join products p on p.id = v.product_id
  join shops s on s.id = pl.shop_id
  left join promotions pr on pr.id = p.promotion_id
  left join placement_slots sl on sl.id = pl.slot_id
  left join rooms r on r.id = sl.room_id
  left join ad_batches b on b.id = pl.batch_id
 where pl.status = 'live'::placement_status
   and sc.is_published
   and product_is_active(p.id)
   and (pl.batch_id is null or batch_is_live(pl.batch_id));

comment on view v_live_placements is
  'What a visitor sees, with the room named and ordered by the database '
  'rather than by a lookup table in the browser.';
