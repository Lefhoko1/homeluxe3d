import React from 'react';

/**
 * On-screen walk controls.
 *
 * TWO MODES, AND THEY SHOW DIFFERENT THINGS.
 *
 * Being driven and being given the controls are not the same, and the guided
 * tour does not need a joypad: four large arrows steering nothing, laid over
 * the room they exist to show you. While the tour runs this is one line of
 * text and three buttons -- stop, camera, exit. Take over and the pad appears.
 *
 * Everything else that used to sit on the canvas went with it. The room
 * title, the "360 View Active" badge and the five camera buttons all belong
 * to orbiting, and four of those five had no click handler at all.
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
  paused = false, onResume,
  showing = null,
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
        {/* "LAUNDRY - 5 OF 14". The count matters: without it there is no way
            to tell a tour working its way round from one that has quietly
            stopped. Everything else that was on this line -- the words
            "guided tour", and "any key to take over" -- went to the buttons'
            tooltips, where it is available and not in the way. */}
        {guided
          ? `${paused ? 'Paused' : stopLabel ?? 'Guided tour'}${
              progress ? ` · ${progress.at} of ${progress.total}` : ''
            }`
          : 'Walking · arrow keys or WASD'}
      </div>

      {/* WHAT IS BEING LOOKED AT, on its own line under the room.
          The room name alone cannot answer the question a visitor actually
          has while the character stands still turning towards something --
          "why has it stopped, and what am I looking at?" -- and the advert
          panel is on the other side of the screen. The count is what makes
          the pause read as deliberate rather than as a stall. */}
      {guided && showing && (
        <div
          style={{
            color: '#cfe3ff',
            fontSize: 11,
            background: 'rgba(20,32,48,0.72)',
            padding: '4px 10px',
            borderRadius: 999,
            marginBottom: 2,
            maxWidth: 260,
            textAlign: 'center',
          }}
        >
          {`Looking at ${showing.caption} · ${showing.at}/${showing.of}`}
        </div>
      )}

      {/* HELD, AND SAYING SO. The tour is standing still somewhere in the
          house while the camera is off looking at a product the visitor
          picked from the list. This is the way back, and it is the first
          thing in the pad because it is the only thing they want from it. */}
      {guided && paused && (
        <button
          type="button"
          onClick={onResume}
          style={{
            ...wide,
            background: '#C08A2E',
            borderColor: '#C08A2E',
            color: '#1B1405',
            fontWeight: 700,
            marginBottom: 4,
          }}
          title="Carry on from where the tour stopped"
        >
          ▶ Resume the tour
        </button>
      )}

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
              ? 'Stop the tour and walk yourself — or just press any arrow key'
              : 'Walk the whole house automatically, stopping in every room'
          }
        >
          {guided ? '⏸ Stop' : '▶ Guided tour'}
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
          {view === 'first' ? 'Eye level' : 'Follow'}
        </button>
      </div>

      {/* THE PAD DISAPPEARS DURING THE GUIDED TOUR.
          Four large arrows steering nothing, over the room they exist to show
          you, when pressing any key or arrow takes over anyway. Being driven
          and being given the controls are different modes, and only one of
          them needs a joypad. */}
      {!guided && (
        <>
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
        </>
      )}

      <button
        type="button"
        onClick={onExit}
        style={{ ...wide, marginTop: 4 }}
        title="Leave the tour and go back to orbiting"
      >
        ✕ Exit
      </button>
    </div>
  );
};

export default TourPad;
