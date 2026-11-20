-- =============================================================================
-- AUDIO NARRATION: shops talk the visitor through their product
-- =============================================================================
--
-- A shop records short clips about a product -- one per ELEVATION, the same
-- front / side / back views the model was generated from -- and the guided
-- tour plays them when it reaches the product, turning the camera to each
-- elevation as its clip plays. The audio sets the timing: the tour stays on
-- the product until the shop has finished talking.
--
-- IT IS A PAID FEATURE, sold two ways:
--
--   * included in a plan     plans.audio_narration (Premier has it)
--   * bought as an add-on    shop_addons, one row per shop and feature
--
-- and it plays only while the shop is live AND entitled. A shop whose add-on
-- lapses keeps its recordings -- nothing is deleted -- but the tour stops
-- playing them until it is renewed.
--
-- LIMITS, agreed with the platform owner: at most SIX clips per product, at
-- most THIRTY SECONDS each. Enforced here, not only in the browser, because a
-- limit that lives only in a form is a suggestion.
--
--   1. plans.audio_narration
--   2. shop_addons, and shop_has_feature()
--   3. product_narrations + narration_clips, with RLS
--   4. the product-audio storage bucket
--   5. v_live_narrations, what the showroom reads
--
-- Run after 0027.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Plans can include it
-- -----------------------------------------------------------------------------

alter table plans
  add column if not exists audio_narration boolean not null default false;

comment on column plans.audio_narration is
  'Shops on this plan may publish audio narration for their products.';

update plans set audio_narration = true where code = 'premier';


-- -----------------------------------------------------------------------------
-- 2. Or it can be bought on its own
-- -----------------------------------------------------------------------------
--
-- A general table rather than a column per feature, because the logo intro,
-- pointers and whatever comes next are sold the same way. `feature` is
-- checked against a list so a typo cannot quietly grant nothing.

create table if not exists shop_addons (
  shop_id      uuid not null references shops(id) on delete cascade,
  feature      text not null check (feature in ('audio_narration')),
  active_from  timestamptz not null default now(),
  active_until timestamptz,                 -- null: until switched off
  notes        text,                        -- e.g. the invoice it was paid on
  created_by   uuid references profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (shop_id, feature)
);

comment on table shop_addons is
  'Features a shop has bought separately from its plan. Granted by a platform administrator.';

drop trigger if exists shop_addons_updated_touch on shop_addons;
create trigger shop_addons_updated_touch before update on shop_addons
  for each row execute function public.touch_updated_at();

alter table shop_addons enable row level security;

-- A shop can see what it has bought; only the platform grants it.
drop policy if exists shop_addons_read on shop_addons;
create policy shop_addons_read on shop_addons
  for select using (public.is_shop_member(shop_id));

