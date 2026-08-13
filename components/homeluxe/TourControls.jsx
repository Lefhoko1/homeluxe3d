import React, { useState } from 'react';

const TourControls = ({ currentIndex, totalItems, onPrevious, onNext, onAutoPlay }) => {
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const handleAutoPlay = () => {
    setIsAutoPlaying(!isAutoPlaying);
    onAutoPlay();
  };

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
      <button
        className="control-btn primary"
        id="auto-play"
        onClick={handleAutoPlay}
      >
        {isAutoPlaying ? '⏸ Pause Tour' : '▶ Auto Tour'}
      </button>
      <button
        className="control-btn"
        id="next-btn"
        disabled={currentIndex >= totalItems - 1}
        onClick={onNext}
      >
        Next →
      </button>
    </div>
  );
};

export default TourControls;
