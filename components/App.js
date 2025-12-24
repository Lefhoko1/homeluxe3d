import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Components
import Header from './components/Header';
import ShopsBanner from './components/ShopsBanner';
import TourPanel from './components/TourPanel';
import CanvasContainer from './components/CanvasContainer';
import ProductPanel from './components/ProductPanel';
import TourControls from './components/TourControls';

// Data
import { shops, roomProducts } from './data/products';

function App() {
  const [currentRoom, setCurrentRoom] = useState('living-room');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showcaseRotation, setShowcaseRotation] = useState(0);
  const [isShowcasing, setIsShowcasing] = useState(false);
  
  const currentProduct = currentIndex >= 0 ? roomProducts[currentRoom][currentIndex] : null;
  const currentShop = currentProduct ? shops[currentProduct.shop] : null;

  const autoPlayIntervalRef = useRef(null);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (autoPlayIntervalRef.current) {
        clearInterval(autoPlayIntervalRef.current);
      }
    };
  }, []);

  // Handle showcase rotation animation
  useEffect(() => {
    if (isShowcasing && currentProduct) {
      let rotation = 0;
      const targetRotation = Math.PI * 2; // Full rotation
      const animationSpeed = 0.008;
      
      const rotate = () => {
        rotation += animationSpeed;
        if (rotation >= targetRotation) {
          rotation = targetRotation;
          setIsShowcasing(false);
        }
        setShowcaseRotation(rotation);
        
        if (rotation < targetRotation) {
          requestAnimationFrame(rotate);
        }
      };
      
      requestAnimationFrame(rotate);
    } else if (!isShowcasing) {
      setShowcaseRotation(0);
    }
  }, [isShowcasing, currentProduct]);

  const handleRoomChange = (room) => {
    setCurrentRoom(room);
    setCurrentIndex(-1);
    setIsShowcasing(false);
  };

  const handleSelectFurniture = (index) => {
    setCurrentIndex(index);
    setIsShowcasing(true);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      handleSelectFurniture(currentIndex - 1);
    }
  };

  const handleNext = () => {
    const products = roomProducts[currentRoom];
    if (currentIndex < products.length - 1) {
      handleSelectFurniture(currentIndex + 1);
    }
  };

  const handleAutoPlay = () => {
    if (isAutoPlaying) {
      clearInterval(autoPlayIntervalRef.current);
      setIsAutoPlaying(false);
    } else {
      if (currentIndex === -1) handleSelectFurniture(0);
      setIsAutoPlaying(true);
      autoPlayIntervalRef.current = setInterval(() => {
        const products = roomProducts[currentRoom];
        if (currentIndex < products.length - 1) {
          handleSelectFurniture(currentIndex + 1);
        } else {
          handleSelectFurniture(0);
        }
      }, 8000);
    }
  };

  return (
    <div className="App">
      <div className="app-container">
        <Header />
        <ShopsBanner shops={shops} />
        
        <TourPanel
          currentRoom={currentRoom}
          currentIndex={currentIndex}
          onRoomChange={handleRoomChange}
          onSelectFurniture={handleSelectFurniture}
          roomProducts={roomProducts}
          shops={shops}
        />
        
        <CanvasContainer
          currentProduct={currentProduct}
          showcaseRotation={showcaseRotation}
        />
        
        <ProductPanel
          product={currentProduct}
          shop={currentShop}
        />
        
        <TourControls
          currentIndex={currentIndex}
          roomProducts={roomProducts}
          currentRoom={currentRoom}
          isAutoPlaying={isAutoPlaying}
          onPrev={handlePrev}
          onNext={handleNext}
          onAutoPlay={handleAutoPlay}
        />
      </div>
      
      {isLoading && (
        <div id="loading">Loading 3D Showroom...</div>
      )}
    </div>
  );
}

export default App;