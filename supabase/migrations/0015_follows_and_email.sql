-- =============================================================================
-- Following a shop, and being told when it publishes
--
-- `shop_follows` and `notifications` have existed since the early migrations
-- with nothing writing to them. A visitor could follow a shop -- the policy
-- allowed it -- and then never hear from it again, because nothing anywhere
-- turned "this shop published something" into "the people who asked to know
-- have been told".
--
-- THE FAN-OUT BELONGS IN THE DATABASE, not in whichever screen happened to
-- publish. A product can be published from the admin list, from the upload
-- dialog, or by a shop manager on their own; three call sites means three
-- chances to forget, and the one that forgets fails silently -- nobody
-- notices an email that was never sent. A trigger on the row that changed
-- cannot be bypassed.
--
-- EMAIL IS A ROW BEFORE IT IS A REQUEST. Sending happens outside the
-- transaction that caused it, so the two must not be welded together: if
-- Resend is slow, publishing a product must not be slow, and if Resend is
-- down, publishing must not fail. `email_outbox` is the seam. A row is
-- written in the same transaction as the notification -- so it cannot be lost
-- and cannot be written twice -- and something else drains it.
--
-- Run after 0014.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'email_status') then
    create type email_status as enum (
      'pending',    -- written, not yet handed to the provider
      'sending',    -- claimed by a sender, so two senders cannot both take it
      'sent',       -- the provider accepted it and gave us an id
      'failed',     -- the provider refused it; `error` says why
      'skipped'     -- deliberately not sent: no address, or unsubscribed
    );
  end if;
end $do$;

-- =============================================================================
-- 1. THE OUTBOX
-- =============================================================================

create table if not exists email_outbox (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete set null,

  -- THE ADDRESS IS COPIED, NOT JOINED. An email is a record of something that
  -- was sent to a particular address at a particular time; if the person
  -- changes their address next week, the history must not quietly rewrite
  -- itself to claim we wrote to the new one. It also means the sender needs
  -- no access to auth.users at all.
  to_email        text not null,
  to_name         text,

  subject         text not null,
  html            text not null,
  body_text       text,

  status          email_status not null default 'pending',
  attempts        integer not null default 0,
  provider_id     text,
  error           text,

  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  sent_at         timestamptz
);

comment on table email_outbox is
  'Email that should be sent, written in the same transaction as the thing '
  'that caused it. Draining it is somebody else''s job, so a slow or broken '
  'mail provider cannot slow down or break publishing.';

-- The sender asks exactly one question -- "what is waiting?" -- and it should
-- not read the whole table to answer it.
create index if not exists email_outbox_pending_idx
  on email_outbox (created_at) where status in ('pending', 'sending');

alter table email_outbox enable row level security;

-- NOBODY READS THIS FROM THE BROWSER. It holds email addresses belonging to
-- other people, which is the one thing on the platform with no business ever
-- reaching a client. There is deliberately no policy granting select: the
-- sender runs server-side and the platform admin sees delivery through
-- `v_email_health`, which counts rather than lists.
drop policy if exists email_outbox_admin on email_outbox;
create policy email_outbox_admin on email_outbox
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke select, insert, update, delete on email_outbox from anon, authenticated;

-- =============================================================================
-- 2. THE FAN-OUT
-- =============================================================================

