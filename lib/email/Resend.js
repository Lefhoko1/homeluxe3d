/**
 * Sending mail through Resend.
 *
 * SERVER ONLY. Nothing here may be imported into a client component: the API
 * key is a bearer token for sending mail as your domain, and a key that
 * reaches a browser is a key that sends mail as your domain from anywhere.
 * There is no NEXT_PUBLIC_ variable in this file and there must never be one.
 *
 * NO SDK. Resend's send endpoint is one POST with a JSON body, and a
 * dependency to do that is a dependency to keep up to date, audit, and bundle.
 * The interesting part of sending mail is not the HTTP call -- it is knowing
 * what went wrong when it fails, which is what `explain` is for.
 */

const ENDPOINT = "https://api.resend.com/emails";

export class EmailNotConfigured extends Error {
  constructor(missing) {
    super(
      `Email is not configured: ${missing.join(" and ")} missing. ` +
      `Set them in .env.local (they are server-side, never NEXT_PUBLIC_). ` +
      `Nothing has been sent and nothing was marked as sent.`
    );
    this.name = "EmailNotConfigured";
    this.missing = missing;
  }
}

/**
 * What the environment says, checked once and honestly.
 *
 * FAILS LOUDLY WHEN UNSET rather than pretending to send. A mail system that
 * quietly does nothing is worse than one that is plainly switched off: the
 * outbox would drain, every row would say `sent`, and nobody would find out
 * until a shop asked why their followers never heard from them.
 */
export function emailConfig() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  const missing = [];
  if (!key) missing.push("RESEND_API_KEY");
  if (!from) missing.push("RESEND_FROM");

  return {
    key,
    from,
    ready: missing.length === 0,
    missing,
    // Resend's shared sender works with no verified domain but will only
    // deliver to the address that owns the Resend account. Worth saying out
    // loud, because "it worked for me and nobody else got it" is the exact
    // symptom and it looks like a bug in the fan-out.
    isTestSender: (from ?? "").includes("onboarding@resend.dev"),
  };
}

/**
 * Send one message.
 *
 * @param {{
 *   to: string,
 *   subject: string,
 *   html: string,
 *   text?: string,
 *   replyTo?: string,
 * }} message
 * @returns {Promise<{id: string}>} the provider's id for the message, which
 *   is what makes a delivery traceable afterwards.
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const config = emailConfig();
  if (!config.ready) throw new EmailNotConfigured(config.missing);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(explain(response.status, payload, config));
  }
  return { id: payload.id };
}

/**
 * Turn a refusal into something that says what to do about it.
 *
 * Every one of these is a real thing that happens on the way to a working
 * mail setup, and each has a different fix. "422" on its own has none.
 */
function explain(status, payload, config) {
  const message = payload?.message ?? payload?.error ?? `HTTP ${status}`;

  // THE TEST KEY'S RECIPIENT LIMIT ARRIVES AS A 403, which reads as an
  // authentication failure and is not one: the key is fine and the recipient
  // is not allowed. Checked before the generic 401/403, because "check your
  // API key" sends somebody to rotate a key that was never the problem.
  if (/only send testing emails to your own/i.test(message)) {
    return (
      `Resend would not send to ${payload?.to ?? "that address"}: the API key ` +
      `is a test key, which only delivers to the address that owns the Resend ` +
      `account. Verify a domain at resend.com/domains and set RESEND_FROM to ` +
      `an address on it to reach anybody else. (${message})`
    );
  }
  if (status === 401 || status === 403) {
    return `Resend refused the API key (${message}). Check RESEND_API_KEY.`;
  }
  if (status === 422 && /domain is not verified/i.test(message)) {
    return (
      `Resend will not send from ${config.from}: the domain is not verified. ` +
      `Verify it in Resend, or set RESEND_FROM to onboarding@resend.dev, ` +
      `which sends only to the address that owns the Resend account.`
    );
  }
  if (status === 422 && config.isTestSender) {
    return (
      `Resend refused this (${message}). RESEND_FROM is the shared test ` +
      `sender, which can only deliver to the address that owns the Resend ` +
      `account -- any other recipient is rejected.`
    );
  }
  if (status === 429) {
    return `Resend is rate limiting (${message}). The row stays pending and will be retried.`;
  }
  return `Resend refused this (${status}): ${message}`;
}

export default sendEmail;
