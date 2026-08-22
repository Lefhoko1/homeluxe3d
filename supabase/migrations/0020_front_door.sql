-- =============================================================================
-- A front door, and somewhere for it to send a message
--
-- The showroom has always been the whole site: `/` loaded a 3D house and a
-- visitor arrived inside it with no idea what they were looking at or who
-- was behind it. A shop deciding whether to advertise had nothing to read.
--
-- So `/` becomes the company's page and the house moves to `/showroom`. Two
-- consequences reach the database.
--
-- 1. THE LINKS IN EVERY NOTIFICATION POINT AT THE OLD ADDRESS. The fan-out
--    triggers build `/?product=<slug>`, which after the move lands on the
--    marketing page with a query string nothing reads. Emails already sent
--    keep their old links -- those rows are history and are not rewritten --
--    but nothing new should carry them.
--
-- 2. A CONTACT FORM NEEDS SOMEWHERE TO GO. The lesson from the Enquire
--    button is fresh: a form that writes nothing is worse than no form,
--    because it looks like it worked.
--
-- Run after 0019.
-- =============================================================================

-- =============================================================================
-- 1. SOMEBODY GETTING IN TOUCH
--
-- ANONYMOUS INSERT IS CORRECT HERE, and it is worth saying why, given that
-- 0019 removed exactly that from `enquiries`. The two are different: an
-- enquiry needs a reply the asker can see IN THE APP, so it needs an account;
-- a contact message is answered by email, to an address they typed. Requiring
-- an account to ask "can my shop advertise with you" would turn away the
-- people this page exists to attract.
--
-- Nobody may READ them but the platform. They contain other people's names,
-- addresses and phone numbers.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'contact_kind') then
    create type contact_kind as enum (
      'shop',       -- a business that wants to advertise
      'visitor',    -- somebody who was looking round
      'support',    -- something is wrong
      'other'
    );
  end if;
end $do$;

create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  kind       contact_kind not null default 'other',

  name       text not null check (length(btrim(name)) > 0),
  email      text not null check (position('@' in email) > 1),
  phone      text,
  company    text,
  message    text not null check (length(btrim(message)) > 0),

  -- Filled in when the person happens to be signed in. Not required: most of
  -- the people this form is for have never had an account and are deciding
  -- whether to want one.
  user_id    uuid references profiles(id) on delete set null,

  status     text not null default 'new'
             check (status in ('new', 'seen', 'answered', 'closed')),
  handled_by uuid references profiles(id) on delete set null,
  answered_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table contact_messages is
  'The front page''s contact form. Anonymous insert on purpose -- it is '
  'answered by email, and requiring an account would turn away the shops the '
  'page exists to attract.';

create index if not exists contact_messages_queue_idx
  on contact_messages (status, created_at desc);

alter table contact_messages enable row level security;

drop policy if exists contact_messages_send on contact_messages;
create policy contact_messages_send on contact_messages
  for insert with check (
    -- If they claim to be somebody, they have to be that somebody.
    user_id is null or user_id = auth.uid()
  );

drop policy if exists contact_messages_read on contact_messages;
create policy contact_messages_read on contact_messages
  for select using (public.is_platform_admin());

drop policy if exists contact_messages_work on contact_messages;
create policy contact_messages_work on contact_messages
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- GRANTS AND POLICIES ARE TWO DIFFERENT GATES and both have to open. The
-- first version revoked select from `authenticated` as well as `anon`,
-- reasoning that only the platform reads these -- but the platform admin IS
-- `authenticated`, and no policy can hand back a privilege the role does not
-- have. The admin screen got 42501 with Postgres itself suggesting the fix.
--
-- So: `authenticated` may select, and `contact_messages_read` decides that
-- means platform admins only. `anon` may write and never read.
revoke select on contact_messages from anon;
grant select on contact_messages to authenticated;
grant insert on contact_messages to anon, authenticated;
grant update on contact_messages to authenticated;

-- =============================================================================
-- 2. THE HOUSE MOVED
--
-- Both fan-out triggers built links to `/`. The house is at `/showroom` now.
-- Only the URL changes; everything else is as 0017 left it.
-- =============================================================================

create or replace function public.fanout_new_product()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_site text := 'https://homeluxe3d-gzn6xgsim-lefhoko-bobaathebes-projects.vercel.app';
  v_dims text;
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then

    v_dims := nullif(concat_ws(' × ',
      nullif(round(new.width_mm)::text, ''),
      nullif(round(new.depth_mm)::text, ''),
      nullif(round(new.height_mm)::text, '')), '');

    perform public.notify_followers(
      p_shop  => new.shop_id,
      p_kind  => 'new_product',
      p_title => new.name,
      p_body  => coalesce(new.description, 'Now showing in the house.'),
      -- /showroom, not /. The front page is somebody else's job now.
      p_url   => v_site || '/showroom?product=' || new.slug,
      p_image => new.thumbnail_url,
      p_price => case when new.price_cents is null then null
                      else new.currency || ' ' ||
                           to_char(new.price_cents / 100.0, 'FM999,999,990.00')
                 end,
      p_meta  => case when v_dims is null then null else v_dims || ' mm' end
    );
  end if;
  return new;
end;
$$;

create or replace function public.fanout_shop_post()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_site text := 'https://homeluxe3d-gzn6xgsim-lefhoko-bobaathebes-projects.vercel.app';
begin
  if new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null) then
    perform public.notify_followers(
      p_shop  => new.shop_id,
      p_kind  => 'shop_post',
      p_title => new.title,
      p_body  => left(coalesce(new.body, ''), 400),
      p_url   => v_site || '/shops/' || (select slug from shops where id = new.shop_id),
      p_post  => new.id,
      p_image => new.image_url
    );
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 3. WHAT THE FRONT PAGE COUNTS
--
-- Real numbers or none. A landing page claiming "500+ products" when the
-- database holds twelve is the kind of lie that is found out by clicking
-- through, and this one is a click away from the actual house.
--
-- Readable by ANYBODY, because that is the point -- it is what the page says
-- about itself, and it is three integers with nothing private in them.
-- =============================================================================

create or replace view v_platform_summary as
select
  (select count(*) from shops where status = 'active')                      as shops,
  (select count(*) from products where status = 'published')                as products,
  (select count(*) from placement_slots where is_active)                    as positions,
  (select count(*) from v_available_slots)                                  as positions_free,
  (select count(*) from rooms r join scenes s on s.id = r.scene_id
                          where s.is_published)                             as rooms;

comment on view v_platform_summary is
  'Three honest numbers for the front page. Real or none -- a landing page '
  'claiming hundreds of products is a click away from the house that has '
  'twelve.';

grant select on v_platform_summary to anon, authenticated;
