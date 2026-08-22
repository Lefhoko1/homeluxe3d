import React, { useEffect, useState } from 'react';

import { VisitorService } from '../../lib/visitor/VisitorService';

/**
 * Asking a shop about the product you are looking at.
 *
 * THE BUTTON USED TO BE A BUTTON. "Enquire at Tubod Enterprises" recorded an
 * analytics event and did nothing else -- no row, no shop told, nowhere for an
 * answer to go. `enquiries` had existed for fifteen migrations with nothing
 * ever inserted into one.
 *
 * SIGNED IN, OR NOT AT ALL. That is not bureaucracy: an enquiry from nobody
 * is unanswerable, because the reply has nowhere to land that the asker will
 * ever see. The database enforces it -- the insert policy requires
 * `user_id = auth.uid()` -- and this says so up front rather than letting
 * somebody write a paragraph and then refusing it.
 *
 * THE SHOP'S OWN CONTACTS ARE HERE TOO, and they are not decoration. Somebody
 * who wants an answer in the next ten minutes should phone; the form is for
 * the rest. Both come from the shop's row, so a shop that changes its number
 * changes it everywhere at once.
 */
const EnquiryDialog = ({ product, shopSlug, userId, onClose, onSent }) => {
  /**
   * The shop, read from `shops` rather than taken from the catalogue.
   *
   * The catalogue knows shops by SLUG and carries no uuid, no phone and no
   * email -- it is a scene, not a directory. Every row that references a shop
   * uses its PRIMARY KEY, and the contacts on this dialog have to be the
   * shop's current ones rather than whatever was true when the scene was last
   * published. One query settles both.
   */
  const [shop, setShop] = useState(null);
  const [loadFailed, setLoadFailed] = useState(null);

  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(false);

  const service = React.useMemo(() => new VisitorService(), []);

  useEffect(() => {
    let cancelled = false;
    service
      .shopBySlug(shopSlug)
      .then((row) => { if (!cancelled) setShop(row); })
      .catch((e) => { if (!cancelled) setLoadFailed(e.message); });
    return () => { cancelled = true; };
  }, [service, shopSlug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await service.enquire({
        shopId: shop.id,
        userId,
        // WHICH THING, exactly. The shop should not have to guess between
        // three sofas -- the panel knows precisely what is being looked at.
        productId: product.productId ?? null,
        variantId: product.variantId ?? null,
        message,
        phone,
      });
      setDone(true);
      onSent?.();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loadFailed) {
    return (
      <div className="ask-backdrop" onClick={onClose}>
        <div className="ask-dialog" onClick={(e) => e.stopPropagation()}>
          <p className="luxe-note bad">{loadFailed}</p>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="ask-backdrop" onClick={onClose}>
        <div className="ask-dialog" onClick={(e) => e.stopPropagation()}>
          <p className="luxe-sub">Looking up the shop…</p>
        </div>
      </div>
    );
  }

  const contacts = [
    shop.phone && { href: `tel:${shop.phone.replace(/\s+/g, '')}`, label: shop.phone, what: 'Call' },
    shop.email && { href: `mailto:${shop.email}?subject=${encodeURIComponent(product.name)}`, label: shop.email, what: 'Email' },
    shop.website && { href: shop.website, label: shop.website.replace(/^https?:\/\//, ''), what: 'Visit' },
  ].filter(Boolean);

  return (
    <div className="ask-backdrop" onClick={busy ? undefined : onClose}>
      <div className="ask-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ask-head">
          <div>
            <p className="ask-eyebrow">Ask {shop.name}</p>
            <h2 className="ask-title">{product.name}</h2>
          </div>
          <button type="button" className="ask-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        {done ? (
          <div className="ask-body">
            <p className="luxe-note good">
              Sent. {shop.name} can see it now, and their reply arrives in your
              notifications and by email.
            </p>
            <div className="ask-foot">
              <a className="luxe-btn ghost" href="/following#enquiries">See your questions</a>
              <button type="button" className="luxe-btn primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : !userId ? (
          // Said BEFORE the textarea, not after it. Letting somebody write a
          // paragraph and then telling them it cannot be sent is the worst
          // possible order to discover this in.
          <div className="ask-body">
            <p className="luxe-sub" style={{ marginBottom: 14 }}>
              You need an account to ask, so {shop.name} has somewhere to send
              the answer and you can see it when it comes.
            </p>
            {contacts.length > 0 && (
              <>
                <p className="ask-or">Or reach them directly</p>
                <ul className="ask-contacts">
                  {contacts.map((c) => (
                    <li key={c.href}>
                      <a href={c.href}>{c.what} · {c.label}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="ask-foot">
              <button type="button" className="luxe-btn quiet" onClick={onClose}>Not now</button>
              <a className="luxe-btn primary" href="/join">Create an account</a>
            </div>
          </div>
        ) : (
          <form className="ask-body" onSubmit={submit}>
            <label className="luxe-field">
              <span>What would you like to know?</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                required
                placeholder={`Is the ${product.name} available in another colour? Do you deliver?`}
              />
            </label>

            <label className="luxe-field">
              <span>Phone (optional)</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="If you would rather they called"
              />
            </label>

            {problem && <p className="luxe-note bad">{problem}</p>}

            {contacts.length > 0 && (
              <>
                <p className="ask-or">Or reach them directly</p>
                <ul className="ask-contacts">
                  {contacts.map((c) => (
                    <li key={c.href}>
                      <a href={c.href}>{c.what} · {c.label}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="ask-foot">
              <button type="button" className="luxe-btn quiet" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="luxe-btn primary" disabled={busy}>
                {busy ? 'Sending…' : `Send to ${shop.name}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EnquiryDialog;
