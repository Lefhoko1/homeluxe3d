import React, { useState } from 'react';

/**
 * Sign in.
 *
 * This used to compare the typed values to the literals 'admin' and 'admin'
 * and, on a match, set a cookie. That authorised nothing: every table in the
 * database has row-level security on and every write policy resolves through
 * `auth.uid()`, so the "logged in" admin's first save came back "new row
 * violates row-level security policy".
 *
 * Now it is a real Supabase sign-in. The session is persisted and refreshed
 * by the Supabase client, so nothing here has to remember anything.
 */
const LoginModal = ({ onLogin, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-modal" onClick={busy ? undefined : onClose}>
      <div className="login-content" onClick={(e) => e.stopPropagation()}>
        <h2>Sign in</h2>
        <form id="login-form" className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="login-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div id="login-error" className="login-error">{error}</div>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
