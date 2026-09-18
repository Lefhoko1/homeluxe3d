import React, { useEffect, useRef, useState } from 'react';

/**
 * A panel that lives off the edge of a phone screen, behind a small tall
 * handle. Tap the handle, or drag it, and the panel slides out.
 *
 * WHY. On a desktop the shops, the room's list and the product card float
 * over the house as cards, and there is room for all of them. On a phone the
 * same cards covered half the house, hid the room tabs, and squeezed the list
 * until its items showed through its own heading. So on a narrow screen each
 * one folds into an edge, and the house gets the screen back until the
 * visitor asks for a list.
 *
 * DRAGGING FOLLOWS THE FINGER, AND A FLICK COUNTS. A drawer that only snaps
 * on a tap feels like a button; one that tracks the thumb and settles on
 * release feels like a thing on the screen. The drag starts on the handle --
 * the rest of the screen belongs to the house, whose own drag orbits the
 * camera -- and an open panel can be swiped back the way it came. A drag
 * that turns out to be mostly vertical is let go at once, so the lists inside
 * still scroll.
 */

const START_PX = 8;        // movement before a press counts as a drag
const FLICK = 0.45;        // px/ms; a release faster than this goes the way it was heading
const STALE_MS = 90;       // a finger held still this long before release is not a flick

const EdgeDrawer = ({
  side = 'left', label, open, onOpenChange, notice = null,
  // The OTHER drawer is out. This one's handle steps aside, so an open
  // drawer does not have a second tab standing beside its own.
  away = false,
  children,
}) => {
  const panelRef = useRef(null);
  const drag = useRef(null);
  // A drag ends with the browser firing a click on whatever was under the
  // finger. Swallowed for a moment afterwards -- not with a flag, because
  // touch browsers skip the click after a real drag, and a flag left set
  // would eat the visitor's NEXT tap instead.
  const swallowUntil = useRef(0);
  const [progress, setProgress] = useState(null);

  // +1 when opening means moving right (the left drawer), -1 for the right.
  const sign = side === 'left' ? 1 : -1;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const begin = (event, fromOpen) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      width: panelRef.current?.getBoundingClientRect().width || 320,
      fromOpen,
      moved: false,
      p: fromOpen ? 1 : 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
      v: 0,
    };
  };

  const move = (event) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;

    const dx = (event.clientX - d.x) * sign;
    if (!d.moved) {
      const dy = event.clientY - d.y;
      if (Math.abs(dx) < START_PX && Math.abs(dy) < START_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;         // a scroll, not a swipe
        return;
      }
      d.moved = true;
      d.target.setPointerCapture?.(event.pointerId);
    }

    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.v = ((event.clientX - d.lastX) * sign) / dt;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;

    d.p = Math.min(1, Math.max(0, (d.fromOpen ? 1 : 0) + dx / d.width));
    setProgress(d.p);
  };

  const end = (event) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;

    swallowUntil.current = Date.now() + 350;
    setProgress(null);
    const velocity = event.timeStamp - d.lastT > STALE_MS ? 0 : d.v;
    onOpenChange(Math.abs(velocity) > FLICK ? velocity > 0 : d.p > 0.5);
  };

  const cancel = () => {
    drag.current = null;
    setProgress(null);
  };

  const swallow = (event) => {
    if (Date.now() < swallowUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const dragging = progress !== null;
  const shown = dragging ? progress : open ? 1 : 0;

  return (
    <>
      <div
        className={`edge-backdrop${open ? ' open' : ''}`}
        style={dragging ? { opacity: shown, transition: 'none' } : undefined}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <aside
        ref={panelRef}
        className={`edge-drawer edge-${side}${open ? ' open' : ''}${dragging ? ' dragging' : ''}${away ? ' away' : ''}`}
        style={{ transform: `translateX(${(shown - 1) * 100 * sign}%)` }}
        aria-label={label}
        onPointerDown={open ? (event) => begin(event, true) : undefined}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        onClickCapture={swallow}
      >
        {/* Folded away, the contents are out of reach of Tab and of a screen
            reader, which would otherwise read a list nobody can see. React 18
            passes `inert` through only as a string. */}
        <div
          className="edge-drawer-body"
          aria-hidden={!open}
          {...(open ? {} : { inert: '' })}
        >
          {children}
        </div>

        {/* Inside the panel, so it rides on the panel's edge as it moves. */}
        <button
          type="button"
          className="edge-handle"
          aria-expanded={open}
          aria-label={open ? `Close ${label}` : `Open ${label}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            begin(event, open);
          }}
          onClick={() => onOpenChange(!open)}
        >
          {/* Keyed on what changed, so the pulse plays again each time. */}
          {notice != null && !open && (
            <span key={notice} className="edge-notice" aria-hidden />
          )}
          <span className="edge-grip" aria-hidden />
          <span className="edge-label">{label}</span>
        </button>
      </aside>
    </>
  );
};

export default EdgeDrawer;
