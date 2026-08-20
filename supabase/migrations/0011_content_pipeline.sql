-- =============================================================================
-- The content pipeline
--
-- Instructions.md sections 14 to 17 and 76 describe a SELF-SERVE pipeline: a
-- shop uploads a GLB, the system validates it, suggests slots, an admin
-- approves, the product appears. That is the right architecture and it is
-- half the business.
--
-- THE OTHER HALF IS DONE FOR THEM. Most shops will not model anything. They
-- will send photographs, a price list and a phone call, and expect the
-- platform to produce the product -- which is exactly how the Slumberland bed
-- and the Tubod hinge got made. A pipeline that only knows how to RECEIVE an
-- asset cannot describe most of the work, and work it cannot describe cannot
-- be tracked, queued, quoted or charged for.
--
-- So there are two front doors into the same pipeline:
--
--     shop uploads a model      ->  asset -> validate -> suggest -> place
--     shop asks for one         ->  REQUEST -> produce -> asset -> ...
--
-- and they converge the moment an asset exists. `content_requests` is the
-- second door: the queue of work somebody is paying to have done.
--
-- Run after 0010.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    -- EXPLICIT STATES (section 105). "Waiting on us" and "waiting on them" and
    -- "finished" are different things, and a queue that cannot tell them apart
    -- is a list.
    create type request_status as enum (
      'new',            -- the shop has asked; nobody has looked yet
      'accepted',       -- taken on, and in the queue
      'awaiting_info',  -- blocked ON THE SHOP: no photographs, no dimensions
      'in_production',  -- being modelled
      'review',         -- made, waiting for the shop to approve it
      'delivered',      -- the product exists and is placeable
      'rejected'        -- not being done, with a reason
    );
  end if;
end $do$;

-- =============================================================================
-- 1. THE QUEUE
-- =============================================================================

create table if not exists content_requests (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,

  title         text not null,
  brief         text,
  category_code text references product_categories(code),

  -- What the shop actually sends: photographs, a spec sheet, a web page. The
  -- raw material the modelling is done FROM, which is why it lives on the
  -- request rather than on the product -- the product may not exist yet.
  reference_urls text[] not null default '{}',

  -- What they said it costs and how big it is, before anything is modelled.
  -- Enough to price the job and to check the finished model against.
  quoted_price_cents integer,
  width_mm      numeric(10,1),
  depth_mm      numeric(10,1),
  height_mm     numeric(10,1),

  status        request_status not null default 'new',
  -- Which of our people is doing it. NULL means unassigned, which is what the
  -- work queue is a list of.
  assigned_to   uuid references profiles(id) on delete set null,

  -- Filled in when the work lands. This is the join between "somebody asked
  -- for a bed" and "there is a bed".
  product_id    uuid references products(id) on delete set null,

  priority      integer not null default 50 check (priority between 0 and 100),
  due_on        date,
  notes         text,

  requested_by  uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  delivered_at  timestamptz
);

comment on table content_requests is
  'Work a shop is paying to have done: "here are photographs of our bed, put '
  'it in the house". The second front door into the content pipeline, and in '
  'practice the busier one.';

create index if not exists content_requests_queue_idx
  on content_requests (status, priority desc, created_at);
create index if not exists content_requests_shop_idx on content_requests (shop_id);
create index if not exists content_requests_assignee_idx
  on content_requests (assigned_to) where assigned_to is not null;

-- Which transitions are legal. A request cannot go from 'new' straight to
-- 'delivered' without anybody having made anything.
create or replace function public.check_request_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if tg_op = 'INSERT' or new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'new'           then array['accepted', 'awaiting_info', 'rejected']
    when 'accepted'      then array['in_production', 'awaiting_info', 'rejected']
    when 'awaiting_info' then array['accepted', 'in_production', 'rejected']
    when 'in_production' then array['review', 'awaiting_info', 'rejected']
    when 'review'        then array['delivered', 'in_production', 'rejected']
    when 'delivered'     then array['in_production']   -- a revision
    when 'rejected'      then array['new', 'accepted']
  end;

  if not (new.status::text = any(allowed)) then
    raise exception 'a request cannot go from % to %', old.status, new.status;
  end if;

  if new.status = 'delivered' then
    if new.product_id is null then
      raise exception 'a request cannot be delivered without a product';
    end if;
    new.delivered_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists content_requests_transition on content_requests;
create trigger content_requests_transition
  before insert or update on content_requests
  for each row execute function public.check_request_transition();

