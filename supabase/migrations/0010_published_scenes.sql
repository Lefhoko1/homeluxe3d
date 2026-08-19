-- =============================================================================
-- Published scenes
--
-- "The renderer should not need to perform dozens of complicated business
-- queries just to display a house" (§40), and Tests 5, 6 and 9 -- publishing,
-- rollback and audit -- all rest on this.
--
-- Today the browser reads `v_live_placements` directly, which means the
-- public house is whatever the database says at the instant somebody loads
-- the page. That has two consequences worth being explicit about, because
-- neither is obvious until it bites:
--
--   * There is no draft. Half-finished work is live the moment it is saved,
--     and an admin dragging a sofa is rearranging the public house while
--     visitors are walking through it.
--   * There is nothing to go back to. A bad change is undone by making
--     another change and hoping.
--
-- A published scene is the resolved answer -- house, rooms, slots,
-- placements, products, materials, assets -- frozen as one JSON document with
-- a version number. The renderer reads one row. Publishing is a snapshot;
-- rolling back is pointing at an older one.
--
-- THE RESOLVER IS THE SAME QUERY THE VIEW ALREADY RUNS. `v_live_placements`
-- is not being replaced or forked -- `resolve_scene` reads it. One definition
-- of what is live, used both to render the draft and to build the snapshot,
-- so the two cannot disagree about what a live placement is.
--
-- Run after 0009.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'scene_status') then
    create type scene_status as enum ('draft', 'published', 'archived');
  end if;
end $do$;

create table if not exists published_scenes (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references scenes(id) on delete cascade,
  version      integer not null check (version > 0),
  status       scene_status not null default 'draft',

  -- The whole resolved scene. One row, one fetch, no joins at render time.
  payload      jsonb not null,

  -- Cheap facts about the snapshot, so the admin list does not have to open
  -- the payload to say anything useful about it.
  placement_count integer not null default 0,
  shop_count      integer not null default 0,

  notes        text,
  built_by     uuid references profiles(id) on delete set null,
  built_at     timestamptz not null default now(),
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz,

  unique (scene_id, version)
);

comment on table published_scenes is
  'An immutable snapshot of a scene. The renderer reads the newest published '
  'row; rolling back publishes an older one again rather than editing this.';

create index if not exists published_scenes_live_idx
  on published_scenes (scene_id, version desc) where status = 'published';

-- =============================================================================
-- 1. RESOLVE
--
-- Build the document without storing it. Used by publish, and on its own by
-- the admin preview, which wants to see what WOULD be published.
-- =============================================================================
create or replace function public.resolve_scene(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'scene', p_slug,
    'resolvedAt', now(),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', r.code, 'name', r.name, 'roomType', r.room_type,
        'x0', r.x0_mm, 'y0', r.y0_mm, 'x1', r.x1_mm, 'y1', r.y1_mm
      ) order by r.sort_order)
      from rooms r join scenes s on s.id = r.scene_id where s.slug = p_slug
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'code', m.code, 'name', m.name, 'renderer', m.renderer,
        'proceduralKey', m.procedural_key,
        'tileWidthMm', m.tile_width_mm, 'tileHeightMm', m.tile_height_mm,
        'baseColour', m.base_colour,
        'roughness', m.roughness, 'metallic', m.metallic
      )) from materials m
    ), '[]'::jsonb),
    -- The placements, in exactly the shape rowsToManifest already expects.
    -- Reading the view rather than rebuilding its joins is the whole point:
    -- there is one definition of "live".
    'placements', coalesce((
      select jsonb_agg(to_jsonb(v)) from v_live_placements v
       where v.scene_slug = p_slug
    ), '[]'::jsonb)
  );
$$;

comment on function public.resolve_scene is
  'House + rooms + materials + live placements, as one document. Reads '
  'v_live_placements so the snapshot and the draft cannot disagree.';

-- =============================================================================
-- 2. PUBLISH
--
-- Snapshot, number it, mark it published, retire the previous one, and say so
-- in the audit log. All of it in one statement so a half-published scene is
-- not a state the system can be in.
-- =============================================================================
create or replace function public.publish_scene(p_slug text, p_notes text default null)
returns published_scenes
language plpgsql security definer set search_path = public
as $$
declare
  v_scene   uuid;
  v_payload jsonb;
  v_next    integer;
  v_row     published_scenes;
