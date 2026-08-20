import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { EmailNotConfigured, emailConfig, sendEmail } from "../../../../lib/email/Resend";

/**
 * Drain the email outbox.
 *
 * THE OUTBOX IS A SEAM, AND THIS IS THE OTHER SIDE OF IT. Publishing a
 * product writes rows and returns; this reads them and talks to Resend. The
 * two are deliberately not welded together -- a slow provider must not make
 * publishing slow, and a provider that is down must not make publishing fail.
 *
 * CLAIMED BEFORE SENT. A row goes pending -> sending -> sent, and the claim
 * happens inside one statement in the database, with `for update skip locked`.
 * Two senders running at once -- a schedule firing while somebody presses the
 * button -- take different rows rather than both taking the same one. Without
 * that, a retry sends the email twice, and there is no way to unsend.
 *
 * NOT PUBLIC. Anyone who can call this can make the platform send mail, so it
 * wants the shared secret, compared in constant time -- comparing secrets with
 * === leaks their length and prefix to anybody willing to measure.
 *
 * AND IT DOES NOT HOLD THE SERVICE-ROLE KEY. The outbox has no read policy
 * because it holds other people's email addresses, and the obvious way to read
 * it anyway is the service role -- which would also let this route do
 * absolutely anything else in the database, for the sake of one query. It uses
 * the ordinary anon key and two security-definer functions instead, guarded by
 * the same secret. The most this endpoint can do, if the secret leaks, is send
 * the mail that was already queued.
 */

/**
 * One row of the outbox, as `claim_email_batch` returns it.
 *
 * Written out because the generated Supabase types do not cover functions
 * that return a table, so the rows arrive as `object` and every field access
 * is a compile error. Naming the shape here is also the only place that says
 * what the sender actually needs from a queued message.
 */
type QueuedEmail = {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  html: string;
  body_text: string | null;
  attempts: number;
};

export const runtime = "nodejs";       // never the edge cache: this must not be replayed
export const dynamic = "force-dynamic";

/** How many to take in one pass. Small: a cron runs often and retries cost nothing. */
const BATCH = 25;

// How many tries a message gets is the DATABASE's business, not this file's:
// `claim_email_batch` will not hand back a row that has used up its attempts,
// and `finish_email` is the one counting. Keeping a second copy of the number
// here is how the two drift apart.

export async function POST(request: Request) {
  const denied = authorise(request);
  if (denied) return denied;

  const config = emailConfig();
  if (!config.ready) {
    // 503, not 500: the code is fine, the deployment is not finished. And
    // nothing is claimed, so every pending row is still pending.
    return NextResponse.json(
      { ok: false, error: new EmailNotConfigured(config.missing).message },
      { status: 503 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const secret = process.env.NOTIFY_SECRET as string;
  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -- claim ---------------------------------------------------------------
  // One statement takes the batch and marks it `sending`, so a schedule
  // firing while somebody presses the button cannot hand the same message to
  // Resend twice. There is no unsend.
  const { data, error: claimError } = await db.rpc("claim_email_batch", {
    p_secret: secret,
    p_limit: BATCH,
  });
  const claimed = (data ?? []) as QueuedEmail[];

  if (claimError) {
    return NextResponse.json({ ok: false, error: claimError.message }, { status: 500 });
  }
  if (!claimed.length) {
    return NextResponse.json({ ok: true, claimed: 0, sent: 0, failed: 0 });
  }

  // -- send ----------------------------------------------------------------
  let sent = 0;
  let failed = 0;
  const problems: string[] = [];

  for (const row of claimed) {
    try {
      const { id } = await sendEmail({
        to: row.to_email,
        subject: row.subject,
        html: row.html,
        text: row.body_text ?? undefined,
      });
      // CHECKED, NOT FIRED AND FORGOTTEN. The first version ignored what
      // this returned, so when the function was refusing every call the API
      // still reported the mail as sent and the rows sat in `sending` for
      // ever. A write whose result nobody looks at is a write that might not
      // have happened.
      const { error: markError } = await db.rpc("finish_email", {
        p_secret: secret,
        p_id: row.id,
        p_provider_id: id,
        p_error: null,
      });
      if (markError) {
        // The mail HAS gone. Saying otherwise would make a retry send it
        // twice, so this counts as sent and shouts about the bookkeeping.
        problems.push(
          `${row.to_email}: sent, but the outbox could not be updated ` +
          `(${markError.message}). It may be retried and sent twice.`
        );
      }
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The database decides whether this becomes `failed` or goes back to
      // `pending` for another try -- it is the one counting the attempts.
      const { error: markError } = await db.rpc("finish_email", {
        p_secret: secret,
        p_id: row.id,
        p_provider_id: null,
        p_error: message,
      });
      failed += 1;
      if (markError) {
        problems.push(`${row.to_email}: could not record the failure (${markError.message})`);
      }
      problems.push(`${row.to_email}: ${message}`);
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    claimed: claimed.length,
    sent,
    failed,
    ...(problems.length ? { problems } : {}),
    ...(config.isTestSender
      ? {
          note:
            "RESEND_FROM is Resend's shared test sender, which only delivers " +
            "to the address that owns the Resend account. Everything else is " +
            "refused, and that looks like the fan-out being broken when it is not.",
        }
      : {}),
  });
}

/** A GET says whether it is wired up, without sending anything. */
export async function GET(request: Request) {
  const denied = authorise(request);
  if (denied) return denied;

  const config = emailConfig();
  return NextResponse.json({
    ready: config.ready,
    missing: config.missing,
    from: config.from ?? null,
    testSender: config.isTestSender,
  });
}

/**
 * Who may ask for mail to be sent.
 *
 * Vercel signs its own cron requests with a header carrying CRON_SECRET; a
 * human or the admin screen sends the same secret as a bearer token. Either
 * is fine, neither is optional, and with no secret configured the endpoint is
 * closed rather than open -- the failure mode of a mail sender that anyone
 * can invoke is worse than one nobody can.
 */
function authorise(request: Request): NextResponse | null {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NOTIFY_SECRET is not set, so this endpoint is closed. Set it and " +
          "send it as `Authorization: Bearer <secret>`.",
      },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const offered = header.replace(/^Bearer\s+/i, "");
  if (!safeEqual(offered, secret)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  return null;
}

/** Constant time, so a wrong guess reveals nothing about how wrong it was. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
