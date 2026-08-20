-- =============================================================================
-- What you want to hear about, and an email worth opening
--
-- Three things 0015 left rough.
--
-- ONE SWITCH IS NOT ENOUGH. `shop_follows.notify` is a single boolean, so a
-- follower's only choices were "everything by email" and "nothing". The thing
-- people actually want is narrower than that -- tell me when this shop puts
-- something new in the house, do not tell me every time they post -- and a
-- preference you cannot express is one you turn off entirely.
--
-- AN EMAIL ABOUT A PRODUCT SHOULD SHOW THE PRODUCT. 0015 sent a title and a
-- paragraph, which is a notification, not a shop's news. A bed is a
-- photograph and a price; a mail with neither is asking somebody to click to
-- find out whether they care.
--
-- AND THE SENDER NEEDED THE SERVICE-ROLE KEY, which is the most dangerous
-- credential the platform has -- it bypasses every policy in the database --
-- and it was wanted for one job: reading a table with no read policy. So the
-- table keeps its no-read policy and gets two security-definer functions
-- instead, guarded by a shared secret whose SHA-256 is all the database
-- stores. The sender holds a secret that can drain the outbox and do nothing
-- else, which is the least authority that does the job.
--
-- Run after 0016.
-- =============================================================================

-- =============================================================================
-- 1. WHAT A FOLLOWER WANTS TO HEAR ABOUT
-- =============================================================================

alter table shop_follows
  add column if not exists notify_products boolean not null default true,
  add column if not exists notify_posts    boolean not null default true;

comment on column shop_follows.notify is
  'The master switch: email me at all. Off means the notifications still '
  'appear in the app and nothing reaches the inbox.';
comment on column shop_follows.notify_products is
  'Email me when this shop puts something new in the house.';
comment on column shop_follows.notify_posts is
  'Email me when this shop writes an announcement.';

-- =============================================================================
-- 2. AN EMAIL THAT SHOWS THE PRODUCT
--
-- Table layout, inline styles, no external stylesheet: every mail client
-- mangles something and the ones that mangle least are the ones you gave
-- least to mangle. The photograph is a plain <img> with a width attribute,
-- because Outlook ignores CSS width on images.
-- =============================================================================

create or replace function public.render_product_email(
  p_shop     shops,
  p_title    text,
  p_body     text,
  p_url      text,
  p_image    text default null,
  p_price    text default null,
  p_meta     text default null
) returns text
language sql immutable
as $$
  select format($html$<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2efe9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s — now showing at HomeLuxe 3D. %s</div>
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f2efe9;padding:32px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:16px;overflow:hidden;">

        <tr><td style="padding:22px 28px 0;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#a89a86;">New at %s</p>
        </td></tr>

        %s

        <tr><td style="padding:20px 28px 0;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#1c1a17;font-weight:normal;">%s</h1>
          %s
        </td></tr>

        <tr><td style="padding:12px 28px 0;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#514a41;">%s</p>
          %s
        </td></tr>

        <tr><td style="padding:24px 28px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#1c1a17;border-radius:9px;">
              <a href="%s" style="display:inline-block;padding:13px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Walk through and see it</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:0 28px 24px;">
          <div style="border-top:1px solid #ece7de;padding-top:14px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#a89a86;">
              You follow %s on HomeLuxe 3D, the virtual furniture showroom.
              Change what you hear about, or stop these, in your notification settings.
            </p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>$html$,
    p_title,
    coalesce(left(p_body, 90), ''),
    p_shop.name,
    -- The photograph, when there is one. A missing image must not leave a
    -- broken frame in somebody's inbox, so the whole row is absent instead.
    case when p_image is null or p_image = '' then ''
         else format(
           '<tr><td style="padding:16px 28px 0;"><img src="%s" width="484" alt="%s" '
           'style="display:block;width:100%%;max-width:484px;height:auto;border-radius:10px;border:0;"></td></tr>',
           p_image, p_title)
    end,
    p_title,
    case when p_price is null then ''
         else format(
           '<p style="margin:8px 0 0;font-family:Helvetica,Arial,sans-serif;'
           'font-size:19px;color:#1c1a17;">%s</p>', p_price)
    end,
    coalesce(p_body, ''),
    case when p_meta is null then ''
         else format(
           '<p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;'
           'font-size:12px;color:#a89a86;">%s</p>', p_meta)
    end,
    coalesce(p_url, 'https://homeluxe3d.co.bw/'),
    p_shop.name
  );
$$;

-- =============================================================================
-- 3. FAN-OUT, NOW WITH THE PRODUCT IN IT
-- =============================================================================

-- The 0015 version took six arguments; this one takes nine. `create or
-- replace` with a different argument count makes an OVERLOAD rather than a
-- replacement, and a three-argument call would then match both and fail as
-- ambiguous. The same mistake was made with register_asset in 0012.
drop function if exists public.notify_followers(
  uuid, notification_kind, text, text, text, uuid
);