begin
  if not public.has_permission('scene.publish') then
    raise exception 'not permitted to publish scenes';
  end if;

  select id into v_scene from scenes where slug = p_slug;
  if v_scene is null then
    raise exception 'no scene %', p_slug;
  end if;

  v_payload := public.resolve_scene(p_slug);

  -- A scene with nothing in it is almost always a mistake -- an unseeded
  -- database, or a query that failed quietly -- and publishing it would take
  -- the public house down. Refuse rather than freeze an empty house.
  if jsonb_array_length(v_payload -> 'placements') = 0 then
    raise exception 'refusing to publish % with no live placements', p_slug;
  end if;

  select coalesce(max(version), 0) + 1 into v_next
    from published_scenes where scene_id = v_scene;

  update published_scenes
     set status = 'archived'
   where scene_id = v_scene and status = 'published';

  insert into published_scenes (
    scene_id, version, status, payload, placement_count, shop_count,
    notes, built_by, published_by, published_at
  ) values (
    v_scene, v_next, 'published', v_payload,
    jsonb_array_length(v_payload -> 'placements'),
    (select count(distinct p ->> 'shop_slug')
       from jsonb_array_elements(v_payload -> 'placements') p),
    p_notes, auth.uid(), auth.uid(), now()
  ) returning * into v_row;

  perform public.record_audit(
    'scene.publish', 'scene', p_slug, null,
    jsonb_build_object('version', v_next, 'placements', v_row.placement_count),
    jsonb_build_object('notes', p_notes)
  );

  return v_row;
end;
$$;

-- =============================================================================
-- 3. ROLL BACK
--
-- Not by editing the old row -- a snapshot is immutable, and one that can be
-- edited is not a snapshot. Rolling back re-publishes an old payload as a NEW
-- version, so the history records that it happened and rolling forward again
-- is the same operation.
-- =============================================================================
create or replace function public.rollback_scene(p_slug text, p_to_version integer)
returns published_scenes
language plpgsql security definer set search_path = public
as $$
declare
  v_scene   uuid;
  v_payload jsonb;
  v_next    integer;
  v_row     published_scenes;
begin
  if not public.has_permission('scene.rollback') then
    raise exception 'not permitted to roll back scenes';
  end if;

  select id into v_scene from scenes where slug = p_slug;
  select payload into v_payload
    from published_scenes
   where scene_id = v_scene and version = p_to_version;

  if v_payload is null then
    raise exception 'no version % of scene %', p_to_version, p_slug;
  end if;

  select coalesce(max(version), 0) + 1 into v_next
    from published_scenes where scene_id = v_scene;

  update published_scenes set status = 'archived'
   where scene_id = v_scene and status = 'published';

  insert into published_scenes (
    scene_id, version, status, payload, placement_count, shop_count,
    notes, built_by, published_by, published_at
  ) values (
    v_scene, v_next, 'published', v_payload,
    jsonb_array_length(v_payload -> 'placements'),
    (select count(distinct p ->> 'shop_slug')
       from jsonb_array_elements(v_payload -> 'placements') p),
    format('Rolled back to version %s', p_to_version),
    auth.uid(), auth.uid(), now()
  ) returning * into v_row;

  perform public.record_audit(
    'scene.rollback', 'scene', p_slug, null,
    jsonb_build_object('from', p_to_version, 'published_as', v_next)
  );

  return v_row;
end;
$$;

-- =============================================================================
-- 4. WHAT THE PUBLIC READS
-- =============================================================================
create or replace view v_current_scene as
select distinct on (s.slug)
       s.slug as scene_slug,
       ps.version,
       ps.published_at,
       ps.payload
  from published_scenes ps
  join scenes s on s.id = ps.scene_id
 where ps.status = 'published' and s.is_published
 order by s.slug, ps.version desc;

comment on view v_current_scene is
  'One row per scene: the newest published snapshot. This is what the '
  'renderer fetches, and the only thing it needs to.';

-- =============================================================================
-- 5. SECURITY
-- =============================================================================
alter table published_scenes enable row level security;

-- Anyone may read a PUBLISHED snapshot; drafts and archives are staff-only.
drop policy if exists published_scenes_read on published_scenes;
create policy published_scenes_read on published_scenes
  for select using (
    status = 'published'
    or public.has_permission('scene.publish')
    or public.has_permission('house.read')
  );

-- Snapshots are written by publish_scene()/rollback_scene(), which are
-- security definer and check the permission themselves. No direct writes: an
-- editable snapshot is not a snapshot.
