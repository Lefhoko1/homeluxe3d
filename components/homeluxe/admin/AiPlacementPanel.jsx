import React, { useEffect, useRef, useState } from 'react';

import { askForPlacement } from '../../../lib/admin/AiPlacementService';
import './admin.css';

/**
 * Place, move, turn or resize the selected product by describing it.
 *
 * A conversation, so follow-ups work: "put it on the TV stand", then "a bit
 * further back", then "turn it to face the sofa". Each reply that comes with a
 * position is applied to the object straight away -- unsaved -- so the admin
 * sees it in the room, and the toolbar's Save and Revert work exactly as they
 * do after dragging.
 */

const SUGGESTIONS = [
  'Place it sensibly in this room, out of the walkway',
  'Sit it on top of the furniture it is over',
  'Back it onto the nearest solid wall',
  'Turn it to face the television',
];

const AiPlacementPanel = ({ advert, getTransform, onApply, onClose }) => {
  const [turns, setTurns] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  const canAsk = Boolean(advert?.variantId);

  const ask = async (text) => {
    const request = (text ?? prompt).trim();
    if (!request || busy || !canAsk) return;

    setError(null);
    setBusy(true);
    setPrompt('');
    setTurns((current) => [...current, { role: 'user', text: request }]);

    try {
      const { reply, proposal } = await askForPlacement({
        variantId: advert.variantId,
        placementId: advert.placementId ?? null,
        // A product just dropped in has not been put anywhere meaningful yet.
        transform: advert.pending && turns.length === 0 ? null : getTransform(),
        prompt: request,
        history: turns.map(({ role, text: turnText }) => ({ role, text: turnText })),
      });

      if (proposal) onApply(proposal);
      setTurns((current) => [...current, { role: 'assistant', text: reply, proposal }]);
    } catch (failure) {
      setError(failure.message);
      // Keep what they asked, so they can try again without retyping it.
      setTurns((current) => current.slice(0, -1));
      setPrompt(request);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-ai-panel">
      <div className="admin-ai-head">
        <span className="admin-ai-title">✨ Place with AI</span>
        <span className="admin-ai-product">{advert?.name ?? 'No product selected'}</span>
        <button type="button" className="admin-ai-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {!canAsk && (
        <div className="admin-ai-note bad">
          This item comes from the static catalogue, so it has no database row to place.
        </div>
      )}

      <div className="admin-ai-log">
        {turns.length === 0 && canAsk && (
          <div className="admin-ai-empty">
            Describe where it should go. The AI reads the room and the furniture already in it,
            checks the position, and moves it here for you to review and Save.
            <div className="admin-ai-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  className="admin-ai-chip"
                  onClick={() => ask(suggestion)}
                  disabled={busy}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={index} className={`admin-ai-turn ${turn.role}`}>
            <div className="admin-ai-text">{turn.text}</div>
            {turn.proposal && (
              <div className="admin-ai-proposal">
                <div>
                  x {turn.proposal.x_mm} · y {turn.proposal.y_mm} · z {turn.proposal.z_mm} mm ·{' '}
                  {turn.proposal.rotation_deg}° · ×{turn.proposal.scale}
                </div>
                <div className="admin-ai-where">
                  {turn.proposal.check?.room?.label ?? 'Outside the rooms'} · faces{' '}
                  {turn.proposal.check?.facing} · on {turn.proposal.check?.sits_on}
                </div>
                {turn.proposal.check?.issues?.map((issue, i) => (
                  <div key={i} className="admin-ai-note warn">{issue.message}</div>
                ))}
                {turn.proposal.check?.notes?.map((note, i) => (
                  <div key={`n${i}`} className="admin-ai-note">{note}</div>
                ))}
                {turn.proposal.check?.ok && (
                  <div className="admin-ai-note good">
                    Checked: clear of walls, furniture, doors and the walkway. Press Save to keep it.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && <div className="admin-ai-turn assistant thinking">Looking at the room…</div>}
        <div ref={endRef} />
      </div>

      {error && <div className="admin-ai-note bad">{error}</div>}

      <form
        className="admin-ai-input"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <textarea
          rows={2}
          value={prompt}
          placeholder={turns.length ? 'Adjust it: "20cm further back", "face the sofa"…' : 'e.g. "Put it on the TV stand in the living room"'}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          disabled={busy || !canAsk}
        />
        <button type="submit" className="admin-btn primary" disabled={busy || !canAsk || !prompt.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
};

export default AiPlacementPanel;
