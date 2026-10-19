-- Spacivelle 3D: refresh email branding in databases with prior migrations applied.
-- Existing delivery URLs and function signatures are preserved.

begin;

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
            You are getting this because you follow %s on Spacivelle 3D.
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s — now showing at Spacivelle 3D. %s</div>
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
              You follow %s on Spacivelle 3D, the virtual furniture showroom.
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

commit;
