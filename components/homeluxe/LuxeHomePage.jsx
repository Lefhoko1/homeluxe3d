import React, { useState, useEffect } from 'react';
import Header from './Header';
import ShopsBanner from './ShopsBanner';
import TourPanel from './TourPanel';
import CanvasContainer from './CanvasContainer';
import ProductPanel from './ProductPanel';
import TourControls from './TourControls';
import LoginModal from './LoginModal';
import { useCatalog } from '../../lib/catalog/useCatalog';
import { recordEvent } from '../../lib/catalog/repository';
import './homeluxe.css';

const LuxeHomePage = () => {
  const [currentRoom, setCurrentRoom] = useState('living');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { shops, productsByRoom, rooms, source, loading } = useCatalog({ scene: '3bed' });

  useEffect(() => {
    // Admin is still a URL parameter, not auth. See supabase/README.md.
    const params = new URLSearchParams(window.location.search);
    setIsAdmin(params.get('admin') === 'true' || params.get('isAdmin') === 'true');
  }, []);

  // Land on a room that actually has something in it. Without this the page
  // can open on a room the scene has never heard of and show "coming soon"
  // over a picture of the living room.
  useEffect(() => {
    if (!rooms.length) return;
    if (!rooms.some((r) => r.code === currentRoom)) {
      setCurrentRoom(rooms[0].code);
      setCurrentIndex(0);
    }
  }, [rooms, currentRoom]);

  const currentProducts = productsByRoom[currentRoom] ?? [];

  // Selecting a room, a list item or a thing in the 3D scene all end up here,
  // so the three views can never disagree about what is selected.
  const handleRoomChange = (room) => {
    setCurrentRoom(room);
    setCurrentIndex(0);
    setSelectedProduct(null);
  };

  const handleProductSelect = (index) => {
    setCurrentIndex(index);
    setSelectedProduct(currentProducts[index] ?? null);
  };

  const handleEnquire = (product) => {
    if (!product) return;
    recordEvent('enquiry_open', {
      metadata: { product: product.id, shop: product.shopSlug ?? product.shop },
    });
  };

  // Fired when something is clicked in the 3D scene.
  const handleSceneSelect = (advert) => {
    if (!advert) {
      setSelectedProduct(null);
      return;
    }
    if (advert.room && advert.room !== currentRoom) setCurrentRoom(advert.room);
    const list = productsByRoom[advert.room] ?? currentProducts;
    const index = list.findIndex((p) => p.id === advert.productId);
    if (index >= 0) setCurrentIndex(index);
    setSelectedProduct(advert);
  };

  const handleLogin = (username, password) => {
    // Simple login logic - in real app, this would be API call
    if (username === 'admin' && password === 'admin') {
      setIsAdmin(true);
      setShowLogin(false);
      // Set cookie for persistence
      document.cookie = 'isAdmin=true;path=/';
    } else {
      alert('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    document.cookie = 'isAdmin=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  };

  return (
    <div className="app-container">
      <Header isAdmin={isAdmin} onLogout={handleLogout} />

      <ShopsBanner shops={shops} />

      <TourPanel
        currentRoom={currentRoom}
        currentIndex={currentIndex}
        products={currentProducts}
        rooms={rooms}
        shops={shops}
        loading={loading}
        onRoomChange={handleRoomChange}
        onProductSelect={handleProductSelect}
      />

      <CanvasContainer
        currentRoom={currentRoom}
        currentIndex={currentIndex}
        isAdmin={isAdmin}
        focusProduct={currentProducts[currentIndex] ?? null}
        onSelect={handleSceneSelect}
      />

      <ProductPanel
        product={selectedProduct ?? currentProducts[currentIndex] ?? null}
        shops={shops}
        loading={loading}
        onEnquire={handleEnquire}
      />

      <TourControls
        currentIndex={currentIndex}
        totalItems={currentProducts.length}
        onPrevious={() => handleProductSelect(Math.max(0, currentIndex - 1))}
        onNext={() => handleProductSelect(Math.min(currentProducts.length - 1, currentIndex + 1))}
        onAutoPlay={() => {}}
      />

      {showLogin && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
};

export default LuxeHomePage;
