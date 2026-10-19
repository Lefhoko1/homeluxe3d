import React from 'react';

/**
 * The advert that appears when you click something in the scene.
 *
 * This is the payoff for the whole pipeline: a visitor sees a sofa, clicks it,
 * and learns what it is, who sells it, what it costs and whether there is a
 * special on. Everything shown here travelled from the Blender catalogue
 * through the manifest and into the mesh's userData, so nothing is looked up
 * or hardcoded at this point.
 *
 * Renders nothing when nothing is selected, so the canvas is unobstructed
 * until the visitor asks.
 */

const panel = {
  position: 'absolute',
  right: 18,
  top: 18,
  width: 320,
  maxHeight: 'calc(100% - 36px)',
  overflowY: 'auto',
  background: 'rgba(16,26,38,0.94)',
  color: '#f2f5f8',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
  backdropFilter: 'blur(10px)',
  zIndex: 30,
  fontSize: 13,
  lineHeight: 1.45,
};

const money = (amount, currency) => {
  if (amount == null) return null;
  const n = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currency === 'BWP' ? 'P' : currency ?? ''} ${n}`.trim();
};

const AdvertPanel = ({ advert, onClose, onEnquire }) => {
  if (!advert) return null;

  const {
    name, shopName, shop, category, room,
    price, effectivePrice, currency, sku, description,
    colour, madeOf, dimensions, promotion, roomTypes, isActive,
  } = advert;

  // Only call it a discount if the promo price is genuinely lower.
  const discounted =
    promotion?.isLive && effectivePrice != null && price != null &&
    Number(effectivePrice) < Number(price);

  return (
    <div style={panel}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#9fb4c8',
            }}>
              {category}{room ? ` · ${room}` : ''}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 0, color: '#9fb4c8',
              fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.10)', borderRadius: 999,
          padding: '4px 11px', fontSize: 12,
        }}>
          <span aria-hidden>🏬</span>
          <strong>{shopName || shop}</strong>
        </div>
      </div>

      {/* Price. The promo price leads and the list price is struck through,
          which is the only honest way to show a discount. */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#ffce7a' }}>
            {money(effectivePrice ?? price, currency) ?? 'Enquire'}
          </div>
          {discounted && (
            <div style={{ color: '#8fa4b6', textDecoration: 'line-through', fontSize: 15 }}>
              {money(price, currency)}
            </div>
          )}
        </div>

        {promotion?.isLive && (
          <div style={{
            marginTop: 10, padding: '9px 11px', borderRadius: 9,
            background: 'rgba(255,206,122,0.14)',
            border: '1px solid rgba(255,206,122,0.34)',
          }}>
            <div style={{ fontWeight: 600, color: '#ffce7a' }}>{promotion.label}</div>
            {promotion.endsOn && (
              <div style={{ color: '#c8d6e2', fontSize: 12, marginTop: 3 }}>
                Ends {promotion.endsOn}
              </div>
            )}
            {promotion.terms && (
              <div style={{ color: '#8fa4b6', fontSize: 11, marginTop: 5 }}>
                {promotion.terms}
              </div>
            )}
          </div>
        )}

        {/* A product only reaches the scene while active, so this is a
            belt-and-braces notice rather than an expected state. */}
        {isActive === false && (
          <div style={{
            marginTop: 10, padding: '8px 11px', borderRadius: 9, fontSize: 12,
            background: 'rgba(255,120,120,0.14)',
            border: '1px solid rgba(255,120,120,0.34)',
          }}>
            This promotion has ended.
          </div>
        )}

        {description && (
          <p style={{ color: '#c8d6e2', marginTop: 12 }}>{description}</p>
        )}
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <Spec label="SKU" value={sku} />
        <Spec label="Colour" value={colour} />
        <Spec
          label="Dimensions"
          value={dimensions
            ? `${dimensions.width} × ${dimensions.depth} × ${dimensions.height} mm`
            : null}
        />
        <Spec label="Made of" value={madeOf?.join(', ')} />
        <Spec label="Suits" value={roomTypes?.length ? roomTypes.join(', ') : 'any room'} />
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <button
          type="button"
          onClick={() => onEnquire?.(advert)}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.18)',
            background: '#1f6feb', color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          Enquire at {shopName || shop}
        </button>
      </div>
    </div>
  );
};

const Spec = ({ label, value }) =>
  value ? (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{ color: '#8fa4b6' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  ) : null;

export default AdvertPanel;