drop trigger if exists content_requests_touch on content_requests;
create trigger content_requests_touch before update on content_requests
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- 2. REGISTERING AN ASSET
--
-- The uploader already puts files in storage under `<shop>/<product>/<file>`
-- and the storage policy already checks the caller may manage that shop. What
-- it never did was RECORD the upload: `assets` and `asset_versions` have
-- existed since migration 0007 with zero rows in them, so replacing a model
-- destroyed the old one and nothing could tell a broken file from one that
-- was still processing.
--
-- This is the missing half. Every upload becomes an asset and a version, and
-- the version number is allocated by the database so two uploads racing for
-- version 4 cannot both get it.
-- =============================================================================
create or replace function public.register_asset(
  p_shop_slug   text,
  p_kind        asset_kind,
  p_name        text,
  p_slug        text,
  p_storage_path text,
  p_mime        text default null,
  p_bytes       bigint default null,
  p_checksum    text default null
) returns asset_versions
language plpgsql security definer set search_path = public
as $$
declare
  v_shop    uuid;
  v_asset   uuid;
  v_version integer;
  v_row     asset_versions;
begin
  select id into v_shop from shops where slug = p_shop_slug;
  if v_shop is null then
    raise exception 'no shop %', p_shop_slug;
  end if;
  if not public.can_manage_shop(v_shop) then
    raise exception 'not permitted to upload for %', p_shop_slug;
  end if;

  insert into assets (shop_id, kind, name, slug, status, created_by)
  values (v_shop, p_kind, p_name, p_slug, 'uploaded', auth.uid())
  on conflict (shop_id, slug) do update set name = excluded.name
  returning id into v_asset;

  v_version := public.next_asset_version(v_asset);

  insert into asset_versions (
    asset_id, version, storage_path, mime_type, bytes, checksum,
    status, created_by
  ) values (
    v_asset, v_version, p_storage_path, p_mime, p_bytes, p_checksum,
    'uploaded', auth.uid()
  ) returning * into v_row;

  perform public.record_audit(
    'asset.upload', 'asset', v_asset::text, null,
    jsonb_build_object('version', v_version, 'path', p_storage_path)
  );

  return v_row;
end;
$$;

-- =============================================================================
-- 3. VALIDATION (section 54)
--
-- The one check worth having before any others: IS IT THE RIGHT SIZE. A model
-- exported in centimetres arrives a hundred times too small and a model
-- exported in inches arrives 2.54 times too big, and both look perfectly fine
-- in isolation -- you only notice when the sofa is the size of a shoe.
--
-- Compared against what the shop SAID the product measures, which is the only
-- independent number the system has.
-- =============================================================================
create or replace function public.validate_asset_version(
  p_version uuid,
  p_tolerance numeric default 0.15
) returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  v      asset_versions;
  p      products;
  probs  text[] := '{}';
begin
  select * into v from asset_versions where id = p_version;
  if v is null then
    raise exception 'no asset version %', p_version;
  end if;

  select pr.* into p
    from products pr
    join product_variants pv on pv.product_id = pr.id
   where pv.asset_id = v.asset_id
   limit 1;

  if v.width_mm is null or v.height_mm is null then
    probs := probs || 'model has no measured bounding box';
  elsif p.id is not null and p.width_mm is not null then
    -- Compare the LONGEST edge, because which axis is width depends on how
    -- the thing was modelled and we are looking for a unit mistake, not a
    -- rotation.
    declare
      said  numeric := greatest(p.width_mm, coalesce(p.depth_mm, 0), coalesce(p.height_mm, 0));
      built numeric := greatest(v.width_mm, coalesce(v.depth_mm, 0), v.height_mm);
    begin
      if built < said * (1 - p_tolerance) or built > said * (1 + p_tolerance) then
        probs := probs || format(
          'model measures %smm at its longest but the product says %smm '
          '(a factor of %s -- check the export units)',
          round(built), round(said), round(built / nullif(said, 0), 2)
        );
      end if;
    end;
  end if;

  if v.triangles is not null and v.triangles > 150000 then
    probs := probs || format('%s triangles is too heavy for the house', v.triangles);
  end if;

  update asset_versions
     set status = (case when array_length(probs, 1) is null then 'ready'
                        else 'failed' end)::asset_status,
         failure_reason = array_to_string(probs, '; ')
   where id = p_version;

  update assets a
     set status = (case when array_length(probs, 1) is null then 'ready'
                        else 'failed' end)::asset_status,
         current_version_id = case
           when array_length(probs, 1) is null then p_version
           else a.current_version_id
         end
   where a.id = v.asset_id;

  return probs;
