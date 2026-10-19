import React, { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * The small pieces every admin screen is built from.
 *
 * A DOZEN SCREENS OVER THE SAME TWENTY TABLES need to look like one
 * application, and they will not if each one invents its own table markup and
 * its own idea of what "loading" looks like. These are deliberately plain:
 * a panel, a table, a stat, a pill, and one hook that handles the three states
 * every screen has.
 */

/**
 * Load something, and say honestly which of the three states we are in.
 *
 * THE ERROR STATE IS THE IMPORTANT ONE. A screen that renders an empty table
 * when its query was refused looks exactly like a screen with nothing in it,
 * and "there are no shops" and "you are not allowed to see the shops" are
 * very different sentences. Nothing here falls back to placeholder data.
 *
 * @param {() => Promise<any>} load
 * @param {Array<any>} deps  re-runs when these change, like useEffect
 */
export function useAsync(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  // The caller passes a fresh closure every render; `deps` is what decides
  // when it actually re-runs, exactly as useEffect does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    run()
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((e) => { if (!cancelled) setState({ data: null, error: e.message, loading: false }); });
    return () => { cancelled = true; };
  }, [run, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}

/** A titled block, with an optional row of controls on the right. */
export const Panel = ({ title, subtitle, actions, children, wide = false }) => (
  <section className={`ad-panel${wide ? ' wide' : ''}`}>
    {(title || actions) && (
      <header className="ad-panel-head">
        <div>
          {title && <h2>{title}</h2>}
          {subtitle && <p className="ad-sub">{subtitle}</p>}
        </div>
        {actions && <div className="ad-panel-actions">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

/**
 * The three states, in one place.
 *
 * `empty` is a sentence, not a shrug: "no shops yet" should say what would
 * put one there.
 */
export const Async = ({ state, empty = 'Nothing here yet.', children }) => {
  if (state.loading) return <p className="ad-note">Loading…</p>;
  if (state.error) return <p className="ad-note bad">{state.error}</p>;
  const data = state.data;
  const isEmpty = Array.isArray(data) ? data.length === 0 : data == null;
  if (isEmpty) return <p className="ad-note">{empty}</p>;
  return children(data);
};

/**
 * A table.
 *
 * `columns` is [{ key, header, render?, align?, width? }]. `render` gets the
 * whole row, so a cell can be a button without the table knowing anything
 * about what the button does.
 */
export const DataTable = ({ columns, rows, rowKey, onRowClick, selectedKey }) => (
  <div className="ad-table-scroll">
    <table className="ad-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left', width: c.width }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              className={
                (onRowClick ? 'clickable' : '') +
                (selectedKey === key ? ' selected' : '')
              }
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/** One number, big, with what it counts underneath. */
export const Stat = ({ label, value, tone = '', hint, onClick }) => (
  <button
    type="button"
    className={`ad-stat ${tone}`.trim()}
    onClick={onClick}
    disabled={!onClick}
  >
    <span className="ad-stat-value">{value}</span>
    <span className="ad-stat-label">{label}</span>
    {hint && <span className="ad-stat-hint">{hint}</span>}
  </button>
);

/** A small coloured label for a status. */
export const Pill = ({ children, tone = '' }) => (
  <span className={`ad-pill ${tone}`.trim()}>{children}</span>
);

/** Buttons, so every screen's buttons behave the same. */
export const Button = ({ tone = '', ...props }) => (
  <button type="button" className={`ad-btn ${tone}`.trim()} {...props} />
);

/** Money, in the shop's own currency. Cents in, pula out. */
export const money = (cents, currency = 'BWP') =>
  cents == null
    ? '—'
    : `${currency} ${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })}`;

/** A date a person can read, without the timezone noise. */
export const when = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

/** Millimetres, as a person would say them. */
export const mm = (value) =>
  value == null ? '—' : `${Math.round(Number(value)).toLocaleString()}mm`;

/** How long ago, for an activity feed. */
export const ago = (value) => {
  if (!value) return '';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  const steps = [
    [60, 's'], [60, 'm'], [24, 'h'], [7, 'd'], [4.35, 'w'], [12, 'mo'],
  ];
  let n = seconds;
  let unit = 's';
  for (const [size, next] of steps) {
    if (n < size) break;
    n /= size;
    unit = next;
  }
  return `${Math.floor(n)}${unit} ago`;
};

/** Group rows by a key, keeping insertion order. */
export function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows) {
    const k = typeof key === 'function' ? key(row) : row[key];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(row);
  }
  return out;
}

/** A text box that filters a list, with the count of what survived. */
export function useFilter(rows, fields) {
  const [term, setTerm] = useState('');
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((row) =>
      fields.some((f) => String(row[f] ?? '').toLowerCase().includes(t))
    );
  }, [rows, term, fields]);
  return { term, setTerm, filtered };
}

export const Search = ({ value, onChange, placeholder = 'Search…' }) => (
  <input
    className="ad-search"
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);
