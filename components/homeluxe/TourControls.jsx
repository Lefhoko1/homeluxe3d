import React from 'react';

/**
 * The bar under the house.
 *
 * It also carries the ONE INTERRUPTION in the application: somebody picked a
 * product from the list while the guided tour was walking, and the tour owns
 * the camera. Flying off to the product would abandon a tour they may be
 * halfway through; ignoring the click would look broken. So it asks.
 *
 * THE ASK IS ON THE BAR, not in a dialog over the room. A modal that covers
 * the house to ask a question about the house is self-defeating -- and the
 * bar is where the visitor's eye already is, because it is where they just
 * pressed Auto Tour. It floats at the bottom of the picture now rather than
 * sitting in a band beneath it, but it is the same bar and the same rule.
 */
const TourControls = ({
  currentIndex,
  totalItems,
  onPrevious,
  onNext,
  onAutoPlay,
  ready = true,
  touring = false,
  guided = false,
  paused = false,
  askingFor = null,
  onConfirmFocus,
  onDismissFocus,
  onResume,
}) => {
  // The question replaces the row rather than crowding in beside it. It is
  // one decision and it wants the whole bar.
  if (askingFor) {
    return (
      <div id="tour-controls" className="asking">
        <p className="tour-ask-text">
          The tour is walking. Pause it and go to{' '}
          <strong>{askingFor.name}</strong>?
          <em>You can carry on from the same spot afterwards.</em>
        </p>
        <div className="tour-ask-actions">
          <button type="button" className="control-btn" onClick={onDismissFocus}>
            Keep touring
          </button>
          <button
            type="button"
            className="control-btn primary"
            onClick={onConfirmFocus}
          >
            Pause and show me
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="tour-controls">
      <button
        className="control-btn"
        id="prev-btn"
        disabled={currentIndex === 0}
        onClick={onPrevious}
      >
        ← Previous
      </button>

      {/* Held mid-way. The bar says so and offers the way back, so the
          visitor does not have to find the small control on the canvas. */}
      {paused ? (
        <button
          className="control-btn accent"
          id="auto-play"
          onClick={onResume}
          title="Carry on from where the tour stopped"
        >
          ▶ Resume the tour
        </button>
      ) : (
        <button
          className="control-btn primary"
          id="auto-play"
          onClick={onAutoPlay}
          /* A BUTTON THAT CANNOT WORK YET SAYS SO.
             The scene loads the route last, and until it arrives
             `toggleGuided` returns early -- so this pressed, did nothing,
             gave no reason, and left the visitor in a state where the
             pause-and-show-me question could never appear. Silence was the
             bug; the tour starting a second later is not one. */
          disabled={!ready && !guided}
          title={
            !ready && !guided
              ? 'The house is still loading'
              : guided
                ? 'Stop the guided tour'
                : 'Walk the whole house automatically, stopping in every room'
          }
        >
          {/* Read from the tour itself rather than from a local boolean. The
              old version kept its own `isAutoPlaying`, which said "Pause"
              after the tour had been exited from the canvas controls. */}
          {guided ? '⏸ Stop the tour' : ready ? '▶ Auto Tour' : '… Getting ready'}
        </button>
      )}

      <button
        className="control-btn"
        id="next-btn"
        disabled={currentIndex >= totalItems - 1}
        onClick={onNext}
      >
        Next →
      </button>

      {touring && !guided && (
        <span className="tour-hint">Arrow keys or WASD to walk</span>
      )}
    </div>
  );
};

export default TourControls;
