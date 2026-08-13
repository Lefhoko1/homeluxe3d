export const shops = {
  luxeHome: {
    name: "Luxe Home Gallery",
    icon: "🏛️",
    description: "Premium furniture & decor",
    phone: "+267 395 8821",
    email: "sales@luxehome.bw",
    address: "Main Mall, Gaborone"
  },
  artisan: {
    name: "Artisan Furniture",
    icon: "🎨",
    description: "Handcrafted pieces",
    phone: "+267 390 2156",
    email: "info@artisanfurn.bw",
    address: "African Mall, Gaborone"
  },
  techHome: {
    name: "Tech & Home",
    icon: "📱",
    description: "Modern solutions",
    phone: "+267 391 7788",
    email: "contact@techhome.bw",
    address: "Game City, Gaborone"
  },
  illuminate: {
    name: "Illuminate Decor",
    icon: "💡",
    description: "Lighting specialists",
    phone: "+267 393 2244",
    email: "hello@illuminate.bw",
    address: "Riverwalk Mall, Gaborone"
  },
  sleepHaven: {
    name: "Sleep Haven",
    icon: "😴",
    description: "Bedroom comfort",
    phone: "+267 393 6655",
    email: "hello@sleephaven.bw",
    address: "Block 8, Gaborone"
  },
  homeEssentials: {
    name: "Home Essentials",
    icon: "🏠",
    description: "Complete home solutions",
    phone: "+267 318 5544",
    email: "orders@homeessentials.bw",
    address: "Broadhurst, Gaborone"
  },
  gardenLife: {
    name: "Garden Life",
    icon: "🌿",
    description: "Outdoor experts",
    phone: "+267 394 7788",
    email: "info@gardenlife.bw",
    address: "Kgale View, Gaborone"
  }
};

export const roomProducts = {
  "living-room": [
    {
      id: "sofa",
      name: "Luxe Velvet Sectional",
      category: "Seating",
      price: "P 15,999",
      icon: "🛋️",
      shop: "luxeHome",
      description: "Premium velvet upholstery with solid oak frame. High-density foam cushions with removable covers.",
      specs: { 
        "Material": "Velvet & Oak", 
        "Dimensions": "300cm × 180cm × 85cm", 
        "Color": "Navy Blue", 
        "Warranty": "5 Years" 
      }
    },
    {
      id: "coffeeTable",
      name: "Oak Coffee Table",
      category: "Tables",
      price: "P 3,499",
      icon: "☕",
      shop: "artisan",
      description: "Handcrafted solid oak with natural oil finish and sturdy construction.",
      specs: { 
        "Material": "Solid Oak", 
        "Dimensions": "120cm × 70cm × 45cm", 
        "Finish": "Natural Oil" 
      }
    },
    {
      id: "tvStand",
      name: "Entertainment Center",
      category: "Media",
      price: "P 5,499",
      icon: "📺",
      shop: "techHome",
      description: "Modern TV stand with cable management. Supports TVs up to 65 inches.",
      specs: { 
        "Material": "MDF & Glass", 
        "TV Support": "Up to 65\"", 
        "Storage": "2 Drawers" 
      }
    },
    {
      id: "lamp",
      name: "Designer Floor Lamp",
      category: "Lighting",
      price: "P 1,899",
      icon: "💡",
      shop: "illuminate",
      description: "Contemporary lamp with adjustable brightness and fabric shade.",
      specs: { 
        "Height": "170cm", 
        "Type": "LED Compatible", 
        "Features": "Dimmable" 
      }
    },
    {
      id: "rug",
      name: "Premium Wool Rug",
      category: "Decor",
      price: "P 2,799",
      icon: "🎨",
      shop: "luxeHome",
      description: "Hand-woven wool rug with geometric pattern.",
      specs: { 
        "Material": "100% Wool", 
        "Size": "200cm × 150cm", 
        "Pattern": "Geometric" 
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
      description: "Luxurious king bed with upholstered headboard and storage.",
      specs: { 
        "Size": "King 180×200cm", 
        "Material": "Fabric & Wood", 
        "Storage": "4 Drawers" 
      }
    },
    {
      id: "wardrobe",
      name: "Sliding Wardrobe",
      category: "Storage",
      price: "P 8,499",
      icon: "👔",
      shop: "sleepHaven",
      description: "Spacious wardrobe with sliding doors and LED lighting.",
      specs: { 
        "Dimensions": "250×220×60cm", 
        "Doors": "3 Sliding", 
        "Interior": "Shelves & Rails" 
      }
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
      description: "6-seater set with extendable table and upholstered chairs.",
      specs: { 
        "Table": "180×90cm", 
        "Extendable": "Up to 240cm", 
        "Chairs": "6 Included" 
      }
    },
    {
      id: "buffet",
      name: "Modern Buffet",
      category: "Storage",
      price: "P 4,799",
      icon: "🍷",
      shop: "homeEssentials",
      description: "Elegant buffet with glass doors and wine storage.",
      specs: { 
        "Material": "Wood & Glass", 
        "Dimensions": "160×45×90cm", 
        "Storage": "Shelves & Rack" 
      }
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
      description: "Weather-resistant patio set with 8 chairs and umbrella.",
      specs: { 
        "Material": "Teak & Aluminum", 
        "Seats": "8 People", 
        "Weather": "All-Weather" 
      }
    },
    {
      id: "lounge",
      name: "Outdoor Lounge",
      category: "Seating",
      price: "P 12,499",
      icon: "🏖️",
      shop: "gardenLife",
      description: "Comfortable outdoor sofa with weather-resistant cushions.",
      specs: { 
        "Material": "Wicker & Sunbrella", 
        "Pieces": "Sofa, 2 Chairs, Table", 
        "Cushions": "Included" 
      }
    }
  ]
};