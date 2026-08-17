import React from 'react';

/**
 * On-screen walk controls.
 *
 * A four-way pad plus an exit button, shown only while the tour is running.
 *
 * Buttons fire on POINTER DOWN and release on pointer up/leave/cancel, so a
 * held button walks continuously rather than nudging once per click. The
 * `onPointerLeave` release matters more than it looks: without it, dragging
 * off a button leaves the character walking forever with nothing pressed.
 *
 * `touchAction: none` stops mobile browsers treating a held button as a
 * scroll gesture and cancelling the press.
 */

const button = {
  width: 52,
  height: 52,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(20,32,48,0.72)',
  color: '#fff',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  touchAction: 'none',
  backdropFilter: 'blur(6px)',
};

const wide = {
  ...button,
  width: 'auto',
  height: 36,
  padding: '0 14px',
  fontSize: 12,
};

const TourPad = ({
  onPress, onRelease, onExit,
  onGuided, onToggleView,
  guided = false, view = 'third', stopLabel = null, progress = null,
}) => {
  const hold = (dir) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      onPress(dir);
    },
    onPointerUp: () => onRelease(dir),
    onPointerLeave: () => onRelease(dir),
    onPointerCancel: () => onRelease(dir),
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        zIndex: 20,
      }}
    >
      <div
        style={{
          color: '#fff',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          background: 'rgba(20,32,48,0.72)',
          padding: '4px 10px',
          borderRadius: 999,
          marginBottom: 2,
        }}
      >
        {/* The count matters: without it there is no way to tell a tour that
            is working its way round from one that has quietly stopped. */}
        {guided
          ? [
              'Guided tour',
              progress ? `room ${progress.at} of ${progress.total}` : null,
              stopLabel,
              'any key to take over',
            ].filter(Boolean).join(' · ')
          : 'Walking · arrow keys or WASD'}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
        <button
          type="button"
          onClick={onGuided}
          style={{
            ...wide,
            background: guided ? '#1f6feb' : wide.background,
            borderColor: guided ? '#1f6feb' : wide.border,
          }}
          title={
            guided
              ? 'Stop the guided tour and walk yourself'
              : 'Walk the whole house automatically, stopping in every room'
          }
        >
          {guided ? '⏸ Stop tour' : '▶ Guided tour'}
        </button>

        {/* In a 2m bathroom no third-person camera can work at all, so being
            able to just look through the visitor's eyes is not a luxury. */}
        <button
          type="button"
          onClick={onToggleView}
          style={{
            ...wide,
            background: view === 'first' ? '#1f6feb' : wide.background,
            borderColor: view === 'first' ? '#1f6feb' : wide.border,
          }}
          title="Switch between over-the-shoulder and eye level"
        >
          {view === 'first' ? '👁 Eye level' : '🎥 Follow'}
        </button>
      </div>

      <button type="button" style={button} title="Walk forward" {...hold('forward')}>
        ▲
      </button>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={button} title="Turn left" {...hold('left')}>
          ◀
        </button>
        <button type="button" style={button} title="Walk back" {...hold('back')}>
          ▼
        </button>
        <button type="button" style={button} title="Turn right" {...hold('right')}>
          ▶
        </button>
      </div>

      <button
        type="button"
        onClick={onExit}
        style={{ ...wide, marginTop: 4 }}
        title="Leave the tour and go back to orbiting"
      >
        ✕ Exit tour
      </button>
    </div>
  );
};

export default TourPad;