create or replace function public.notify_followers(
  p_shop      uuid,
  p_kind      notification_kind,
  p_title     text,
  p_body      text default null,
  p_url       text default null,
  p_post      uuid default null,
  p_image     text default null,
  p_price     text default null,
  p_meta      text default null
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_shop   shops;
  v_count  integer := 0;
begin
  select * into v_shop from shops where id = p_shop;
  if v_shop is null or v_shop.status <> 'active' then
    return 0;
  end if;

  with followers as (
    select f.user_id, u.email, p.display_name,
           -- The master switch AND the one for this kind of news. Either off
           -- means no email; the notification is written regardless, because
           -- "do not email me" is not "do not tell me".
           f.notify and case p_kind
             when 'new_product' then f.notify_products
             when 'shop_post'   then f.notify_posts
             else true
           end as wants_email
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
         v_shop.name || ': ' || p_title,
         public.render_product_email(v_shop, p_title, p_body, p_url, p_image, p_price, p_meta),
         p_title || coalesce(E'\n' || p_price, '') ||
           coalesce(E'\n\n' || p_body, '') || coalesce(E'\n\n' || p_url, '')
    from made m
    join followers f on f.user_id = m.user_id
   where f.wants_email
     and f.email is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- A product carries a picture and a price, and the email should have both.
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

    -- NAMED ARGUMENTS, because there is an optional `p_post` in the middle
    -- of this signature and counting past it put the product's photograph
    -- where the post id goes. Positional notation is only safe while nobody
    -- ever inserts a parameter, and somebody just did.
    perform public.notify_followers(
      p_shop  => new.shop_id,
      p_kind  => 'new_product',
      p_title => new.name,
      p_body  => coalesce(new.description, 'Now showing in the house.'),
      p_url   => v_site || '/?product=' || new.slug,
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
-- 4. DRAINING THE OUTBOX WITHOUT THE SERVICE-ROLE KEY
--
-- The outbox holds other people's email addresses and has no read policy, so
-- something privileged has to read it. The service role would do it and would
-- also be able to do everything else in the database; these two functions can
-- do this and nothing else.
--
-- The secret is stored as a SHA-256 digest, so a database dump does not hand
-- somebody the ability to drain the queue.
-- =============================================================================

-- pgcrypto lives in the `extensions` schema on Supabase, and every function
-- here pins `search_path = public` -- which is the right thing to do and the
-- reason a bare `digest(...)` is not found. Qualified, so it resolves whatever
-- the caller's search path happens to be.
create table if not exists platform_secrets (
  key        text primary key,
  digest     bytea not null,
  updated_at timestamptz not null default now()
);

alter table platform_secrets enable row level security;
-- Deliberately NO policy. Nothing reaches this through PostgREST; only the
-- security-definer functions below read it.
revoke all on platform_secrets from anon, authenticated;

create or replace function public.set_platform_secret(p_key text, p_value text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only a platform admin may set a platform secret';
  end if;
  insert into platform_secrets (key, digest, updated_at)
  values (p_key, extensions.digest(p_value, 'sha256'), now())
  on conflict (key) do update
    set digest = excluded.digest, updated_at = now();
  return true;
end;
$$;

create or replace function public.check_platform_secret(p_key text, p_value text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from platform_secrets
     where key = p_key and digest = extensions.digest(p_value, 'sha256')
  );
$$;

/* Take the next batch, marking it claimed in the same statement.
 *
 * CLAIMED IN ONE UPDATE, not read-then-write. Two senders running at once --
 * a schedule firing while somebody presses the button -- would otherwise both
 * read the same pending rows and both send them, and there is no unsend.
 * `for update skip locked` is what makes the second caller take different
 * rows instead of waiting for the first. */
create or replace function public.claim_email_batch(
  p_secret text,
  p_limit  integer default 25
) returns table (
  id uuid, to_email text, to_name text, subject text, html text,
  body_text text, attempts integer
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.check_platform_secret('notify', p_secret) then
    raise exception 'not authorised to drain the outbox';
  end if;

  return query
  with picked as (
    select o.id from email_outbox o
     where o.status = 'pending' and o.attempts < 4
     order by o.created_at
     limit p_limit
     for update skip locked
  )
  update email_outbox o
     set status = 'sending', claimed_at = now()
    from picked
   where o.id = picked.id
  returning o.id, o.to_email, o.to_name, o.subject, o.html, o.body_text, o.attempts;
end;
$$;

/* Record what the provider said. */
create or replace function public.finish_email(
  p_secret      text,
  p_id          uuid,
  p_provider_id text default null,
  p_error       text default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_attempts integer;
begin
  if not public.check_platform_secret('notify', p_secret) then
    raise exception 'not authorised';
  end if;

  select attempts + 1 into v_attempts from email_outbox where id = p_id;

  update email_outbox
     set attempts = v_attempts,
         -- CAST, because `status` is an enum and a bare CASE is text. Postgres
         -- refuses it with 42804 -- and the caller silently ignored the
         -- refusal, so two messages sat in `sending` for ever while the API
         -- happily reported one sent. The identical mistake was made in
         -- validate_asset_version in 0011.
         status = (case
           when p_error is null then 'sent'
           -- Back to pending while there are tries left: a rate limit or a
           -- blip should not condemn a message for ever. Only a row that has
           -- used up its attempts is called failed, and by then `error` says
           -- why.
           when v_attempts >= 4 then 'failed'
           else 'pending'
         end)::email_status,
         provider_id = coalesce(p_provider_id, provider_id),
         error = p_error,
         sent_at = case when p_error is null then now() else sent_at end
   where id = p_id;
  return true;
end;
$$;

comment on function public.claim_email_batch is
  'Take pending mail and mark it claimed in one statement, so two senders '
  'cannot both take the same row. Guarded by a shared secret rather than the '
  'service-role key: this can drain the outbox and do nothing else.';
