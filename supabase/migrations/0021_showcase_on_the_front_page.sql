-- =============================================================================
-- What the front page shows, decided in the admin rather than in the code
--
-- The front page now renders the house itself, from the inside, looking at
-- something somebody is paying to advertise. WHICH something is a commercial
-- decision -- it is the most valuable position on the site -- so it cannot be
-- a constant in a .jsx file that needs a developer and a deploy to change.
--
-- Two things follow.
--
-- 1. A PLACEMENT CAN BE RANKED. `showcase_rank` is null for almost everything
--    and a positive integer for the few the platform wants on the front page,
--    in that order. It is on PLACEMENTS, not on products, and that is the
--    whole point: the front page is an interior view, so what is being chosen
--    is "the Slumberland bed, standing in the master bedroom" -- a product
--    with no position cannot have a camera pointed at it.
--
-- 2. IT IS READ LIVE, NOT FROM A PUBLISHED SNAPSHOT. Everything else the
--    showroom draws comes from `v_current_scene`, because a visitor should
--    see a house somebody decided to show them rather than a half-finished
--    rearrangement. Featuring is not geometry: nothing moves, nothing is
--    re-modelled, somebody has simply chosen which advert leads. Making that
--    wait for a scene publish would tie a marketing decision to a build step.
--
-- Run after 0020.
-- =============================================================================

-- =============================================================================
-- 1. THE RANK
-- =============================================================================

alter table placements
  add column if not exists showcase_rank int;

do $do$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'placements_showcase_rank_positive'
  ) then
    alter table placements
      add constraint placements_showcase_rank_positive
      check (showcase_rank is null or showcase_rank > 0);
  end if;
end $do$;

comment on column placements.showcase_rank is
  'Position on the front page: null for everything, 1, 2, 3... for the few '
  'the platform is leading with. Set from the admin, never from code.';

-- Partial, because all but a handful of rows are null and the front page only
-- ever asks for the ones that are not.
create index if not exists placements_showcase
  on placements (showcase_rank) where showcase_rank is not null;

-- =============================================================================
-- 2. WHAT THE FRONT PAGE READS
--
-- Everything needed to put a camera inside a room and look at the thing:
-- where it stands, which room, what it is, what it costs, whose it is.
--
-- A FINISH IS ALLOWED TO BE FEATURED. Paint and floor tile have no model and
-- no position -- they dress a surface rather than stand on it -- so there is
-- nothing to point a camera AT, only a room to point it INTO. The showroom
-- already makes exactly this distinction when the room list is clicked (see
-- focus.test.mjs), and the front page must not invent a second rule: a shop
-- that sells the floor should be able to lead the page.
--
-- SECURITY INVOKER, so the underlying policies decide. What comes back is
-- already public -- it is a subset of the same live placements anybody can
-- read -- and 0013 is the reason this is stated rather than assumed.
-- =============================================================================

drop view if exists v_landing_showcase;

create view v_landing_showcase
with (security_invoker = on)
as
select
  p.showcase_rank,
  v.*
from v_live_placements v
join placements p on p.id = v.placement_id
where p.showcase_rank is not null
order by p.showcase_rank;

comment on view v_landing_showcase is
  'The adverts leading the front page, in the order an admin put them. Read '
  'live rather than from the published snapshot: featuring moves nothing in '
  'the house, so it should not wait for a scene publish.';

grant select on v_landing_showcase to anon, authenticated;

-- =============================================================================
-- 3. SETTING IT
--
-- PLATFORM ADMINS ONLY, and deliberately not shop managers. A shop manager
-- can already edit their own placements -- that is their furniture -- but the
-- front page is the platform's single most valuable position, and a shop that
-- could put itself on it whenever it liked would be helping itself to
-- something the others are queuing for.
--
-- SECURITY DEFINER with the check written out, rather than an RLS policy on
-- the column: Postgres has no per-column RLS, so a policy permissive enough
-- to let a shop fix its own sofa's rotation would also let it feature itself.
-- =============================================================================

create or replace function public.set_showcase_rank(
  p_placement uuid,
  p_rank      int default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform can choose what leads the front page.'
      using errcode = '42501';
  end if;

  if p_rank is not null and p_rank < 1 then
    raise exception 'A rank is 1 or more, or null to remove it.';
  end if;

  update placements
     set showcase_rank = p_rank,
         updated_at    = now()
   where id = p_placement
  returning showcase_rank into v_rank;

  if not found then
    raise exception 'No such placement: %', p_placement;
  end if;

  return v_rank;
end;
$$;

revoke all on function public.set_showcase_rank(uuid, int) from public, anon;
grant execute on function public.set_showcase_rank(uuid, int) to authenticated;

-- =============================================================================
-- 4. SOMETHING TO SHOW ON THE DAY THIS RUNS
--
-- Not a hardcoded list -- a QUERY, so it works against whatever this database
-- actually holds rather than against what it held the day it was written. It
-- leads with a bed if there is one (the largest, most immediately legible
-- thing in a house) and then the dearest advertised objects after it.
--
-- Only fills EMPTY ranks. Re-running this migration must never overwrite the
-- choices an admin has since made, which is the whole reason the column
-- exists.
-- =============================================================================

do $do$
declare
  v_touched int;
begin
  if exists (select 1 from placements where showcase_rank is not null) then
    raise notice 'showcase: an admin has already chosen; leaving it alone';

    return;
  end if;

  with candidates as (
    select
      v.placement_id,
      row_number() over (
        order by
          -- A bed first, if the house has one.
          (v.category_code = 'bed') desc,
          -- Then the most expensive thing standing in a room: what a visitor
          -- is shown first should be what the house is proudest of.
          v.effective_price_cents desc nulls last
      ) as rank
    from v_live_placements v
    where v.model_url is not null      -- it has to be visible in the room
      and v.scene_slug = '3bed'
  )
  update placements p
     set showcase_rank = c.rank
    from candidates c
   where p.id = c.placement_id
     and c.rank <= 4;

  get diagnostics v_touched = row_count;
  raise notice 'showcase: seeded % placements', v_touched;
end $do$;