drop policy if exists shop_addons_admin on shop_addons;
create policy shop_addons_admin on shop_addons
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Is a paid feature switched on for this shop right now? Live first: a shop
-- that is suspended or not paying is not advertised at all, so nothing it
-- bought plays either.
create or replace function public.shop_has_feature(p_shop uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.shop_is_live(p_shop) and (
    exists (
      select 1
      from shop_subscriptions sub
      join plans pl on pl.id = sub.plan_id
      where sub.shop_id = p_shop
        and sub.status in ('trialing', 'active')
        and case p_feature
              when 'audio_narration' then pl.audio_narration
              else false
            end
    )
    or exists (
      select 1
      from shop_addons a
      where a.shop_id = p_shop
        and a.feature = p_feature
        and a.active_from <= now()
        and (a.active_until is null or a.active_until > now())
    )
  );
$$;

comment on function public.shop_has_feature is
  'True while the shop is live and its plan includes the feature, or it has a current add-on for it.';


-- -----------------------------------------------------------------------------
-- 3. The narration itself
-- -----------------------------------------------------------------------------

-- Which shop a product belongs to, for policies on tables that only know the
-- product. Security definer for the usual reason: a policy must not re-enter
-- the policies on `products`.
create or replace function public.product_shop(p_product uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from products where id = p_product;
$$;

-- One per product: whether the shop has published what it recorded. Clips
-- can be recorded, replayed and re-recorded as a draft; nothing plays on the
-- tour until this says so.
create table if not exists product_narrations (
  product_id   uuid primary key references products(id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_by   uuid references profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists product_narrations_updated_touch on product_narrations;
create trigger product_narrations_updated_touch before update on product_narrations
  for each row execute function public.touch_updated_at();

-- The clips, in the order they play. `position` 0..5 and unique per product
-- is what holds the six-clip limit; `duration_ms` is the thirty seconds, with
-- half a second's grace for a recorder that stops a frame late.
create table if not exists narration_clips (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references product_narrations(product_id) on delete cascade,
  position    smallint not null check (position between 0 and 5),
  elevation   text not null
              check (elevation in ('front', 'left', 'right', 'back', 'top', 'detail')),
  audio_url   text not null,
  audio_path  text not null,               -- storage path, for deleting it
  duration_ms integer not null check (duration_ms between 500 and 30500),
  -- The elevation photograph the model was made from, shown beside the 3D
  -- view while this clip plays. Optional: not every product has one.
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, position) deferrable initially deferred
);

create index if not exists narration_clips_product on narration_clips (product_id, position);

drop trigger if exists narration_clips_updated_touch on narration_clips;
create trigger narration_clips_updated_touch before update on narration_clips
  for each row execute function public.touch_updated_at();

alter table product_narrations enable row level security;
alter table narration_clips    enable row level security;

-- Read: the shop's own people always (to edit), everyone else only through
-- v_live_narrations below. Write: whoever can manage the shop.
drop policy if exists product_narrations_member_read on product_narrations;
create policy product_narrations_member_read on product_narrations
  for select using (public.is_shop_member(public.product_shop(product_id)));

drop policy if exists product_narrations_manage on product_narrations;
create policy product_narrations_manage on product_narrations
  for all using (public.can_manage_shop(public.product_shop(product_id)))
  with check (public.can_manage_shop(public.product_shop(product_id)));

drop policy if exists narration_clips_member_read on narration_clips;
create policy narration_clips_member_read on narration_clips
  for select using (public.is_shop_member(public.product_shop(product_id)));

drop policy if exists narration_clips_manage on narration_clips;
create policy narration_clips_manage on narration_clips
  for all using (public.can_manage_shop(public.product_shop(product_id)))
  with check (public.can_manage_shop(public.product_shop(product_id)));

-- PUBLISHING NEEDS THE FEATURE. A shop without it can still record -- it can
-- hear what it would be buying -- but cannot switch it on.
create or replace function public.narration_publish_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not public.shop_has_feature(public.product_shop(new.product_id), 'audio_narration') then
      raise exception 'Audio narration is not part of this shop''s plan. Upgrade, or add it as an add-on, to publish.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from narration_clips c where c.product_id = new.product_id) then
      raise exception 'Record at least one clip before publishing.' using errcode = 'P0001';
    end if;
    new.published_at := now();
  end if;
  return new;
end;
$$;

-- REORDERING IS ONE STATEMENT. Moving clip 3 to the front renumbers several
-- clips, and done as separate updates from the browser, two of them share a
-- position in between and the unique constraint refuses the second. One
-- UPDATE, with the constraint deferred to the end of it, never has that
-- moment. Also used after a delete, to close the gap.
--
-- Security INVOKER: the caller's own rights apply, so the RLS policies above
-- decide who may reorder -- this adds no power, only atomicity.
create or replace function public.reorder_narration_clips(p_product uuid, p_clip_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if (select count(*) from narration_clips where product_id = p_product)
     <> coalesce(array_length(p_clip_ids, 1), 0) then
    raise exception 'The new order must list every clip of the product exactly once.'
      using errcode = 'P0001';
  end if;
  update narration_clips c
     set position = o.ord - 1
    from unnest(p_clip_ids) with ordinality as o(id, ord)
   where c.id = o.id and c.product_id = p_product;
end;
$$;

drop trigger if exists product_narrations_publish_guard on product_narrations;
create trigger product_narrations_publish_guard
  before insert or update on product_narrations
  for each row execute function public.narration_publish_guard();


-- -----------------------------------------------------------------------------
-- 4. Where the recordings go
-- -----------------------------------------------------------------------------
--
-- Same rules as product-models and product-media (0005): public read, because
-- the browser's <audio> fetches with no Authorization header and there is
-- nothing private about an advert; writes only into a shop's own folder,
--
--     <shop-slug>/<product-slug>/<clip>.<ext>
--
-- 6 MB is far more than thirty seconds of speech in any format a browser
-- records (Opus is ~100 KB), and still allows an uploaded WAV.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-audio', 'product-audio', true, 6291456,
   array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac',
         'audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists spacivelle_audio_read on storage.objects;
create policy spacivelle_audio_read on storage.objects
  for select to public
  using (bucket_id = 'product-audio');

drop policy if exists spacivelle_audio_insert on storage.objects;
create policy spacivelle_audio_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-audio'
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );

drop policy if exists spacivelle_audio_update on storage.objects;
create policy spacivelle_audio_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-audio'
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );

drop policy if exists spacivelle_audio_delete on storage.objects;
create policy spacivelle_audio_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-audio'
    and public.can_manage_shop_slug((storage.foldername(name))[1])
  );


-- -----------------------------------------------------------------------------
-- 5. What the showroom reads
-- -----------------------------------------------------------------------------
--
-- Definer rights ON PURPOSE, like v_live_placements (see 0013): a visitor is
-- signed in as nobody, and the view itself is the filter -- published, the
-- product published, the shop live and entitled. Nothing a shop has only
-- drafted, and nothing from a shop that has stopped paying, gets out.
--
-- Read separately from the published scene snapshot, so a shop can record
-- and publish narration without an administrator republishing the house.

create or replace view v_live_narrations as
select
  s.slug || '.' || p.slug as qualified_id,
  p.id                    as product_id,
  s.slug                  as shop_slug,
  s.name                  as shop_name,
  s.logo_url              as shop_logo_url,
  n.published_at,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'position',   c.position,
              'elevation',  c.elevation,
              'audioUrl',   c.audio_url,
              'durationMs', c.duration_ms,
              'imageUrl',   c.image_url
            ) order by c.position)
       from narration_clips c
      where c.product_id = p.id),
    '[]'::jsonb
  )                       as clips
from product_narrations n
join products p on p.id = n.product_id
join shops s    on s.id = p.shop_id
where n.status = 'published'
  and p.status = 'published'
  and public.shop_has_feature(s.id, 'audio_narration');

grant select on v_live_narrations to anon, authenticated;

comment on view v_live_narrations is
  'Published narration for products of live, entitled shops. Read by the showroom tour.';

commit;
