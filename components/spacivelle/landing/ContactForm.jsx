import React, { useState } from 'react';

import { getSupabase } from '../../../lib/supabase/client';

/**
 * The contact form on the front page.
 *
 * IT WRITES A ROW. That is worth stating plainly, because the last thing on
 * this site that looked like a form -- "Enquire at Tubod Enterprises" --
 * recorded an analytics event and threw the message away, and nobody noticed
 * for fifteen migrations. A form that silently does nothing is worse than no
 * form, because it looks like it worked.
 *
 * NO ACCOUNT NEEDED, deliberately, and the opposite of the rule for product
 * enquiries. An enquiry is answered IN THE APP, so the asker needs somewhere
 * to receive it; this is answered by email to an address they typed. Making a
 * shop register before it can ask "can we advertise with you" would turn away
 * the exact people the page exists for.
 */
const KINDS = [
  ['shop', 'I sell furniture or finishes'],
  ['visitor', 'I am furnishing a home'],
  ['support', 'Something is not working'],
  ['other', 'Something else'],
];

const ContactForm = () => {
  const [form, setForm] = useState({
    kind: 'shop', name: '', email: '', phone: '', company: '', message: '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [sent, setSent] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);

    const supabase = getSupabase();
    if (!supabase) {
      setProblem('The site is not connected to its database, so this cannot be sent yet.');
      setBusy(false);
      return;
    }

    try {
      // The signed-in id when there is one. The policy allows null OR your
      // own id and nothing else, so a message cannot be filed under somebody
      // else's account.
      const { data: auth } = await supabase.auth.getUser();

      const { error } = await supabase.from('contact_messages').insert({
        kind: form.kind,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        message: form.message.trim(),
        user_id: auth?.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      setSent(true);
    } catch (err) {
      setProblem(
        /row-level security/i.test(err.message)
          ? 'That was refused. Check the email address and try again.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="lp-form lp-form-sent">
        <p className="luxe-note good">
          Thank you — we have it. We answer by email, usually within a day.
        </p>
        <p className="luxe-sub" style={{ margin: 0 }}>
          In the meantime, the house is open.
        </p>
        <a className="luxe-btn ghost" href="/showroom">Walk through it</a>
      </div>
    );
  }

  return (
    <form className="lp-form" onSubmit={submit}>
      <label className="luxe-field">
        <span>Which are you?</span>
        <select value={form.kind} onChange={set('kind')}>
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <div className="lp-form-row">
        <label className="luxe-field">
          <span>Your name</span>
          <input value={form.name} onChange={set('name')} required autoComplete="name" />
        </label>
        <label className="luxe-field">
          <span>Email</span>
          <input
            type="email" value={form.email} onChange={set('email')}
            required autoComplete="email"
          />
        </label>
      </div>

      <div className="lp-form-row">
        <label className="luxe-field">
          <span>Shop or company</span>
          <input value={form.company} onChange={set('company')} autoComplete="organization" />
        </label>
        <label className="luxe-field">
          <span>Phone</span>
          <input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
        </label>
      </div>

      <label className="luxe-field">
        <span>What would you like to tell us?</span>
        <textarea
          rows={4} value={form.message} onChange={set('message')} required
          placeholder="We sell lounge suites and dining tables in Broadhurst, and we would like to be in the house."
        />
      </label>

      {problem && <p className="luxe-note bad">{problem}</p>}

      <button type="submit" className="luxe-btn primary lp-btn-lg" disabled={busy}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
};

export default ContactForm;
