-- =============================================================================
-- Measure the model at the moment it is uploaded
--
-- 0011 gave the platform a validator that catches the mistake worth catching:
-- a model exported in the wrong units. It works -- the Slumberland bed
-- re-measured in centimetres was refused with "188mm at its longest but the
-- product says 1880mm (a factor of 0.10)" and never became the current
-- version.
--
-- It could not run on a real upload, because nothing ever told it how big the
-- uploaded thing was. `register_asset` recorded the path, the bytes and the
-- checksum and left width_mm, depth_mm, height_mm and triangles null, so
-- every real version failed on 'model has no measured bounding box'.
--
-- THE BROWSER ALREADY KNOWS. ModelInspector parses the .glb before it is sent
-- and reports the bounding box in millimetres and the triangle count -- that
-- is where the "this model is 4.2 metres across, glTF is in METRES" warning
-- in the upload dialog comes from. The measurement existed; it just had
-- nowhere to go.
--
-- So it goes here, through the same security-definer call that records the
-- upload. One round trip, one writer, and the numbers the validator compares
-- arrive with the row rather than in a second UPDATE the shop's own role
-- would not be allowed to make.
--
-- Run after 0011.
-- =============================================================================

-- The old 8-argument form has to go rather than be replaced: appending
-- defaulted parameters CREATES AN OVERLOAD, and an 8-argument call would then
-- match both and fail as ambiguous.
drop function if exists public.register_asset(
  text, asset_kind, text, text, text, text, bigint, text
);

create or replace function public.register_asset(
  p_shop_slug    text,
  p_kind         asset_kind,
  p_name         text,
  p_slug         text,
  p_storage_path text,
  p_mime         text default null,
  p_bytes        bigint default null,
  p_checksum     text default null,
  -- Measured by ModelInspector in the browser, in millimetres, before the
  -- file was ever sent. Null for a texture or a document, which have no
  -- bounding box and are not size-checked.
  p_width_mm     numeric default null,
  p_depth_mm     numeric default null,
  p_height_mm    numeric default null,
  p_triangles    integer default null
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
    width_mm, depth_mm, height_mm, triangles,
    status, created_by
  ) values (
    v_asset, v_version, p_storage_path, p_mime, p_bytes, p_checksum,
    p_width_mm, p_depth_mm, p_height_mm, p_triangles,
    'uploaded', auth.uid()
  ) returning * into v_row;

  perform public.record_audit(
    'asset.upload', 'asset', v_asset::text, null,
    jsonb_build_object(
      'version', v_version,
      'path', p_storage_path,
      'measured_mm', case
        when p_width_mm is null then null
        else jsonb_build_array(p_width_mm, p_depth_mm, p_height_mm)
      end
    )
  );

  return v_row;
end;
$$;

-- CALL IT FROM `FROM`, NOT FROM `SELECT (...).*`
--
--     select * from register_asset(...);        -- once
--     select (register_asset(...)).*;           -- FIFTEEN TIMES
--
-- The second form re-evaluates the composite once per column it expands, and
-- asset_versions has fifteen columns, so one apparent call allocated fifteen
-- version numbers and left thirteen orphans nobody uploaded. This is not
-- hypothetical -- the same mistake published the scene thirteen times before
-- anybody noticed. The browser goes through PostgREST rpc(), which calls once;
-- it is hand-written SQL that has to be careful.

comment on function public.register_asset is
  'Record an upload as a numbered version, carrying the bounding box the '
  'browser measured so validate_asset_version has something to check against. '
  'The version number is allocated here so two uploads racing for version 4 '
  'cannot both get it.';
