import React from 'react';

/**
 * The bar under the house.
 *
 * It also carries the ONE INTERRUPTION in the application: somebody picked a
 * product from the list while the guided tour was walking, and the tour owns
 * the camera. Flying off to the product would abandon a tour they may be
 * halfway through; ignoring the click would look broken. So it asks.
 *
 * THE ASK IS HERE AND NOT OVER THE 3D VIEW, deliberately. The canvas is one
 * column of three and already the smallest part of the screen it should be;
 * a question that covers the house to ask about the house is self-defeating.
 * This bar is below it, always present, and empty the rest of the time.
 */
const TourControls = ({
  currentIndex,
  totalItems,
  onPrevious,
  onNext,
  onAutoPlay,
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
          title={
            guided
              ? 'Stop the guided tour'
              : 'Walk the whole house automatically, stopping in every room'
          }
        >
          {/* Read from the tour itself rather than from a local boolean. The
              old version kept its own `isAutoPlaying`, which said "Pause"
              after the tour had been exited from the canvas controls. */}
          {guided ? '⏸ Stop the tour' : '▶ Auto Tour'}
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
