-- =============================================================================
-- Material ingestion, and shop membership
--
-- TWO TABLES THAT HAVE NEVER HAD A ROW IN THEM, for the same reason: there
-- was no way to put one there.
--
-- `material_maps` has existed since 0008 and is empty. Every surface in the
-- house is drawn procedurally from a key -- createTileTexture,
-- createGamazineTexture -- with one exception hardcoded in the browser:
--
--     tile_pyc61001: { url: "/textures/floor/pyc61001.jpg", tileMm: 600 }
--
-- A real tile photograph, from a real shop, pointing at a file in the repo.
-- Which means "a shop supplies a photograph of their tile" is a code change
-- and a deploy, and section 30's whole point is that it should be an upload.
--
-- `shop_members` has existed since 0004 and is empty. Every policy in the
-- database asks `can_manage_shop`, which is membership OR platform admin --
-- so the platform admin has been doing everything, and no shop can manage
-- its own products because there is no way to make anyone a member.
--
-- Run after 0015.
-- =============================================================================

-- =============================================================================
-- 1. SOMEWHERE TO PUT A TEXTURE
--
-- Its own bucket rather than product-media, because the path means something
-- different. Product media is `<shop>/<product>/<file>` and the storage
-- policy reads the shop out of the first segment; a material belongs to a
-- material, and most of the ones in this house belong to the platform rather
-- than to any shop. Overloading the product path would mean lying about the
-- first segment to get past a policy, which is how storage layouts rot.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-maps', 'material-maps', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- PUBLIC READ, LIKE THE MODELS. A texture is drawn on a surface a visitor is
-- looking at; signing every URL would mean a round trip per map before the
-- house could render, and there is nothing private about a picture of a tile.
drop policy if exists material_maps_public_read on storage.objects;
create policy material_maps_public_read on storage.objects
  for select using (bucket_id = 'material-maps');

-- Writing is the platform's, or the owning shop's. Checked against the
-- MATERIAL, not against the path -- the path is `<material-code>/<map>.jpg`
-- and a code is not a permission.
drop policy if exists material_maps_write on storage.objects;
create policy material_maps_write on storage.objects
  for all using (
    bucket_id = 'material-maps'
    and exists (
      select 1 from public.materials m
       where m.code = (storage.foldername(name))[1]
         and case when m.shop_id is null
                  then public.is_platform_admin()
                  else public.can_manage_shop(m.shop_id) end
    )
  )
  with check (
    bucket_id = 'material-maps'
    and exists (
      select 1 from public.materials m
       where m.code = (storage.foldername(name))[1]
         and case when m.shop_id is null
                  then public.is_platform_admin()
                  else public.can_manage_shop(m.shop_id) end
    )
  );

-- =============================================================================
-- 2. RECORDING ONE
--
-- A map is an ASSET, which is why material_maps.asset_id is not null. It gets
-- the same treatment as a model: a numbered version, a size, a checksum, a
-- place in the audit log. A texture that silently replaced its predecessor
-- would lose the same thing a model did -- the ability to say what changed
-- and go back.
-- =============================================================================

create or replace function public.ingest_material_map(
  p_material_code text,
  p_map_type      material_map_type,
  p_storage_path  text,
  p_mime          text default null,
  p_bytes         bigint default null,
  p_resolution    integer default null
) returns material_maps
language plpgsql security definer set search_path = public
as $$
declare
  v_material materials;
  v_asset    uuid;
  v_version  integer;
  v_vid      uuid;
  v_row      material_maps;
begin
  select * into v_material from materials where code = p_material_code;
  if v_material is null then
    raise exception 'no material %', p_material_code;
  end if;

  if v_material.shop_id is null then
    if not public.is_platform_admin() then
      raise exception 'only a platform admin may supply maps for %', p_material_code;
    end if;
  elsif not public.can_manage_shop(v_material.shop_id) then
    raise exception 'not permitted to supply maps for %', p_material_code;
  end if;

  -- One asset per map type, versioned. Re-uploading a normal map makes
  -- version 2 of the same asset rather than a second asset.
  --
  -- LOOKED UP RATHER THAN UPSERTED, and that is not a style choice. The
  -- unique constraint is (shop_id, slug), and every material in this house
  -- belongs to the PLATFORM -- shop_id is null. Postgres treats nulls as
  -- distinct in a unique index, so `on conflict (shop_id, slug)` never
  -- matches for a platform material and every upload made a BRAND NEW asset
  -- carrying version 1. Ten uploads, ten assets, ten version ones, and the
  -- comment above would have been wrong the whole time.
  --
  -- `is not distinct from` is the null-aware comparison the constraint should
  -- have used and cannot.
  select id into v_asset
    from assets
   where shop_id is not distinct from v_material.shop_id
     and slug = 'mat-' || p_material_code || '-' || p_map_type;

  if v_asset is null then
    insert into assets (shop_id, kind, name, slug, status, created_by)
    values (v_material.shop_id, 'texture',
            v_material.name || ' — ' || p_map_type,
            'mat-' || p_material_code || '-' || p_map_type,
            'ready', auth.uid())
    returning id into v_asset;
  end if;

  v_version := public.next_asset_version(v_asset);

  insert into asset_versions (asset_id, version, storage_path, mime_type, bytes,
                              status, created_by)
  values (v_asset, v_version, p_storage_path, p_mime, p_bytes, 'ready', auth.uid())
  returning id into v_vid;

  update assets set current_version_id = v_vid where id = v_asset;

  insert into material_maps (material_id, map_type, asset_id, resolution)
  values (v_material.id, p_map_type, v_asset, p_resolution)
  on conflict (material_id, map_type)
    do update set asset_id = excluded.asset_id, resolution = excluded.resolution
  returning * into v_row;

  -- A material with an albedo map is no longer drawn from a procedure, and
  -- the renderer keys off this. Set when the first real map lands, so nothing
  -- has to remember to flip it.
  if p_map_type = 'albedo' then
    update materials set renderer = 'pbr' where id = v_material.id;
  end if;

  perform public.record_audit(
    'material.map', 'material', v_material.id::text, null,
    jsonb_build_object('map', p_map_type, 'path', p_storage_path, 'version', v_version)
  );

  return v_row;
