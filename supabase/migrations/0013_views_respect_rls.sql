-- =============================================================================
-- Views were bypassing row-level security
--
-- Every policy written since 0004 -- and there are forty-odd of them -- guards
-- a TABLE. None of them was doing anything when the read came through a view,
-- because a Postgres view runs as its OWNER unless it is told otherwise, and
-- every view here is owned by `postgres`. So the policy on `products` said
-- "published, or you are a member of the shop", and `v_admin_products` said
-- everything, to everybody.
--
-- Found by asking the question directly rather than by reading the schema:
--
--     set role anon;                        -- signed in as nobody at all
--     select count(*) from v_admin_products;
--     -- 12
--
-- What actually leaked was mild -- all twelve rows happened to be published
-- products, which are public anyway. What COULD leak was not:
--
--   v_shop_daily_stats   one shop's views, clicks and enquiries per day,
--                        readable by its competitors and by the open internet
--   v_content_queue      briefs, quoted prices and due dates for work shops
--                        are paying to have done
--   v_admin_products     drafts, and anything unpublished, the moment one
--                        exists
--
-- The underlying tables were right the whole time. `interaction_events` is
-- `is_shop_member(shop_id)`, `content_requests` is member-or-product.read,
-- `products` is published-or-member. Turning on security_invoker makes the
-- view use the CALLER's rights, so all three start applying, and no policy
-- has to be rewritten.
--
-- The three public views are deliberately left as they are. v_live_placements,
-- v_current_scene and v_available_slots exist to be read by a visitor who is
-- signed in as nobody -- that is the showroom -- and they expose only what is
-- already published. Their definer rights are the point, not an oversight.
--
-- Run after 0012.
-- =============================================================================

alter view v_admin_products    set (security_invoker = on);
alter view v_content_queue     set (security_invoker = on);
alter view v_shop_daily_stats  set (security_invoker = on);
alter view v_batch_schedule    set (security_invoker = on);

-- A SECOND HOLE, SMALLER AND SILLIER. Supabase grants the anon and
-- authenticated roles everything on new objects in public, so all seven views
-- carried INSERT, UPDATE, DELETE and TRUNCATE for the general public. A view
-- over a join is not auto-updatable so most of those writes would have failed
-- on their way in -- but "it fails for an unrelated reason" is not a
-- permission model. Nothing in this application writes through a view.
do $do$
declare v text;
begin
  foreach v in array array[
    'v_admin_products', 'v_content_queue', 'v_shop_daily_stats',
    'v_batch_schedule', 'v_live_placements', 'v_current_scene',
    'v_available_slots'
  ] loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger '
      'on public.%I from anon, authenticated', v
    );
  end loop;
end $do$;

-- And the admin views are not for the general public to read AT ALL. Invoker
-- rights already cut them down to what the caller may see; this says the
-- unauthenticated caller has no business asking. Defence in depth, and it
-- costs nothing -- every reader of these is signed in.
revoke select on public.v_admin_products   from anon;
revoke select on public.v_content_queue    from anon;
revoke select on public.v_shop_daily_stats from anon;

comment on view v_admin_products is
  'Every product a caller may administer, with counts. security_invoker: the '
  'products policy decides what is in it, not the view owner.';
