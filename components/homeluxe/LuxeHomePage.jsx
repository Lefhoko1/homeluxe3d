import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from './Header';
import ShopsBanner from './ShopsBanner';
import TourPanel from './TourPanel';
import CanvasContainer from './CanvasContainer';
import ProductPanel from './ProductPanel';
import TourControls from './TourControls';
import LoginModal from './LoginModal';
import { useCatalog } from '../../lib/catalog/useCatalog';
import { recordEvent } from '../../lib/catalog/repository';
import { useAdmin } from './admin';
import './homeluxe.css';

const LuxeHomePage = () => {
  const [currentRoom, setCurrentRoom] = useState('living');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [shopFilter, setShopFilter] = useState(null);

  const { shops, productsByRoom, rooms, source, loading, error, refresh } =
    useCatalog({ scene: '3bed', shopFilter });

  // Real identity, not `?admin=true`. The old parameter showed the admin
  // chrome to anyone who guessed it and granted nothing when they used it --
  // every write policy in the database resolves through auth.uid().
  const {
    isAdmin,
    isSignedIn,
    displayName,
    shops: manageableShops,
    signIn,
    signOut,
  } = useAdmin();

  // Land on a room that actually has something in it. Without this the page
  // can open on a room the scene has never heard of and show "coming soon"
  // over a picture of the living room.
  //
  // ONLY ON FIRST LOAD. Left running, it fights the guided tour: the tour
  // walks into the kitchen, which has nothing advertised in it, so this
  // bounced the selection to the alphabetically first room with products --
  // and the panel announced "Bathroom" while the visitor stood in the
  // kitchen. Where the visitor IS beats where there is something to sell.
  const landed = useRef(false);
  useEffect(() => {
    if (!rooms.length || landed.current) return;
    landed.current = true;
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

  // Picking a shop narrows the catalogue AND takes the visitor to that
  // shop's first product, so the click visibly does something in the room
  // rather than only changing a list.
  const handleShopSelect = (slug) => {
    setShopFilter(slug);
    setSelectedProduct(null);
    setCurrentIndex(0);
  };

  // The 3D scene owns the tour controller -- it needs the camera, the
  // character and the geometry -- and lends this button its start function.
  const tourApi = useRef(null);
  const handleTourApi = useCallback((api) => { tourApi.current = api; }, []);

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
    // The guided tour reports arriving in a room, not clicking a product, so
    // the lists follow the visitor without the detail panel showing a
    // half-filled advert for something nobody selected.
    if (advert.roomOnly) {
      if (advert.room && advert.room !== currentRoom) {
        setCurrentRoom(advert.room);
        setCurrentIndex(0);
      }
      setSelectedProduct(null);
      return;
    }
    if (advert.room && advert.room !== currentRoom) setCurrentRoom(advert.room);
    const list = productsByRoom[advert.room] ?? currentProducts;
    const index = list.findIndex((p) => p.id === advert.productId);
    if (index >= 0) setCurrentIndex(index);
    setSelectedProduct(advert);
  };

  // Sign-in is Supabase's, and the session is persisted by its client -- so
  // there is no cookie to set here and no admin state to keep in this
  // component. The old version wrote `isAdmin=true` into document.cookie,
  // which authorised precisely nothing.
  const handleLogin = async (email, password) => {
    await signIn(email, password);
    setShowLogin(false);
  };

  return (
    <div className="app-container">
      <Header
        isAdmin={isAdmin}
        isSignedIn={isSignedIn}
        displayName={displayName}
        onLogin={() => setShowLogin(true)}
        onLogout={signOut}
      />

      <ShopsBanner
        shops={shops}
        activeShop={shopFilter}
        onShopSelect={handleShopSelect}
      />

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
        shops={manageableShops}
        focusProduct={currentProducts[currentIndex] ?? null}
        onSelect={handleSceneSelect}
        // A save changes what the database says is in the house, so the room
        // lists have to re-read or they keep showing the old layout.
        onCatalogChanged={refresh}
        onTourApi={handleTourApi}
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
        onAutoPlay={() => tourApi.current?.startGuided()}
      />

      {showLogin && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setShowLogin(false)}
        />
      )}

      {/* THE CATALOGUE FAILED, AND THE PAGE SAYS SO.
          This used to fall back to the file the Blender build writes, so a
          database that had never been seeded produced a house that looked
          completely normal -- and a missing shop read as a bug in the 3D
          scene rather than as a database nobody had told. The banner is
          deliberately hard to miss and quotes the actual error, which names
          the fix. */}
      {error && (
        <div className="catalog-error" role="alert">
          <strong>The catalogue could not be loaded.</strong>
          <span>{error.message}</span>
          <button type="button" onClick={refresh}>Try again</button>
        </div>
      )}

      {/* Where the catalogue came from. Always "supabase" now -- there is no
          other source -- so this is a positive confirmation that the page is
          showing live data rather than a choice between two. */}
      {source && !error && (
        <div className="catalog-source">catalogue: {source}</div>
      )}
    </div>
  );
};

export default LuxeHomePage;
