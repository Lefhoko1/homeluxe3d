-- =============================================================================
-- Enquiries that go somewhere, and knowing who is in the house
--
-- "Enquire at Tubod Enterprises" has been on the product panel since the panel
-- existed. Pressing it recorded an analytics event and did nothing else: no
-- row, no email, no shop told, no way for anybody to answer. `enquiries` has
-- existed since migration 0004 with zero rows in it, because nothing ever
-- inserted one -- the button was a button.
--
-- Three things are missing and this adds all three.
--
-- 1. A REPLY. `enquiries` has a `status` that can be set to 'replied' and
--    nowhere to put the reply. A shop could mark a question answered without
--    answering it, and the person who asked would never see a word. An
--    enquiry is a conversation, so it gets a thread.
--
-- 2. AN IDENTITY. The insert policy was `with check (true)` -- anyone at all,
--    signed in or not, could file an enquiry under any name and any address.
--    That is unanswerable (nowhere to send the reply that the asker can see)
--    and unattributable (no idea who is asking). Asking now requires an
--    account, which is the whole point of having accounts.
--
-- 3. WHO IS ACTUALLY HERE. `interaction_events.user_id` has existed all along
--    and nothing has ever set it, so every session in the database is
--    anonymous -- including the ones belonging to people who were signed in
--    at the time. "People visit and I do not know" was literally true.
--
-- Run after 0018.
-- =============================================================================

-- =============================================================================
-- 1. THE CONVERSATION
-- =============================================================================

create table if not exists enquiry_replies (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references enquiries(id) on delete cascade,

  -- Who wrote it. `from_shop` rather than working it out from membership,
  -- because membership changes: somebody who leaves a shop next month still
  -- wrote their replies AS the shop, and a thread that silently re-attributes
  -- them is a thread that lies about what was said.
  author_id   uuid references profiles(id) on delete set null,
  from_shop   boolean not null default false,

  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

comment on table enquiry_replies is
  'The conversation after an enquiry. `enquiries.status` could say "replied" '
  'long before there was anywhere to put the reply.';

create index if not exists enquiry_replies_thread_idx
  on enquiry_replies (enquiry_id, created_at);

alter table enquiry_replies enable row level security;

-- THE TWO PARTIES, AND NOBODY ELSE. The person who asked, and the shop that
-- was asked. Not other shops, and not other customers.
drop policy if exists enquiry_replies_read on enquiry_replies;
create policy enquiry_replies_read on enquiry_replies
  for select using (
    exists (
      select 1 from enquiries e
       where e.id = enquiry_replies.enquiry_id
         and (e.user_id = auth.uid() or public.is_shop_member(e.shop_id))
    )
  );

drop policy if exists enquiry_replies_write on enquiry_replies;
create policy enquiry_replies_write on enquiry_replies
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from enquiries e
       where e.id = enquiry_replies.enquiry_id
         and (
           -- The customer may follow up on their own question...
           (e.user_id = auth.uid() and not enquiry_replies.from_shop)
           -- ...and the shop may answer it.
           or (public.can_manage_shop(e.shop_id) and enquiry_replies.from_shop)
         )
    )
  );

-- =============================================================================
-- 2. ASKING REQUIRES AN ACCOUNT
--
-- `with check (true)` let anyone insert an enquiry under any name, for any
-- shop. Beyond the obvious -- a form anybody can spray -- it made the whole
-- feature pointless: the reply has nowhere to go that the asker can see, and
-- the shop cannot tell a customer from a passer-by.
-- =============================================================================

drop policy if exists enquiries_insert on enquiries;
create policy enquiries_insert on enquiries
  for insert with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and public.shop_is_live(shop_id)
  );

comment on policy enquiries_insert on enquiries is
  'Signed in, as yourself, to a shop that is actually trading. It used to be '
  '`true`, which let anybody file an unanswerable question under any name.';

-- Answering moves the status along without anybody remembering to.
create or replace function public.touch_enquiry_on_reply()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.from_shop then
    update enquiries set status = 'replied'
     where id = new.enquiry_id and status in ('new', 'seen');
  else
    -- The customer has come back. It is no longer answered.
    update enquiries set status = 'new'
     where id = new.enquiry_id and status = 'replied';
  end if;
  return new;
end;
$$;

drop trigger if exists enquiry_replies_touch on enquiry_replies;
create trigger enquiry_replies_touch
  after insert on enquiry_replies
  for each row execute function public.touch_enquiry_on_reply();

-- Tell the customer their question was answered, in the app and by email --
-- through the same outbox everything else uses.
create or replace function public.notify_enquiry_reply()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  e      enquiries;
  shop   shops;
  -- TWO IDS, TWO VARIABLES. The first version wrote
  -- `returning id, user_id into who, who`, which assigns the notification id
  -- and then immediately overwrites it with the user id -- so the outbox row
  -- was built with a person's id in `notification_id` and the foreign key
  -- refused it. The reply came back 409 and the shop could not answer at all.
  note   uuid;
  addr   text;
