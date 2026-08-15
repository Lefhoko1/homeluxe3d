-- =============================================================================
-- Expose the SURFACE a finish dresses
--
-- A finish placement joins two different material names:
--
--   the SLOT's   -- `wall.living`, the surface Blender baked into the mesh
--   the VARIANT's -- `paint_interior_chalk`, what the shop is selling
--
-- The view only carried the variant's, so the app knew what was being sold but
-- not what to paint with it. For floors the two happened to be equal, which
-- hid the problem; for walls they never are, and that is the whole point --
-- it is what lets a wall be repainted with a different product.
-- =============================================================================

create or replace view v_live_placements as
select
  pl.id                   as placement_id,
  sc.slug                 as scene_slug,
  r.code                  as room_code,
  coalesce(sl.room_type, r.room_type) as room_type,
  -- The surface being dressed. NULL for a placed object.
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
  v.id                    as variant_id,
  v.slug                  as variant_slug,
  v.name                  as variant_name,
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