end;
$$;

comment on function public.validate_asset_version is
  'Section 54. A version that fails is marked failed and does NOT become the '
  'current one -- rule 14, and acceptance test 7: a broken asset must not be '
  'able to reach the public house.';

-- =============================================================================
-- 4. WHERE COULD THIS GO? (sections 55 and 56)
--
-- The question an operator asks a hundred times a week and the system has
-- never been able to answer. Given a product, which FREE positions will
-- actually take it -- right category, right kind of room, and physically big
-- enough, allowing for it being turned a quarter turn.
-- =============================================================================
create or replace function public.suggest_slots(
  p_product uuid,
  p_scene   text default '3bed',
  p_limit   integer default 20
) returns table (
  slot_id      uuid,
  external_id  text,
  label        text,
  room_code    text,
  room_label   text,
  slot_type    text,
  priority     integer,
  fits_rotated boolean
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.external_id, s.label, r.code, r.name, st.code, s.priority,
         -- Whether it only fits turned. Worth surfacing: a wardrobe that fits
         -- across a wall but not along it is a different suggestion.
         not (p.width_mm <= coalesce(s.max_width_mm, 1e9)
              and coalesce(p.depth_mm, 0) <= coalesce(s.max_depth_mm, 1e9))
    from placement_slots s
    join scenes sc on sc.id = s.scene_id
    left join rooms r on r.id = s.room_id
    left join slot_types st on st.id = s.slot_type_id
    cross join products p
   where p.id = p_product
     and sc.slug = p_scene
     and s.is_active

     -- Nothing already in it.
     and not exists (
       select 1 from placements pl
        where pl.slot_id = s.id and pl.status = 'live'
     )

     -- The right kind of thing. A slot with no category takes anything.
     and (s.category_code is null or s.category_code = p.category_code)

     -- The right kind of room, using the scoping that already exists.
     and (r.room_type is null or public.product_fits_room(p.id, r.room_type))

     -- And it has to physically fit, either way round.
     and coalesce(p.height_mm, 0) <= coalesce(s.max_height_mm, 1e9)
     and (
       (p.width_mm <= coalesce(s.max_width_mm, 1e9)
        and coalesce(p.depth_mm, 0) <= coalesce(s.max_depth_mm, 1e9))
       or
       (p.width_mm <= coalesce(s.max_depth_mm, 1e9)
        and coalesce(p.depth_mm, 0) <= coalesce(s.max_width_mm, 1e9))
     )
   order by s.priority desc, r.code
   limit p_limit;
$$;

-- =============================================================================
-- 5. SECURITY
--
-- A shop sees its own requests and can raise one. Everything else -- taking a
-- job on, assigning it, moving it through production -- needs
-- `product.manage`, because that is OUR work rather than theirs.
-- =============================================================================
alter table content_requests enable row level security;

drop policy if exists content_requests_read on content_requests;
create policy content_requests_read on content_requests
  for select using (
    public.is_shop_member(shop_id) or public.has_permission('product.read')
  );

drop policy if exists content_requests_raise on content_requests;
create policy content_requests_raise on content_requests
  for insert with check (
    public.can_manage_shop(shop_id) or public.has_permission('product.manage')
  );

drop policy if exists content_requests_work on content_requests;
create policy content_requests_work on content_requests
  for update using (public.has_permission('product.manage'))
  with check (public.has_permission('product.manage'));

-- The work queue: what is waiting, oldest and most urgent first.
create or replace view v_content_queue as
select cr.id,
       cr.status,
       cr.priority,
       cr.title,
       cr.category_code,
       s.slug  as shop_slug,
       s.name  as shop_name,
       cr.assigned_to,
       pr.display_name as assigned_name,
       cr.due_on,
       cr.created_at,
       cr.updated_at,
       array_length(cr.reference_urls, 1) as reference_count,
       cr.product_id
  from content_requests cr
  join shops s on s.id = cr.shop_id
  left join profiles pr on pr.id = cr.assigned_to
 where cr.status not in ('delivered', 'rejected')
 order by cr.priority desc, cr.due_on nulls last, cr.created_at;

comment on view v_content_queue is
  'Everything still to be done, most urgent first. The list an operator works '
  'from when shops have asked for products rather than uploaded them.';
