-- Audio narration (migration 0028): who may record, who may publish, what a
-- visitor sees, and the limits. Run by run_local.sh; every numbered line
-- should read as described, and every "expect refusal" should print an ERROR.
\set ON_ERROR_STOP 0
\pset tuples_only on
-- People: a Bradlows owner, a Tubod owner, a platform admin.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000a')
  on conflict do nothing;
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000b', 'Bradlows owner', 'shop_owner'),
  ('00000000-0000-0000-0000-00000000000c', 'Tubod owner', 'shop_owner'),
  ('00000000-0000-0000-0000-00000000000a', 'Platform', 'platform_admin')
  on conflict (id) do update set role = excluded.role;
insert into shop_members (shop_id, user_id, role)
  select id, '00000000-0000-0000-0000-00000000000b', 'owner' from shops where slug = 'bradlows' on conflict do nothing;
insert into shop_members (shop_id, user_id, role)
  select id, '00000000-0000-0000-0000-00000000000c', 'owner' from shops where slug = 'tubod' on conflict do nothing;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema public to anon, authenticated;

create temp table sofa as select p.id from products p join shops s on s.id = p.shop_id where s.slug = 'bradlows' and p.status = 'published' order by p.slug limit 1;
grant select on sofa to authenticated, anon;
select '1. premier includes it: ' || audio_narration from plans where code = 'premier';
select '2. bradlows (growth, no add-on) has it: ' || public.shop_has_feature(id, 'audio_narration') from shops where slug = 'bradlows';

-- As the Bradlows owner: record a draft.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into product_narrations (product_id) select id from sofa;
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select id, 0, 'front', 'https://x/bradlows/sofa/front.webm', 'bradlows/sofa/front.webm', 14000 from sofa;
select '3. owner recorded a draft clip: ' || count(*) from narration_clips;
\echo '4. publishing without the feature (expect refusal):'
update product_narrations set status = 'published' where product_id = (select id from sofa);
\echo '5. a 31-second clip (expect refusal):'
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select id, 1, 'left', 'u', 'p', 31000 from sofa;
\echo '6. a seventh clip, position 6 (expect refusal):'
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select id, 6, 'left', 'u', 'p', 5000 from sofa;
\echo '7. owner tries to grant themselves the add-on (expect refusal):'
insert into shop_addons (shop_id, feature) select id, 'audio_narration' from shops where slug = 'bradlows';
-- storage: own folder vs another shop's
\echo '8. upload into own folder (expect ok), then into tubod folder (expect refusal):'
insert into storage.objects (bucket_id, name) values ('product-audio', 'bradlows/sofa/front.webm');
insert into storage.objects (bucket_id, name) values ('product-audio', 'tubod/paint/front.webm');
reset role;

-- As Tubod: cannot touch Bradlows' narration.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select '9. tubod sees bradlows clips: ' || count(*) from narration_clips;
\echo '10. tubod adds a clip to the bradlows sofa (expect refusal):'
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select id, 2, 'back', 'u', 'p', 5000 from sofa;
reset role;

-- Platform admin grants the add-on.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into shop_addons (shop_id, feature, notes) select id, 'audio_narration', 'invoice 1' from shops where slug = 'bradlows';
reset role;
select '11. after the add-on, bradlows has it: ' || public.shop_has_feature(id, 'audio_narration') from shops where slug = 'bradlows';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update product_narrations set status = 'published' where product_id = (select id from sofa);
select '12. owner published: ' || status || ', published_at set: ' || (published_at is not null) from product_narrations;
reset role;

set role anon;
set request.jwt.claim.sub = '';
select '13. a visitor sees: ' || qualified_id || ' with ' || jsonb_array_length(clips) || ' clip(s), first ' || (clips->0->>'elevation') || ' ' || (clips->0->>'durationMs') || 'ms' from v_live_narrations;
select '14. a visitor reading the table directly sees: ' || count(*) from narration_clips;
reset role;

-- The add-on lapses: recordings stay, the tour stops playing them.
update shop_addons set active_until = now() - interval '1 minute';
set role anon;
select '15. after the add-on lapses, visitors see: ' || count(*) from v_live_narrations;
reset role;
select '16. ...and the recordings are kept: ' || count(*) from narration_clips;

-- Premier includes it with no add-on.
update shop_subscriptions set plan_id = (select id from plans where code = 'premier')
  where shop_id = (select id from shops where slug = 'bradlows');
set role anon;
select '17. on Premier with no add-on, visitors see: ' || count(*) from v_live_narrations;
reset role;
-- A suspended shop plays nothing even on Premier.
update shops set status = 'suspended' where slug = 'bradlows';
set role anon;
select '18. suspended shop, visitors see: ' || count(*) from v_live_narrations;
reset role;

-- Reordering is one statement, and only the shop's own people can do it.
update shops set status = 'active' where slug = 'bradlows';
update shop_addons set active_until = null;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select product_id, 1, 'left', 'u1', 'p1', 9000 from product_narrations;
insert into narration_clips (product_id, position, elevation, audio_url, audio_path, duration_ms)
  select product_id, 2, 'back', 'u2', 'p2', 8000 from product_narrations;
select '19. before: ' || string_agg(elevation || '@' || position, ', ' order by position) from narration_clips;
select public.reorder_narration_clips(n.product_id, array(select id from narration_clips order by case elevation when 'back' then 0 when 'front' then 1 else 2 end)) from product_narrations n;
select '20. after moving back to the front: ' || string_agg(elevation || '@' || position, ', ' order by position) from narration_clips;
\echo '21. an order missing a clip (expect refusal):'
select public.reorder_narration_clips(n.product_id, array(select id from narration_clips limit 2)) from product_narrations n;
reset role;