end;
$$;

comment on function public.ingest_material_map is
  'Record an uploaded texture as a versioned asset and attach it to a '
  'material. Uploading an albedo map switches that material from procedural '
  'to PBR, so the browser stops drawing it and starts loading it.';

-- material_maps had no uniqueness, so re-uploading a normal map added a
-- SECOND normal map and the renderer would have picked whichever came back
-- first. One map of each type per material is the whole idea.
create unique index if not exists material_maps_one_per_type
  on material_maps (material_id, map_type);

-- =============================================================================
-- 3. WHAT THE BROWSER READS
--
-- One row per material with its maps gathered, so the house makes one request
-- for its surfaces rather than one per map. Public: these are pictures of
-- tiles on a wall a visitor is looking at.
-- =============================================================================

create or replace view v_material_finishes as
select m.code,
       m.name,
       m.category_code,
       m.renderer,
       m.procedural_key,
       m.tile_width_mm,
       m.tile_height_mm,
       m.base_colour,
       m.roughness,
       m.metallic,
       s.slug as shop_slug,
       coalesce(
         jsonb_object_agg(mm.map_type, av.storage_path)
           filter (where mm.map_type is not null and av.storage_path is not null),
         '{}'::jsonb
       ) as maps
  from materials m
  left join shops s on s.id = m.shop_id
  left join material_maps mm on mm.material_id = m.id
  left join assets a on a.id = mm.asset_id
  left join asset_versions av on av.id = a.current_version_id
 where m.status <> 'archived'
 group by m.id, m.code, m.name, m.category_code, m.renderer, m.procedural_key,
          m.tile_width_mm, m.tile_height_mm, m.base_colour, m.roughness,
          m.metallic, s.slug;

comment on view v_material_finishes is
  'Every material with its texture maps gathered into one row, keyed by the '
  'material name Blender baked into the mesh. The house asks once.';

-- =============================================================================
-- 4. SHOP MEMBERSHIP
--
-- `can_manage_shop` has always been "a member with role owner or manager, OR
-- a platform admin". With shop_members empty, only the second half has ever
-- been true, so every shop is run by us. That is fine for three shops and
-- impossible for thirty.
--
-- BY EMAIL, BECAUSE THAT IS WHAT AN OPERATOR HAS. Nobody knows a colleague's
-- uuid, `profiles` does not carry an address, and `auth.users` is not
-- readable from a browser and should not be. So the lookup happens in here,
-- where it can check the caller may manage the shop first.
-- =============================================================================

create or replace function public.invite_shop_member(
  p_shop  uuid,
  p_email text,
  p_role  shop_member_role default 'staff'
) returns shop_members
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_row  shop_members;
begin
  if not public.can_manage_shop(p_shop) then
    raise exception 'not permitted to manage this shop''s members';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    -- Deliberately explicit. An invitation silently dropped because the
    -- address has no account is the kind of thing nobody notices for a week.
    raise exception 'nobody is registered with the address %. They need to sign up first.', p_email;
  end if;

  insert into shop_members (shop_id, user_id, role)
  values (p_shop, v_user, p_role)
  on conflict (shop_id, user_id) do update set role = excluded.role
  returning * into v_row;

  perform public.record_audit(
    'shop.member_added', 'shop', p_shop::text, null,
    jsonb_build_object('user', v_user, 'role', p_role)
  );

  return v_row;
end;
$$;

comment on function public.invite_shop_member is
  'Add somebody to a shop by email address. They must already have an '
  'account -- this grants access, it does not create people.';

create or replace function public.remove_shop_member(p_shop uuid, p_user uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_manage_shop(p_shop) then
    raise exception 'not permitted to manage this shop''s members';
  end if;

  -- A SHOP MUST KEEP AN OWNER. Removing the last one leaves a shop only a
  -- platform admin can touch, which is exactly the state this migration
  -- exists to get out of.
  if exists (select 1 from shop_members
              where shop_id = p_shop and user_id = p_user and role = 'owner')
     and (select count(*) from shop_members
           where shop_id = p_shop and role = 'owner') <= 1 then
    raise exception 'that is the shop''s only owner -- make somebody else an owner first';
  end if;

  delete from shop_members where shop_id = p_shop and user_id = p_user;

  perform public.record_audit(
    'shop.member_removed', 'shop', p_shop::text, null,
    jsonb_build_object('user', p_user)
  );
  return true;
end;
$$;

-- Members with a name against them, for the admin screen. `profiles` is
-- readable, `auth.users` is not, which is why the display name comes from one
-- and never the other.
create or replace view v_shop_members
with (security_invoker = on) as
select sm.shop_id, s.slug as shop_slug, s.name as shop_name,
       sm.user_id, sm.role, sm.created_at,
       p.display_name, p.role as platform_role
  from shop_members sm
  join shops s on s.id = sm.shop_id
  left join profiles p on p.id = sm.user_id;
