-- =============================================================================
-- Analytics that can actually be attributed
--
-- `interaction_events` has three columns that say WHOSE event it was --
-- shop_id, variant_id, placement_id -- and 126 rows in which all three are
-- null. Every one is a product_click with no product and no shop attached,
-- because both callers in the browser passed the identity as slugs inside
-- `metadata` and left the foreign keys empty.
--
-- That breaks two things at once. `v_shop_daily_stats` groups by shop_id, so
-- it reported nothing; and the read policy is
--
--     (shop_id is not null) and is_shop_member(shop_id)
--
-- so even a platform admin querying the raw table got an empty list. The one
-- thing a shop is actually buying -- proof that its placement was seen and
-- clicked -- was being recorded in a form that could never be shown to them.
--
-- THE FIX IS NOT "REMEMBER TO PASS IT". A browser knows a placement id; it
-- should not have to also know which shop owns it, and a client that is
-- trusted to say so can say the wrong thing. The database already knows:
-- a placement names its shop and its variant, and a variant names its
-- product, which names its shop. So the row is completed on the way in.
--
-- Run after 0013.
-- =============================================================================

create or replace function public.attribute_interaction()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- From the placement, which is the richest thing a click can name: it
  -- carries the scene, the shop and the exact variant standing in the slot.
  if new.placement_id is not null then
    select coalesce(new.variant_id, p.variant_id),
           coalesce(new.shop_id, p.shop_id),
           coalesce(new.scene_id, p.scene_id)
      into new.variant_id, new.shop_id, new.scene_id
      from placements p
     where p.id = new.placement_id;
  end if;

  -- A click in the product panel has no placement -- nothing was clicked in
  -- the house -- but it does know the variant, and a variant belongs to
  -- exactly one product, which belongs to exactly one shop.
  if new.shop_id is null and new.variant_id is not null then
    select pr.shop_id into new.shop_id
      from product_variants pv
      join products pr on pr.id = pv.product_id
     where pv.id = new.variant_id;
  end if;

  return new;
end;
$$;

comment on function public.attribute_interaction is
  'Fill in whose event this was from the placement or variant it names. The '
  'browser should not have to know which shop owns a placement, and a client '
  'trusted to say so could say the wrong thing.';

drop trigger if exists interaction_events_attribute on interaction_events;
create trigger interaction_events_attribute
  before insert on interaction_events
  for each row execute function public.attribute_interaction();

-- ---------------------------------------------------------------------------
-- And let an admin see the whole picture.
--
-- `is_shop_member` already returns true for a platform admin, so the existing
-- policy was right about WHO. It was the `shop_id is not null` half that hid
-- everything, and that half has to stay: an event with no shop attached
-- belongs to nobody and must not leak to everybody. With the trigger above
-- there will not be any new ones.
-- ---------------------------------------------------------------------------
drop policy if exists events_read on interaction_events;
create policy events_read on interaction_events
  for select using (
    (shop_id is not null and public.is_shop_member(shop_id))
    or public.is_platform_admin()
  );

comment on table interaction_events is
  'What visitors did, attributed to a shop by trigger rather than by the '
  'caller. A shop sees its own; a platform admin sees all of it, including '
  'the unattributed rows left over from before the trigger existed.';
