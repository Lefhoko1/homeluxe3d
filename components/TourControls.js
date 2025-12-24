import React from 'react';

function TourControls({ currentIndex, roomProducts, currentRoom, isAutoPlaying, onPrev, onNext, onAutoPlay }) {
  const products = roomProducts[currentRoom] || [];
  const isPrevDisabled = currentIndex <= 0;
  const isNextDisabled = currentIndex >= products.length - 1;

  return (
    <div className="tour-controls">
      <button 
        className="control-btn" 
        onClick={onPrev}
        disabled={isPrevDisabled}
      >
        ← Previous
      </button>
      
      <button 
        className="control-btn primary" 
        onClick={onAutoPlay}
      >
        {isAutoPlaying ? '⏸ Pause Tour' : '▶ Auto Tour'}
      </button>
      
      <button 
        className="control-btn" 
        onClick={onNext}
        disabled={isNextDisabled}
      >
        Next →
      </button>
    </div>
  );
}

export default TourControls;