import React, { useState, useEffect } from 'react';
import Header from './Header';
import ShopsBanner from './ShopsBanner';
import TourPanel from './TourPanel';
import CanvasContainer from './CanvasContainer';
import ProductPanel from './ProductPanel';
import TourControls from './TourControls';
import LoginModal from './LoginModal';
import './homeluxe.css';

const LuxeHomePage = () => {
  const [currentRoom, setCurrentRoom] = useState('living-room');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [roomProducts, setRoomProducts] = useState({});

  useEffect(() => {
    // Check for admin access from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const adminParam = urlParams.get('admin') === 'true' || urlParams.get('isAdmin') === 'true';
    setIsAdmin(adminParam);

    // Initialize room products data
    const products = {
      "living-room": [
        {
          id: "sofa",
          name: "Modern Luxury Sofa",
          category: "Seating",
          price: "P 18,999",
          icon: "🛋️",
          shop: "luxeHome",
          description: "Premium modern sofa with luxury upholstery...",
          specs: {
            "Material": "Premium Velvet & Solid Oak",
            "Dimensions": "220cm × 95cm × 85cm",
            "Color": "Navy Blue",
            "Weight Capacity": "500kg",
            "Features": "USB Charging, Removable Covers",
            "Warranty": "5 Years"
          }
        },
        {
          id: "tvUnit",
          name: "Smart TV Entertainment Unit",
          category: "Media",
          price: "P 8,499",
          icon: "📺",
          shop: "techHome",
          description: "Modern TV unit with integrated sound system...",
          specs: {
            "Material": "Tempered Glass & Aluminum",
            "TV Support": "Up to 75\"",
            "Storage": "4 Drawers, 2 Cabinets",
            "Features": "LED Lighting, Cable Management",
            "Color": "Black Matte"
          }
        },
        {
          id: "coffeeTable",
          name: "Designer Coffee Table",
          category: "Tables",
          price: "P 4,999",
          icon: "☕",
          shop: "artisan",
          description: "Handcrafted solid walnut coffee table...",
          specs: {
            "Material": "Solid Walnut & Glass",
            "Dimensions": "120cm × 70cm × 45cm",
            "Finish": "Natural Oil & Lacquer",
            "Weight": "35kg",
            "Design": "Geometric Legs"
          }
        }
      ],
      "bedroom": [
        {
          id: "bed",
          name: "Cloud King Bed",
          category: "Beds",
          price: "P 12,999",
          icon: "🛏️",
          shop: "sleepHaven",
          description: "Luxurious king bed with upholstered headboard...",
          specs: { "Size": "King 180×200cm", "Material": "Fabric & Wood", "Storage": "4 Drawers" }
        }
      ],
      "dining-room": [
        {
          id: "diningTable",
          name: "Family Dining Set",
          category: "Dining",
          price: "P 8,999",
          icon: "🍽️",
          shop: "homeEssentials",
          description: "6-seater set with extendable table...",
          specs: { "Table": "180×90cm", "Extendable": "Up to 240cm", "Chairs": "6 Included" }
        }
      ],
      "outdoor": [
        {
          id: "patio",
          name: "Luxury Patio Set",
          category: "Outdoor",
          price: "P 9,999",
          icon: "🌴",
          shop: "gardenLife",
          description: "Weather-resistant patio set...",
          specs: { "Material": "Teak & Aluminum", "Seats": "8 People", "Weather": "All-Weather" }
        }
      ]
    };

    setRoomProducts(products);
  }, []);

  const handleRoomChange = (room) => {
    setCurrentRoom(room);
    setCurrentIndex(0);
  };

  const handleProductSelect = (index) => {
    setCurrentIndex(index);
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

      <ShopsBanner />

      <TourPanel
        currentRoom={currentRoom}
        currentIndex={currentIndex}
        roomProducts={roomProducts}
        onRoomChange={handleRoomChange}
        onProductSelect={handleProductSelect}
      />

      <CanvasContainer
        currentRoom={currentRoom}
        currentIndex={currentIndex}
        isAdmin={isAdmin}
      />

      <ProductPanel
        currentRoom={currentRoom}
        currentIndex={currentIndex}
        roomProducts={roomProducts}
      />

      <TourControls
        currentIndex={currentIndex}
        totalItems={roomProducts[currentRoom]?.length || 0}
        onPrevious={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
        onNext={() => setCurrentIndex(Math.min((roomProducts[currentRoom]?.length || 0) - 1, currentIndex + 1))}
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
