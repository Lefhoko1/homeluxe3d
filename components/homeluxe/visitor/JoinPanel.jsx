import React, { useState } from 'react';

import { VisitorService } from '../../../lib/visitor/VisitorService';
import '../homeluxe.css';
import '../visitor.css';

/**
 * Creating an account, or getting back into one.
 *
 * ONE PANEL, TWO MODES. Registering and signing in are the same three fields
 * and the same button in a different order, and splitting them across two
 * pages means somebody who guessed wrong has to find the other one. The
 * switch is one line at the bottom, where it belongs.
 *
 * WHAT THE ACCOUNT IS FOR IS SAID UP FRONT. "Create an account" is a chore;
 * "hear when a shop puts something new in the house" is a reason. Nobody
 * registers for a virtual showroom out of habit.
 */
const JoinPanel = ({ mode: initialMode = 'register', onDone }) => {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const service = React.useMemo(() => new VisitorService(), []);
  const registering = mode === 'register';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setConfirm(null);

    try {
      if (registering) {
        const { needsConfirmation } = await service.register({
          email: form.email,
          password: form.password,
          displayName: form.name,
        });
        if (needsConfirmation) {
          // Say so rather than pretending they are in. A page that looks
          // signed-in and then refuses every action is worse than a sentence.
          setConfirm(
            `Almost there. Open the link we sent to ${form.email.trim()} to ` +
            `finish, then come back and sign in.`
          );
          return;
        }
      } else {
        await service.signIn(form.email, form.password);
      }
      onDone?.();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="luxe-narrow">
      <p className="cinematic-eyebrow">
        {registering ? 'Join HomeLuxe' : 'Welcome back'}
      </p>
      <h1 className="luxe-lede">
        {registering
          ? 'Hear it first, from the shops you like.'
          : 'Sign in to your shops.'}
      </h1>
      <p className="luxe-sub">
        {registering
          ? 'Follow a shop and we will email you when they put something new in ' +
            'the house — with the photograph and the price, so you know whether ' +
            'it is worth the walk.'
          : 'Your follows and everything you have been told are waiting.'}
      </p>

      <div className="luxe-card">
        <form className="luxe-form" onSubmit={submit}>
          {registering && (
            <label className="luxe-field">
              <span>Your name</span>
              <input
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
                placeholder="What shall we call you?"
              />
            </label>
          )}

          <label className="luxe-field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              required
            />
          </label>

          <label className="luxe-field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={registering ? 'new-password' : 'current-password'}
              required
              minLength={registering ? 8 : undefined}
            />
            {registering && (
              <em className="luxe-hint">At least 8 characters.</em>
            )}
          </label>

          {problem && <p className="luxe-note bad">{problem}</p>}
          {confirm && <p className="luxe-note good">{confirm}</p>}

          <button type="submit" className="luxe-btn primary" disabled={busy}>
            {busy
              ? (registering ? 'Creating…' : 'Signing in…')
              : (registering ? 'Create my account' : 'Sign in')}
          </button>
        </form>

        <div className="luxe-switchers">
          <span>
            {registering ? 'Already have an account?' : 'New here?'}
          </span>
          <button
            type="button"
            className="luxe-link"
            onClick={() => {
              setMode(registering ? 'signin' : 'register');
              setProblem(null);
              setConfirm(null);
            }}
          >
            {registering ? 'Sign in instead' : 'Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinPanel;