create or replace function public.notify_followers(
  p_shop      uuid,
  p_kind      notification_kind,
  p_title     text,
  p_body      text default null,
  p_url       text default null,
  p_post      uuid default null
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_shop   shops;
  v_count  integer := 0;
begin
  select * into v_shop from shops where id = p_shop;
  if v_shop is null or v_shop.status <> 'active' then
    -- A suspended shop does not get to mail its followers. Its products are
    -- already out of the house; this is the same rule applied to the inbox.
    return 0;
  end if;

  with followers as (
    select f.user_id, u.email, p.display_name, f.notify
      from shop_follows f
      join auth.users u on u.id = f.user_id
      left join profiles p on p.id = f.user_id
     where f.shop_id = p_shop
  ),
  made as (
    insert into notifications (user_id, kind, title, body, shop_id, post_id, url)
    select user_id, p_kind, p_title, p_body, p_shop, p_post, p_url
      from followers
    returning id, user_id
  )
  insert into email_outbox (notification_id, to_email, to_name, subject, html, body_text)
  select m.id,
         f.email,
         f.display_name,
         v_shop.name || ' — ' || p_title,
         public.render_shop_email(v_shop, p_title, p_body, p_url),
         p_title || coalesce(E'\n\n' || p_body, '') ||
           coalesce(E'\n\n' || p_url, '')
    from made m
    join followers f on f.user_id = m.user_id
   -- IN-APP ALWAYS, EMAIL ONLY IF ASKED. `notify` is the follower's own
   -- switch: somebody who wants to see a shop's news when they visit but does
   -- not want it in their inbox is a normal person, not an edge case.
   where f.notify
     and f.email is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notify_followers is
  'Tell a shop''s followers something happened: a notification each, and an '
  'outbox row for those who asked to be emailed.';

-- =============================================================================
-- 3. WHAT COUNTS AS "PUBLISHED SOMETHING"
-- =============================================================================

-- A shop writing a post. This is the explicit case: somebody sat down and
-- wrote an announcement, and `published_at` going from null to a time is the
-- moment it became real.
create or replace function public.fanout_shop_post()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null) then
    perform public.notify_followers(
      new.shop_id, 'shop_post', new.title, left(coalesce(new.body, ''), 400),
      '/shops/' || (select slug from shops where id = new.shop_id),
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists shop_posts_fanout on shop_posts;
create trigger shop_posts_fanout
  after insert or update of published_at on shop_posts
  for each row execute function public.fanout_shop_post();

-- A shop publishing a product. The implicit case, and the commoner one: most
-- shops will never write a post, but every one of them adds stock.
create or replace function public.fanout_new_product()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public.notify_followers(
      new.shop_id, 'new_product', new.name,
      coalesce(new.description, 'Now showing in the house.'),
      '/?product=' || new.slug
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_fanout on products;
create trigger products_fanout
  after insert or update of status on products
  for each row execute function public.fanout_new_product();

-- =============================================================================
-- 4. THE EMAIL ITSELF
--
-- Written in SQL because it is written WHERE THE FACTS ARE. Rendering it in
-- the sender instead would mean the sender needs the shop, the product and
-- the follower -- three more joins, and a second place that has to agree
-- about what a notification says.
--
-- Deliberately plain HTML: inline styles, a table for the button, no external
-- images. Every mail client in the world mangles something, and the ones that
-- mangle least are the ones you gave least to mangle.
-- =============================================================================

create or replace function public.render_shop_email(
  p_shop  shops,
  p_title text,
  p_body  text,
  p_url   text
) returns text
language sql immutable
as $$
  select format($html$<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f1ec;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;">
        <tr><td style="padding:26px 30px 8px;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#9a8f80;">%s</p>
          <h1 style="margin:10px 0 0;font-size:25px;line-height:1.25;color:#1d1a16;font-weight:normal;">%s</h1>
        </td></tr>
        <tr><td style="padding:12px 30px 0;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#4a443c;">%s</p>
        </td></tr>
        <tr><td style="padding:24px 30px 30px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#1d1a16;border-radius:8px;">
              <a href="%s" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#ffffff;text-decoration:none;">See it in the house</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 30px 26px;border-top:1px solid #ece7df;">
          <p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#9a8f80;">
            You are getting this because you follow %s on HomeLuxe 3D.
            You can stop these from your notification settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$html$,
    p_shop.name,
    p_title,
    coalesce(p_body, ''),
    coalesce(p_url, '/'),
    p_shop.name
  );
$$;

-- =============================================================================
-- 5. FOLLOWING, AND WHAT A VISITOR SEES
-- =============================================================================

-- Who follows whom, as counts. A shop may see how many follow it; nobody may
-- see WHO, which is a different question and not one a shop gets to ask.
create or replace view v_shop_follower_counts
with (security_invoker = on) as
select s.id as shop_id, s.slug, s.name,
       count(f.user_id) as followers,
       count(*) filter (where f.notify) as email_followers
  from shops s
  left join shop_follows f on f.shop_id = s.id
 group by s.id, s.slug, s.name;

-- Delivery, as counts rather than addresses, so the admin health screen can
-- say "4 failed" without anybody reading a stranger's inbox.
create or replace view v_email_health
with (security_invoker = on) as
select status, count(*) as emails, max(created_at) as latest
  from email_outbox
 group by status;

revoke select on v_email_health from anon;

comment on view v_email_health is
  'Delivery counted, never listed. The outbox holds other people''s email '
  'addresses and nothing in a browser has any business reading them.';
