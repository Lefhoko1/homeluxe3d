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
import { VisitorService } from '../../lib/visitor/VisitorService';
// The opening title over the tour is styled here. Without this import it
// rendered as unstyled black text below the canvas, in the page's flow.
import './visitor.css';
import { useAdmin } from './admin';
import './homeluxe.css';

const LuxeHomePage = () => {
  const [currentRoom, setCurrentRoom] = useState('living');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [shopFilter, setShopFilter] = useState(null);

  // What the tour is doing, reported by the scene, and what the visitor
  // picked while it was walking.
  //
  // DECLARED UP HERE WITH THE REST OF THE STATE, and that is not tidiness.
  // `confirmFocus` below names `askingFor` in its dependency array, which is
  // evaluated during render -- so with the state declared further down the
  // page threw "Cannot access before initialization" on the very first
  // render, and only the production prerender caught it.
  const [tourState, setTourState] = useState({
    touring: false, guided: false, paused: false,
  });
  const handleTourState = useCallback((next) => setTourState(next), []);

  /**
   * A product somebody picked while the tour was walking.
   *
   * Held rather than acted on, because the tour owns the camera and flying
   * off would abandon a walk they may be halfway through. The bar under the
   * house asks; this is the question it is asking about.
   */
  const [askingFor, setAskingFor] = useState(null);

  // The scene lends the page its tour controls. Declared before the handlers
  // that call them, for the same reason.
  const tourApi = useRef(null);

  // Real identity, not `?admin=true`. The old parameter showed the admin
  // chrome to anyone who guessed it and granted nothing when they used it --
  // every write policy in the database resolves through auth.uid().
  //
  // READ BEFORE THE CATALOGUE, because it decides which catalogue. An admin
  // sees the draft so their own edits appear as they make them; a visitor
  // sees the last published snapshot, which is a house somebody decided to
  // show them rather than whatever state a rearrangement is halfway through.
  const {
    session,
    isAdmin,
    isSignedIn,
    displayName,
    shops: manageableShops,
    signIn,
    signOut,
  } = useAdmin();

  const { shops, productsByRoom, rooms, source, loading, error, refresh } =
    useCatalog({ scene: '3bed', shopFilter, live: isAdmin });

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

  /**
   * Somebody picked something from the list.
   *
   * WITH THE TOUR WALKING THIS IS NOT A SIMPLE CLICK. The tour owns the
   * camera, so flying to the product would abandon a walk they may be
   * halfway through -- and doing nothing would look broken. So the choice
   * goes to them, in the bar under the house, and nothing moves until they
   * answer. The panel still updates either way: reading about a sofa while
   * the tour carries on is a perfectly reasonable thing to want.
   *
   * A tour that is already held needs no permission -- being held is what
   * they asked for last time.
   */
  const handleProductSelect = (index) => {
    const product = currentProducts[index] ?? null;
    setSelectedProduct(product);

    if (tourState.guided && !tourState.paused && product?.position) {
      setAskingFor({ index, name: product.name });
      return;
    }
    setAskingFor(null);
    setCurrentIndex(index);
  };

  /** Hold the walk where it is, then fly to what they picked. */
  const confirmFocus = useCallback(() => {
    if (!askingFor) return;
    tourApi.current?.holdTour?.();
    setCurrentIndex(askingFor.index);
    setAskingFor(null);
  }, [askingFor]);

  /** Carry on walking; the panel keeps whatever they clicked. */
  const dismissFocus = useCallback(() => setAskingFor(null), []);

  /** Back to the walk, from exactly where it stopped. */
  const resumeTour = useCallback(() => {
    tourApi.current?.resumeTour?.();
  }, []);

  // Picking a shop narrows the catalogue AND takes the visitor to that
  // shop's first product, so the click visibly does something in the room
  // rather than only changing a list.
  const handleShopSelect = (slug) => {
    setShopFilter(slug);
    setSelectedProduct(null);
    setCurrentIndex(0);
  };

  // The 3D scene owns the tour controller -- it needs the camera, the
  // character and the geometry -- and lends the page its controls. The ref
  // itself is declared with the state above, because the click handlers name
  // it before this point in the file.

  /**
   * The house introduces itself.
   *
   * A LANDING PAGE SHOULD NOT OPEN WITH AN EMPTY ROOM AND A BUTTON. Whoever
   * has just arrived has no idea what this is yet, and the fastest way to
   * explain a house you can walk through is to walk through it for them. So
   * the guided tour starts on its own, with the walking figure HIDDEN --
   * a third-person character standing in shot turns "here is a house" into
   * "here is a video game about a house".
   *
   * It waits a moment first. The tour needs the scene, the route and the
   * collision volume, and starting before they exist is a no-op that looks
   * like a broken autoplay.
   */
  const [cinematic, setCinematic] = useState(true);

  // The scene hands its controls over once, asynchronously, and the opening
  // has to wait for that. A piece of state rather than a ref, because the
  // effect below has to re-run when it arrives.
  const [sceneControls, setSceneControls] = useState(null);

  const handleTourApi = useCallback((api) => {
    tourApi.current = api;
    setSceneControls(api ?? null);
  }, []);

  /**
   * Start the opening film.
   *
   * IN AN EFFECT, NOT IN THE CALLBACK. The first version started the timer
   * inside `handleTourApi` and returned a cleanup from it -- but a callback
   * is not an effect, nothing calls what it returns, and the timer would have
   * fired into an unmounted page. Here the cleanup actually runs.
   *
   * The short wait is not decoration: the tour needs the scene, the route and
   * the collision volume, and starting before they exist is a no-op that
   * looks exactly like a broken autoplay.
   */
  useEffect(() => {
    if (!cinematic || !sceneControls?.startGuided) return undefined;
    const timer = setTimeout(() => {
      sceneControls.setWalkerVisible?.(false);
      sceneControls.startGuided();
    }, 900);
    return () => clearTimeout(timer);
  }, [cinematic, sceneControls]);

  /**
   * They want to walk it themselves. Give them the figure back.
   *
   * Reached from the Auto Tour button and from the scene's own controls.
   * There WAS a card over the 3D view offering it as well; it is gone. The
   * canvas is one column of a three-column layout and already the smallest
   * part of the screen it should be -- putting a 25rem panel on top of it
   * spent the one thing the page is for.
   */
  const takeControl = useCallback(() => {
    setCinematic(false);
    tourApi.current?.setWalkerVisible?.(true);
  }, []);

  const handleEnquire = (product) => {
    if (!product) return;
    // The variant is what makes this attributable: a product panel enquiry
    // names no placement -- nothing was clicked in the house -- but a variant
    // belongs to exactly one product and one shop, and migration 0014 works
    // the rest out from it.
    recordEvent('enquiry_open', {
      variantId: product.variantId ?? null,
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
  /**
   * How many notifications are waiting, for the badge on "My shops".
   *
   * Read once when somebody signs in rather than polled: a number that is a
   * few minutes stale costs nothing, and a poll on a page rendering a 3D
   * scene at sixty frames a second costs more than it is worth.
   */
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const id = session?.userId;
    if (!id) { setUnread(0); return undefined; }
    let cancelled = false;
    new VisitorService()
      .unreadCount()
      .then((n) => { if (!cancelled) setUnread(n); })
      .catch(() => {});          // a badge is not worth an error banner
    return () => { cancelled = true; };
  }, [session?.userId]);

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
        unreadCount={unread}
        onLogin={() => setShowLogin(true)}
        onLogout={signOut}
      />

      <ShopsBanner
        shops={shops}
        activeShop={shopFilter}
        onShopSelect={handleShopSelect}
        userId={session?.userId ?? null}
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
        onTourState={handleTourState}
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
        onAutoPlay={() => { takeControl(); tourApi.current?.startGuided(); }}
        touring={tourState.touring}
        guided={tourState.guided}
        paused={tourState.paused}
        askingFor={askingFor}
        onConfirmFocus={confirmFocus}
        onDismissFocus={dismissFocus}
        onResume={resumeTour}
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