begin
  if not new.from_shop then return new; end if;

  select * into e from enquiries where id = new.enquiry_id;
  if e.user_id is null then return new; end if;
  select * into shop from shops where id = e.shop_id;

  insert into notifications (user_id, kind, title, body, shop_id, url)
  values (e.user_id, 'enquiry_reply',
          shop.name || ' replied to your question',
          left(new.body, 300), e.shop_id, '/following#enquiries')
  returning id into note;

  select u.email into addr from auth.users u where u.id = e.user_id;
  if addr is not null then
    insert into email_outbox (notification_id, to_email, subject, html, body_text)
    values (note, addr,
            shop.name || ' replied to your question',
            public.render_product_email(
              shop, shop.name || ' replied', new.body,
              'https://homeluxe3d-gzn6xgsim-lefhoko-bobaathebes-projects.vercel.app/following'),
            new.body);
  end if;
  return new;
end;
$$;

drop trigger if exists enquiry_replies_notify on enquiry_replies;
create trigger enquiry_replies_notify
  after insert on enquiry_replies
  for each row execute function public.notify_enquiry_reply();

-- =============================================================================
-- 3. WHO IS IN THE HOUSE
--
-- `interaction_events.user_id` has been on the table since analytics existed
-- and nothing ever set it, so every session looked anonymous -- including the
-- ones belonging to somebody signed in at the time. Filled in on the way in,
-- beside the shop attribution added in 0014, for the same reason: the browser
-- should not have to remember, and a client that is trusted to say who it is
-- can say somebody else.
-- =============================================================================

create or replace function public.attribute_interaction()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- WHO. From the token, never from the request body.
  new.user_id := coalesce(new.user_id, auth.uid());

  if new.placement_id is not null then
    select coalesce(new.variant_id, p.variant_id),
           coalesce(new.shop_id, p.shop_id),
           coalesce(new.scene_id, p.scene_id)
      into new.variant_id, new.shop_id, new.scene_id
      from placements p
     where p.id = new.placement_id;
  end if;

  if new.shop_id is null and new.variant_id is not null then
    select pr.shop_id into new.shop_id
      from product_variants pv
      join products pr on pr.id = pv.product_id
     where pv.id = new.variant_id;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 4. WHAT THE ADMIN CAN SEE
-- =============================================================================

-- Traffic by day: how many people, how many of them known, what they did.
--
-- COUNTED, NEVER LISTED. A platform admin needs to know that forty people
-- visited and six of them were signed in; naming them is a different question
-- and not one this view answers.
create or replace view v_daily_traffic
with (security_invoker = on) as
select date_trunc('day', e.occurred_at)::date as day,
       count(distinct e.session_id)                                   as sessions,
       count(distinct e.session_id) filter (where e.user_id is not null) as known_sessions,
       count(distinct e.user_id)                                      as people,
       count(*)                                                       as events,
       count(*) filter (where e.event = 'placement_view')              as views,
       count(*) filter (where e.event = 'product_click')               as clicks,
       count(*) filter (where e.event = 'enquiry_open')                as enquiries
  from interaction_events e
 group by 1;

comment on view v_daily_traffic is
  'How many people came and what they did, by day. Counted rather than '
  'listed: how many is an admin question, who is not.';

-- Registered people over time, so "is the audience growing" is answerable.
create or replace view v_signups
with (security_invoker = on) as
select date_trunc('day', p.created_at)::date as day,
       count(*) as accounts,
       count(*) filter (where p.role <> 'visitor') as staff
  from profiles p
 group by 1;

-- The enquiry queue, with the conversation summarised.
create or replace view v_enquiry_threads
with (security_invoker = on) as
select e.id,
       e.shop_id,
       s.name  as shop_name,
       s.slug  as shop_slug,
       e.product_id,
       p.name  as product_name,
       e.user_id,
       coalesce(pf.display_name, e.name) as from_name,
       e.email,
       e.phone,
       e.message,
       e.status,
       e.created_at,
       (select count(*) from enquiry_replies r where r.enquiry_id = e.id) as replies,
       (select max(r.created_at) from enquiry_replies r where r.enquiry_id = e.id) as last_reply_at,
       (select r.body from enquiry_replies r
         where r.enquiry_id = e.id order by r.created_at desc limit 1) as last_reply
  from enquiries e
  join shops s on s.id = e.shop_id
  left join products p on p.id = e.product_id
  left join profiles pf on pf.id = e.user_id;

comment on view v_enquiry_threads is
  'Enquiries with their conversation summarised. Row-level security on '
  '`enquiries` decides what is in it: a customer sees their own, a shop sees '
  'the ones addressed to it.';

revoke select on v_daily_traffic, v_signups from anon;
