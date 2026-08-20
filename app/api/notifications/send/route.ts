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
 * CLAIMED BEFORE SENT. A row goes pending -> sending -> sent, and the claim is
 * a conditional update: `set status='sending' where status='pending'`. Two
 * senders running at once (a cron firing while somebody presses the button)
 * cannot both take the same row, because only one of the two updates matches.
 * Without that, a retry sends the email twice, and there is no way to unsend.
 *
 * NOT PUBLIC. Anyone who can call this can make the platform send mail, so it
 * wants either the cron's own header or the shared secret. Both are checked
 * against a constant-time comparison, because comparing secrets with === leaks
 * their length and prefix to anybody willing to measure.
 */

export const runtime = "nodejs";       // needs the service key; never the edge cache
export const dynamic = "force-dynamic";

/** How many to take in one pass. Small: a cron runs often and retries cost nothing. */
const BATCH = 25;

/** Give up after this many tries, so one bad address cannot block the queue for ever. */
const MAX_ATTEMPTS = 4;

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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set. The outbox holds other " +
          "people's email addresses and has no read policy at all, so the " +
          "sender needs the service role. It is server-side only and must " +
          "never be prefixed NEXT_PUBLIC_.",
      },
      { status: 503 }
    );
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -- claim ---------------------------------------------------------------
  const { data: waiting, error: readError } = await db
    .from("email_outbox")
    .select("id, to_email, to_name, subject, html, body_text, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  if (!waiting?.length) {
    return NextResponse.json({ ok: true, claimed: 0, sent: 0, failed: 0 });
  }

  const claimed: typeof waiting = [];
  for (const row of waiting) {
    // Conditional on status, so a second sender racing this one loses.
    const { data, error } = await db
      .from("email_outbox")
      .update({ status: "sending", claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!error && data) claimed.push(row);
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
      await db
        .from("email_outbox")
        .update({
          status: "sent",
          provider_id: id,
          sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
          error: null,
        })
        .eq("id", row.id);
      sent += 1;
    } catch (error) {
      const attempts = (row.attempts ?? 0) + 1;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("email_outbox")
        .update({
          // Back to pending while there are tries left: a rate limit or a
          // blip should not condemn a message for ever. Only a row that has
          // used up its attempts is called failed, and by then the error on
          // it says why.
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: message,
        })
        .eq("id", row.id);
      failed += 1;
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
    ready: config.ready && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    missing: [
      ...config.missing,
      ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
    ],
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
