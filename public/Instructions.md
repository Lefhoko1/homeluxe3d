Yes. What you're describing is bigger than a Blender scene — it's essentially a **"virtual shopping house" platform**.

The important architectural decision is:

> **Build the house once as an extensible advertising environment. Everything inside it that could conceivably be sold becomes a replaceable product slot.**

That includes obvious things like TVs and sofas, but also **floor tiles, wall finishes, doors, windows, light fixtures, curtains, books, plants, cookware, bedding, bathroom fittings, garden products, paving, outdoor furniture, etc.**

I would architect it so Claude Code can help you build the system rather than simply generating a huge Blender file.

---

# 1. The overall architecture

Think of your Blender project as five layers:

```text
┌────────────────────────────────────────────────────────────┐
│                    VIRTUAL SHOPPING HOUSE                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  01. ARCHITECTURE                                          │
│      Walls / Floors / Ceilings / Roof / Doors / Windows    │
│                                                            │
│  02. FIXED ENVIRONMENT                                     │
│      Lighting / cameras / landscaping / structural items  │
│                                                            │
│  03. PRODUCT SLOT SYSTEM                                   │
│      Kitchen / Living / Bedroom / Bathroom / Yard / etc.  │
│                                                            │
│  04. PRODUCT LIBRARY                                       │
│      Shop → Product → Asset → Metadata                     │
│                                                            │
│  05. CAMPAIGN / TOUR SYSTEM                                │
│      Camera paths → products → adverts → renders          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

And the most important relationship is:

```text
PRODUCT
   ↓
PRODUCT ASSET
   ↓
SLOT
   ↓
HOUSE
   ↓
CAMERA TOUR
   ↓
ADVERT
```

---

# 2. Don't think "placeholders"

I'd actually call them **slots**.

A slot isn't merely an empty object.

It should contain metadata describing **what kind of product can occupy it**.

For example:

```text
SLOT_KITCHEN_COUNTER_001

Category:
    Kitchen Appliance

Subcategory:
    Coffee Machine

Position:
    XYZ

Rotation:
    XYZ

Allowed Products:
    Coffee Machine
    Espresso Machine
    Coffee Maker

Scale Mode:
    Real World

Visibility:
    Product / Placeholder

Camera Priority:
    High

Advertisable:
    TRUE
```

That gives Claude Code something it can work with.

---

# 3. Your house should contain MANY slots

And I mean **many**.

Don't build 30 slots.

Build several hundred.

You don't have to fill every slot immediately.

Think of the house as an **inventory map**.

---

# 4. Kitchen — make this extremely dense

Your kitchen is probably one of your most valuable advertising environments.

### Major appliances

Create slots for:

```text
KITCHEN_APPLIANCES

K01 Refrigerator
K02 Freezer
K03 Oven
K04 Built-in Oven
K05 Microwave
K06 Dishwasher
K07 Washing Machine
K08 Dryer
K09 Stove
K10 Gas Hob
K11 Induction Hob
K12 Extractor Hood
K13 Wine Cooler
K14 Ice Maker
K15 Coffee Machine
K16 Espresso Machine
K17 Air Fryer
K18 Blender
K19 Food Processor
K20 Stand Mixer
K21 Toaster
K22 Kettle
K23 Rice Cooker
K24 Pressure Cooker
K25 Slow Cooker
K26 Juicer
K27 Sandwich Maker
K28 Waffle Maker
```

### Countertop products

```text
KITCHEN_COUNTER

KC01 Coffee machine
KC02 Kettle
KC03 Toaster
KC04 Blender
KC05 Knife block
KC06 Spice rack
KC07 Cutting board
KC08 Fruit bowl
KC09 Bread box
KC10 Paper towel holder
KC11 Soap dispenser
KC12 Dish rack
KC13 Water filter
KC14 Kitchen scale
KC15 Canister set
KC16 Storage container
KC17 Mug set
KC18 Plate stack
KC19 Decorative bowl
KC20 Kitchen timer
```

### Sink area

```text
KITCHEN_SINK

KS01 Sink
KS02 Kitchen faucet
KS03 Soap dispenser
KS04 Sponge holder
KS05 Dish brush
KS06 Water filter
KS07 Garbage disposal
KS08 Drying rack
KS09 Cleaning product
KS10 Hand towel
```

### Cabinets / handles / finishes

And this is where your system becomes interesting.

Don't only make a slot for the cabinet.

Make **material/product slots**.

```text
KITCHEN_SURFACES

KSU01 Floor tile
KSU02 Backsplash tile
KSU03 Countertop
KSU04 Cabinet finish
KSU05 Cabinet handles
KSU06 Sink
KSU07 Faucet
KSU08 Wall paint
KSU09 Ceiling light
KSU10 Under-cabinet lighting
```

Now a tile company can advertise its tile **without you remodeling the kitchen**.

---

# 5. Living room

Make this another major advertising zone.

### Furniture

```text
LIVING_FURNITURE

L01 Sofa
L02 Loveseat
L03 Armchair
L04 Recliner
L05 Coffee table
L06 Side table
L07 Console table
L08 TV stand
L09 Bookshelf
L10 Display cabinet
L11 Ottoman
L12 Bench
L13 Floor cushion
```

### Electronics

```text
LIVING_TECH

LT01 Television
LT02 Soundbar
LT03 Speakers
LT04 Subwoofer
LT05 Game console
LT06 Streaming device
LT07 Router
LT08 Smart home hub
LT09 Projector
LT10 Projector screen
```

### Soft furnishings

```text
LIVING_SOFT

LS01 Curtains
LS02 Blinds
LS03 Rug
LS04 Throw blanket
LS05 Cushion
LS06 Decorative pillow
LS07 Upholstery
LS08 Wall art
LS09 Mirror
```

### Decorations

```text
LIVING_DECOR

LD01 Plant pot
LD02 Indoor plant
LD03 Vase
LD04 Sculpture
LD05 Candle
LD06 Decorative bowl
LD07 Clock
LD08 Picture frame
LD09 Books
LD10 Magazine
LD11 Ornament
LD12 Artificial flowers
```

---

# 6. And here's something important: BOOKS ARE PRODUCTS

This is exactly the mindset I would use.

A bookshelf could have:

```text
BOOKSHELF

BOOK_SLOT_001
BOOK_SLOT_002
BOOK_SLOT_003
...
BOOK_SLOT_030
```

Then publishers, bookstores, authors, educational companies, etc. could potentially place products there.

Same thing with:

```text
Magazine slots
Board game slots
DVD slots
Decor slots
Small electronics
```

The house becomes a giant product ecosystem.

---

# 7. Four bedrooms

Don't make the bedrooms identical.

Give each one a different commercial identity.

For example:

### Bedroom 1 — Master

```text
BEDROOM_01_MASTER

Bed
Mattress
Headboard
Bed frame
Bedside tables
Bedside lamps
Bedding
Duvet
Pillows
Blankets
Curtains
Blinds
Rug
Wardrobe
Dresser
Mirror
TV
Air conditioner
Fan
Decor
Books
Plants
Artwork
Lighting
Flooring
Wall finish
Ceiling
Door
Handles
```

Then create individual slots.

---

### Bedroom 2 — Child / Teen

```text
BEDROOM_02

Bed
Mattress
Desk
Desk chair
Bookshelf
Books
Computer
Monitor
Keyboard
Mouse
Headphones
Lamp
Rug
Curtains
Storage boxes
Toys
Posters
Wall art
Bedding
Pillows
Plants
```

This gives you a completely different advertiser ecosystem.

---

### Bedroom 3 — Guest

```text
BEDROOM_03

Bed
Mattress
Bedding
Nightstand
Lamp
Wardrobe
Mirror
Curtains
Rug
Chair
Small table
Artwork
Books
Plant
Decor
```

---

### Bedroom 4 — Office / Flex room

```text
BEDROOM_04

Desk
Office chair
Monitor
Laptop
Keyboard
Mouse
Printer
Desk lamp
Books
Bookshelf
Storage
Rug
Curtains
Plant
Artwork
Whiteboard
Shelving
```

---

# 8. Bathrooms are surprisingly valuable

Create slots for:

```text
BATHROOM

BAT01 Bathtub
BAT02 Shower
BAT03 Shower head
BAT04 Hand shower
BAT05 Shower enclosure
BAT06 Toilet
BAT07 Bidet
BAT08 Vanity
BAT09 Basin
BAT10 Faucet
BAT11 Mirror
BAT12 Cabinet
BAT13 Towel rail
BAT14 Toilet paper holder
BAT15 Soap dispenser
BAT16 Toothbrush holder
BAT17 Bath mat
BAT18 Towels
BAT19 Shower curtain
BAT20 Bathroom tiles
BAT21 Wall tiles
BAT22 Floor tiles
BAT23 Lighting
BAT24 Exhaust fan
BAT25 Hair dryer
BAT26 Cosmetic products
BAT27 Perfume
BAT28 Decorative plant
```

Now you've got plumbing companies, tile companies, furniture stores, cosmetic brands, lighting companies, etc.

---

# 9. Hallways are advertising real estate too

Don't overlook them.

```text
HALLWAY

H01 Floor
H02 Wall paint
H03 Wallpaper
H04 Runner rug
H05 Ceiling light
H06 Wall light
H07 Mirror
H08 Console
H09 Vase
H10 Artwork
H11 Plant
H12 Door
H13 Door handle
H14 Light switch
H15 Electrical outlet
```

---

# 10. Doors and windows should be product slots

This is especially important for local businesses.

Your house could have:

```text
DOORS

D01 Front door
D02 Back door
D03 Garage door
D04 Bedroom door 1
D05 Bedroom door 2
D06 Bedroom door 3
D07 Bedroom door 4
D08 Bathroom door
D09 Office door
D10 Door handles
D11 Locks
D12 Hinges
```

And:

```text
WINDOWS

W01 Living room window
W02 Kitchen window
W03 Master window
W04 Bedroom 2 window
W05 Bedroom 3 window
W06 Bedroom 4 window
W07 Bathroom window
W08 Sliding door
W09 Window frames
W10 Blinds
W11 Curtains
```

A window company can therefore replace an entire window assembly.

---

# 11. Flooring needs a special system

This is one area where I **wouldn't use ordinary object swapping**.

Instead, create a **material slot system**.

For example:

```text
FLOOR_PRODUCT_SLOTS

FLOOR_LIVING
FLOOR_KITCHEN
FLOOR_HALLWAY
FLOOR_MASTER
FLOOR_BEDROOM_02
FLOOR_BEDROOM_03
FLOOR_BEDROOM_04
FLOOR_BATHROOM
FLOOR_GARAGE
FLOOR_PATIO
FLOOR_ENTRANCE
```

Then a tile supplier can provide:

```text
Product:
    Tile XYZ

Material:
    tile_xyz

Real dimensions:
    600 x 600 mm

Texture:
    Base Color
    Roughness
    Normal
    Height
```

Your system applies it to the appropriate surface.

That means you can advertise:

**Company A's tiles**

and then instantly switch to

**Company B's tiles**

without touching the geometry.

---

# 12. Walls need the same concept

```text
WALL_PRODUCTS

WALL_LIVING
WALL_KITCHEN
WALL_MASTER
WALL_BEDROOM_02
WALL_BEDROOM_03
WALL_BEDROOM_04
WALL_HALLWAY
WALL_BATHROOM
WALL_EXTERIOR
```

Potential products:

* Paint
* Wallpaper
* Decorative panels
* Stone
* Brick
* Wood panels
* Acoustic panels
* Wall tiles

---

# 13. Lighting deserves its own product system

Almost every room can contain multiple lighting products.

```text
LIGHTING

CEILING_LIGHT
PENDANT_LIGHT
CHANDELIER
WALL_LIGHT
SPOTLIGHT
TABLE_LAMP
FLOOR_LAMP
UNDER_CABINET_LIGHT
LED_STRIP
OUTDOOR_LIGHT
SECURITY_LIGHT
GARDEN_LIGHT
```

And each actual light should have:

```text
LIGHT_SLOT_001
LIGHT_SLOT_002
LIGHT_SLOT_003
...
```

So a lighting company could potentially take over the entire house's lighting package.

---

# 14. Now go outside

Your yard is another giant advertising environment.

### Garden

```text
GARDEN

G01 Lawn
G02 Grass seed
G03 Garden soil
G04 Fertilizer
G05 Plants
G06 Flowers
G07 Trees
G08 Pots
G09 Planters
G10 Garden edging
G11 Garden stones
G12 Mulch
G13 Compost bin
```

### Garden equipment

```text
GE01 Lawn mower
GE02 Trimmer
GE03 Leaf blower
GE04 Hedge trimmer
GE05 Pressure washer
GE06 Hose
GE07 Hose reel
GE08 Sprinkler
GE09 Wheelbarrow
GE10 Garden tools
```

### Outdoor furniture

```text
OUTDOOR

O01 Outdoor sofa
O02 Dining table
O03 Dining chairs
O04 Lounger
O05 Umbrella
O06 Gazebo
O07 Fire pit
O08 BBQ
O09 Outdoor kitchen
O10 Cooler
O11 Outdoor lighting
O12 Outdoor rug
O13 Cushions
```

---

# 15. Driveway and exterior

This could be extremely valuable to building suppliers.

```text
EXTERIOR

E01 Roof
E02 Roofing tiles
E03 Gutters
E04 Downpipes
E05 Exterior paint
E06 Exterior cladding
E07 Brick
E08 Stone
E09 Paving
E10 Driveway
E11 Garage door
E12 Front door
E13 Security gate
E14 Fence
E15 Fence panels
E16 Gate motor
E17 Intercom
E18 Security camera
E19 Doorbell
E20 Exterior lighting
```

Now you're advertising construction products too.

---

# 16. Pool, if you have one

Make it a product zone.

```text
POOL

P01 Pool tiles
P02 Pool coping
P03 Pool pump
P04 Pool filter
P05 Pool lights
P06 Pool heater
P07 Pool cover
P08 Pool furniture
P09 Pool umbrella
P10 Pool cleaner
P11 Pool chemicals
P12 Outdoor shower
P13 Pool accessories
```

---

# 17. The garage

Another huge opportunity.

```text
GARAGE

GAR01 Garage door
GAR02 Storage system
GAR03 Shelving
GAR04 Workbench
GAR05 Tool cabinet
GAR06 Toolbox
GAR07 Power tools
GAR08 Compressor
GAR09 Vacuum
GAR10 Bicycle
GAR11 Car accessories
GAR12 Lighting
GAR13 Floor coating
GAR14 Wall storage
```

---

# 18. The critical part: Product IDs

Every product should have a unique ID.

For example:

```text
SHOP001_PRODUCT0042
```

But I'd use something more descriptive internally:

```text
KITCHEN_APPLIANCE_COFFEE_MACHINE_001
```

Then associate it with a business.

For example:

```text
PRODUCT_ID:
    PROD_000184

SHOP_ID:
    SHOP_00027

CATEGORY:
    Kitchen Appliance

SUBCATEGORY:
    Coffee Machine

BRAND:
    Example Brand

MODEL:
    XYZ-500

DIMENSIONS:
    320 × 410 × 450 mm

ASSET:
    PROD_000184.blend
```

---

# 19. Your Blender asset library

I'd structure it approximately like this:

```text
VIRTUAL_HOUSE/
│
├── HOUSE/
│   ├── Architecture/
│   ├── Materials/
│   ├── Lighting/
│   ├── Cameras/
│   └── Slots/
│
├── PRODUCTS/
│   ├── SHOP_0001/
│   │   ├── Product_0001/
│   │   ├── Product_0002/
│   │   └── Product_0003/
│   │
│   ├── SHOP_0002/
│   │   ├── Product_0001/
│   │   └── Product_0002/
│
├── MATERIALS/
│   ├── Flooring/
│   ├── Tiles/
│   ├── Paint/
│   ├── Wood/
│   ├── Stone/
│   └── Fabric/
│
├── CAMPAIGNS/
│   ├── Campaign_0001/
│   ├── Campaign_0002/
│   └── Campaign_0003/
│
└── RENDERS/
```

---

# 20. The slot system should be intelligent

This is where I'd ask Claude Code to help you.

Each slot should have something like:

```text
Slot ID:
KITCHEN_COUNTER_005

Room:
Kitchen

Category:
Appliance

Allowed Categories:
Kitchen Appliance
Small Appliance

Preferred Categories:
Coffee Machine
Kettle
Toaster

Position:
...

Rotation:
...

Scale:
Real World

Camera:
Kitchen_Camera_02

Importance:
HIGH
```

Then you can have a **slot browser**.

Something conceptually like:

```text
VIRTUAL HOUSE PRODUCT MANAGER

Room:
[ Kitchen ▼ ]

Category:
[ Appliances ▼ ]

Available Slots:

☐ KITCHEN_APPLIANCE_001
☐ KITCHEN_APPLIANCE_002
☐ KITCHEN_COUNTER_003
☐ KITCHEN_COUNTER_004

Product:
[ Coffee Machine XYZ ]

        [ PLACE PRODUCT ]
```

That's the direction I'd ultimately take.

---

# 21. Don't make every slot visible

You can have three states:

```text
EMPTY
PLACEHOLDER
PRODUCT
```

During development:

```text
Kitchen
 ├── [Coffee Machine Slot]
 ├── [Toaster Slot]
 ├── [Blender Slot]
 └── [Kettle Slot]
```

The placeholders could be simple colored bounding boxes or small labels.

Once the scene is production-ready:

```text
PLACEHOLDER → HIDDEN
PRODUCT → VISIBLE
```

---

# 22. Create a "slot marker" object

For example:

```text
SLOT_KITCHEN_COUNTER_001
```

could be an Empty in Blender.

Give it custom properties:

```text
slot_id
slot_category
room
subcategory
allowed_asset_types
priority
camera_visibility
scale_mode
```

That is **much better than hardcoding coordinates into Python**.

Claude Code can then scan the `.blend` file for every object beginning with:

```text
SLOT_
```

and understand your entire advertising infrastructure.

---

# 23. Product placement shouldn't destroy your scene

Use linked assets/collections wherever possible.

Conceptually:

```text
HOUSE.blend
     │
     ├── SLOT_KITCHEN_001
     │        ↓
     │     linked product
     │
     ├── SLOT_LIVING_001
     │        ↓
     │     linked product
     │
     └── SLOT_BEDROOM_001
              ↓
           linked product
```

If you update the original product asset, the house can update too.

That becomes very powerful when a retailer gives you an updated product model.

---

# 24. Camera system

You should also build **advertising cameras** into the house.

Not just one tour camera.

For example:

```text
CAMERAS/

TOUR_MAIN

KITCHEN
KITCHEN_WIDE
KITCHEN_COUNTER
KITCHEN_APPLIANCE
KITCHEN_SINK
KITCHEN_TILE

LIVING
LIVING_WIDE
LIVING_TV
LIVING_SOFA
LIVING_DECOR

MASTER
MASTER_WIDE
MASTER_BED
MASTER_NIGHTSTAND

BATHROOM
BATHROOM_WIDE
BATHROOM_VANITY
BATHROOM_SHOWER

GARDEN
GARDEN_WIDE
GARDEN_FURNITURE
GARDEN_PLANTS

EXTERIOR
EXTERIOR_WIDE
FRONT_DOOR
DRIVEWAY
ROOF
```

This means one product can automatically generate:

**Hero shot → close-up → house tour appearance → social media shot.**

---

# 25. Product priority

Not every product needs the same treatment.

Give each slot a priority:

```text
HERO
HIGH
MEDIUM
LOW
BACKGROUND
```

For example:

A shop pays you specifically to advertise a coffee machine.

```text
Coffee machine:
    HERO
```

Books sitting on a shelf:

```text
Books:
    BACKGROUND
```

Now your rendering system knows which objects deserve close-up shots.

---

# 26. Your business model becomes interesting

A shop could give you:

> "Here are 10 products."

You import them.

Your system says:

```text
10 PRODUCTS RECEIVED

Product 1 → Kitchen Counter
Product 2 → Living Room
Product 3 → Bedroom
Product 4 → Bathroom
Product 5 → Garden
...
```

Then you produce:

```text
HOUSE TOUR
+
PRODUCT PLACEMENT
+
PRODUCT CLOSE-UP
+
PRODUCT INFORMATION
+
SHOP INFORMATION
```

Now you're effectively bringing a **digital version of the shop into someone's home**.

That's the concept I'd build around.

---

# 27. I would also make a "product wall"

Some products don't naturally belong somewhere.

Create an area in the house like:

**"Featured Products"**

Could be:

```text
FEATURED_PRODUCT_WALL

FP01
FP02
FP03
FP04
FP05
FP06
FP07
FP08
```

Products can be displayed on:

* Shelves
* Pedestals
* Tables
* Wall mounts
* Display cabinets

Then virtually anything can be advertised.

---

# 28. The same thing for the yard

Create a **landscape product grid**.

```text
YARD_PRODUCT_ZONE

Paving Slot
Paving Slot
Paving Slot

Plant Slot
Plant Slot
Plant Slot

Pot Slot
Pot Slot
Pot Slot

Outdoor Furniture Slot
Outdoor Furniture Slot

Lighting Slot
Lighting Slot
```

A landscaping company could potentially advertise an entire garden package.

---

# 29. The database becomes the backbone

Eventually Blender shouldn't be your only source of truth.

You want something conceptually like:

```text
SHOP
 │
 ├── PRODUCTS
 │      │
 │      ├── ASSET
 │      ├── CATEGORY
 │      ├── PRICE
 │      ├── DESCRIPTION
 │      └── ADVERTISING INFORMATION
 │
 └── CAMPAIGNS
        │
        ├── HOUSE
        ├── SLOTS
        ├── CAMERAS
        └── RENDERS
```

Blender handles the **visual world**.

Your database handles the **commercial world**.

---

# 30. What Claude Code should build

I wouldn't ask Claude Code:

> "Make me a house with product placeholders."

That's too vague.

I'd give it an architecture like this:

```text
BUILD A MODULAR BLENDER PRODUCT ADVERTISING SYSTEM

GOAL:
Create a reusable virtual house that functions as a product
advertising environment.

CORE PRINCIPLE:
The house is permanent.
Products are replaceable.
Every potentially advertisable object or material has a slot.
Slots contain metadata.
Products are external/linked assets.
Products can be swapped without modifying the house.

SYSTEMS REQUIRED:

1. HOUSE ARCHITECTURE
2. ROOM ORGANIZATION
3. PRODUCT SLOT SYSTEM
4. PRODUCT ASSET SYSTEM
5. MATERIAL SLOT SYSTEM
6. PRODUCT METADATA SYSTEM
7. PRODUCT SWAPPING
8. CAMERA SYSTEM
9. ADVERTISING SHOT SYSTEM
10. CAMPAIGN SYSTEM
11. RENDER SYSTEM
12. SLOT VALIDATION
13. PRODUCT COMPATIBILITY
14. BLENDER UI PANEL
15. IMPORT/EXPORT
```

Then give it the room/slot specification.

---

# 31. And I'd specifically tell Claude Code to build the slots in phases

Don't let it attempt 500 complicated assets at once.

### Phase 1

Build:

```text
Slot framework
Custom properties
Naming convention
Collections
Room hierarchy
Product import
Product swap
```

### Phase 2

Build:

```text
Kitchen
Living room
Bedroom 1
Bedroom 2
Bedroom 3
Bedroom 4
Bathroom
Hallway
Garage
Yard
Exterior
```

### Phase 3

Build:

```text
Material slots
Tile swapping
Paint swapping
Floor swapping
Wallpaper
Wood
Stone
```

### Phase 4

Build:

```text
Camera system
Tour system
Hero cameras
Product closeups
Automatic framing
```

### Phase 5

Build:

```text
Product database
Shop database
Campaign database
Blender UI
Batch rendering
```

That makes the project much more manageable.

---

# 32. One more thing I'd strongly recommend

**Don't make the slots dependent on exact product dimensions.**

Instead, have a bounding volume.

For example:

```text
KITCHEN_COUNTER_SMALL_APPLIANCE
```

might have:

```text
Maximum width: 500mm
Maximum depth: 450mm
Maximum height: 600mm
```

When you give Blender a product, it checks:

```text
PRODUCT
Width: 320mm
Depth: 400mm
Height: 450mm

SLOT
Width: 500mm
Depth: 450mm
Height: 600mm

RESULT:
✓ Compatible
```

But:

```text
PRODUCT
Width: 800mm

RESULT:
✗ Too wide for slot
```

That prevents ridiculous placements.

---

# 33. Ultimately, your Blender project should look conceptually like this

```text
                         VIRTUAL HOUSE
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
      HOUSE                 YARD                  EXTERIOR
        │                     │                      │
   ┌────┼────┐          ┌─────┼─────┐          ┌────┼────┐
   │    │    │          │     │     │          │    │    │
Kitchen Living Bedrooms Garden Pool Driveway Roof Walls
   │      │      │        │      │      │       │
   │      │      │        │      │      │       │
 SLOTS  SLOTS  SLOTS    SLOTS  SLOTS  SLOTS   SLOTS
   │      │      │        │      │      │       │
   └──────┴──────┴────────┴──────┴──────┴───────┘
                         │
                    PRODUCT LIBRARY
                         │
             ┌───────────┼───────────┐
             │           │           │
           SHOP A      SHOP B      SHOP C
             │           │           │
          Products    Products    Products
                         │
                         ↓
                  CAMPAIGN SYSTEM
                         │
             ┌───────────┼───────────┐
             ↓           ↓           ↓
          HOUSE TOUR   HERO SHOTS   SOCIAL
```

**That's the architecture I'd pursue.**

And importantly, I'd build the first house **with far more slots than you currently need**. Empty slots cost almost nothing. Rebuilding the architecture later because you suddenly realize you need 40 tile positions, 30 book positions, 15 lighting positions, etc. is expensive.

The next step I would take is to turn this into a **proper Claude Code implementation specification**: exact Blender collection hierarchy, exact naming conventions, custom properties, Python modules, slot types, room-by-room slot inventory (potentially **500–1,000+ slots**), product JSON schema, swapping algorithm, compatibility rules, and the Blender UI Claude should create. That would give you something you can essentially hand directly to Claude Code and have it build incrementally.





INSTRUCTIONS PART 2

Absolutely. Since you already gave Claude Code the first architecture document, I would make this **Document 2** and explicitly tell it that this is an extension of the previous specification.

The most important change is that your system is no longer just a Blender project. It is a **Next.js + Three.js application backed by Supabase**, with Blender acting as the content-production pipeline.

I would enforce a very strict separation between:

* **3D content**
* **material/product assets**
* **database**
* **business/shop data**
* **admin**
* **customer-facing experience**
* **render/campaign logic**
* **authentication/authorization**

For Supabase, I would have the application use RLS as the database-level security boundary, with role/permission claims where appropriate; Supabase specifically recommends RLS for exposed tables and supports custom claims/RBAC for application roles. Service-role keys must remain server-side and never reach the browser. ([Supabase][1])

Below is the document I would put into your `.md` file.

# Virtual Shopping House

## Document 2 — Materials, Content Pipeline, Database, Admin & Platform Architecture

## 0. IMPORTANT: THIS DOCUMENT EXTENDS THE PREVIOUS SPECIFICATION

This document is an extension of the previous Virtual Shopping House / Product Slot architecture.

The previous document defines the concept of:

* A permanent virtual house
* Product slots
* Replaceable products
* Rooms
* Product libraries
* Camera systems
* Advertising environments
* Product placement

This document adds:

* PBR material architecture
* Texture/material production
* Material slots
* Product and material databases
* Supabase architecture
* Storage architecture
* Shop management
* Product management
* Admin management
* User roles
* Permissions
* Campaign management
* Content moderation
* Asset processing
* Three.js runtime architecture
* Blender-to-web pipeline
* Separation of concerns
* API architecture
* Audit logs
* Publishing workflows
* Versioning
* Scalability
* Security
* Automated asset validation

DO NOT treat the entire application as one monolithic system.

The most important architectural principle is:

> SEPARATION OF CONCERNS IS MANDATORY.

The 3D renderer must not become the database.

The database must not contain rendering logic.

The admin UI must not directly manipulate raw Three.js state.

The public website must not have administrative privileges.

Blender must remain a content-production tool rather than becoming the application's backend.

---

# 1. HIGH-LEVEL SYSTEM ARCHITECTURE

The platform should be divided into these major systems:

```text
VIRTUAL SHOPPING HOUSE PLATFORM

                    ┌─────────────────────┐
                    │      NEXT.JS       │
                    │    APPLICATION     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ↓                ↓                ↓
        PUBLIC EXPERIENCE    ADMIN UI      CUSTOMER/SHOP UI
              │                │                │
              └────────────────┼────────────────┘
                               ↓
                         APPLICATION API
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ↓                ↓                ↓
          SUPABASE DB      SUPABASE AUTH    SUPABASE STORAGE
              │
              ↓
        BUSINESS DOMAIN DATA
              │
      ┌───────┼────────┐
      ↓       ↓        ↓
    Shops  Products  Campaigns
      │       │        │
      └───────┼────────┘
              ↓
       3D CONTENT METADATA
              │
       ┌──────┼────────┐
       ↓      ↓        ↓
    Assets  Materials  Slots
       │      │        │
       └──────┼────────┘
              ↓
        THREE.JS RUNTIME
              │
              ↓
       VIRTUAL HOUSE
```

Blender is a separate content-production pipeline:

```text
BLENDER CONTENT PIPELINE

Blender
   ↓
House
   ↓
Slots
   ↓
Products
   ↓
Materials
   ↓
Optimisation
   ↓
Export
   ↓
GLB / GLTF / Textures
   ↓
Storage/CDN
   ↓
Next.js / Three.js
```

---

# 2. CORE PRINCIPLE

The platform has two worlds.

## World A — Content Production

Blender is used to create:

* House
* Rooms
* Furniture
* Products
* Materials
* Product slots
* Material slots
* Cameras
* Lighting
* Environment
* 3D assets

## World B — Commercial Platform

Next.js + Supabase are used to manage:

* Users
* Shops
* Products
* Materials
* Categories
* Campaigns
* Advertisements
* Product placements
* Permissions
* Publishing
* Analytics
* Asset metadata
* Approvals
* Admin operations

Do not tightly couple these two worlds.

Blender creates and exports content.

Supabase manages the business and content metadata.

Three.js displays published content.

---

# 3. SEPARATION OF CONCERNS

The codebase must have clear domains.

Suggested architecture:

```text
src/

  app/
    public/
    shop/
    admin/
    campaigns/

  components/
    ui/
    forms/
    navigation/
    product/
    shop/
    admin/

  features/
    products/
    materials/
    shops/
    campaigns/
    houses/
    slots/
    assets/
    placements/
    analytics/

  three/
    engine/
    scenes/
    loaders/
    materials/
    products/
    slots/
    cameras/
    interaction/

  domain/
    products/
    materials/
    shops/
    campaigns/
    users/
    permissions/

  services/
    storage/
    assets/
    products/
    materials/
    campaigns/

  server/
    auth/
    permissions/
    api/
    admin/

  lib/
    supabase/
    validation/
    logging/
    configuration/

  types/
```

Do not put everything inside:

```text
components/ThreeScene.tsx
```

Do not create one giant:

```text
page.tsx
```

Do not put database queries directly into Three.js components.

Do not let UI components contain business rules.

---

# 4. THREE.JS MUST BE A RENDERING/INTERACTION LAYER

Three.js should answer:

> How do I display this world?

It should NOT answer:

> Who owns this product?

or:

> Is this shop allowed to edit this product?

or:

> What is the price?

Those belong to the application/domain/database layers.

Three.js receives a published scene description such as:

```json
{
  "houseId": "house_001",
  "roomId": "kitchen",
  "placements": [
    {
      "slotId": "kitchen_counter_001",
      "assetId": "product_123",
      "visible": true
    }
  ]
}
```

Three.js renders that information.

---

# 5. SUPABASE IS THE COMMERCIAL SOURCE OF TRUTH

Supabase/Postgres should contain:

* users
* profiles
* roles
* permissions
* shops
* shop members
* products
* product variants
* materials
* assets
* slots
* placements
* houses
* rooms
* campaigns
* advertisements
* publishing states
* approvals
* audit logs

Supabase Storage should contain:

* GLB files
* GLTF files
* textures
* thumbnails
* previews
* material maps
* product images
* source files
* generated assets
* campaign renders

Do not store large binary 3D assets directly inside normal database rows.

---

# 6. DATABASE DOMAIN MODEL

Create separate tables for separate concepts.

Do NOT create one giant products table containing every possible piece of information.

Recommended core tables:

```text
profiles
user_roles
permissions
role_permissions

shops
shop_members
shop_settings

houses
rooms
slots
slot_types
slot_compatibility

products
product_variants
product_categories
product_tags

materials
material_variants
material_categories

assets
asset_versions
asset_files
asset_processing_jobs

placements
material_assignments

campaigns
campaign_products
campaign_placements

advertisements
advertisement_shots

publishing
publication_versions

approvals
audit_logs

analytics_events
```

---

# 7. USERS

A user is not automatically an admin.

Use application roles.

Suggested roles:

```text
SUPER_ADMIN
ADMIN
CONTENT_MANAGER
ASSET_MANAGER
SHOP_MANAGER
SHOP_EDITOR
MARKETING_MANAGER
REVIEWER
ANALYST
CUSTOMER
```

Potential future roles:

```text
3D_ARTIST
MATERIAL_ARTIST
PHOTOGRAPHER
CAMPAIGN_MANAGER
MODERATOR
SUPPORT_AGENT
```

Do not hardcode authorization rules only in React.

Authorization must exist server-side and at the database level.

Supabase supports RBAC using custom claims and RLS policies, which is appropriate for this architecture. ([Supabase][1])

---

# 8. ROLE RESPONSIBILITIES

## SUPER_ADMIN

Can:

* Create/delete administrators
* Configure roles
* Configure permissions
* Manage all shops
* Manage all users
* Manage houses
* Manage rooms
* Manage slots
* Manage materials
* Manage products
* Manage campaigns
* Publish/unpublish content
* Override moderation
* Manage system settings
* View audit logs
* Manage storage
* Manage asset processing
* Repair broken assets
* Archive content
* Restore content

This is the highest application-level role.

---

## ADMIN

Can:

* Manage shops
* Manage users
* Manage products
* Manage materials
* Manage campaigns
* Approve content
* Publish content
* Manage assets
* View analytics
* Manage categories
* Manage placements
* Manage advertisements

Should NOT automatically be able to modify infrastructure secrets.

---

## CONTENT_MANAGER

Can:

* Manage houses
* Manage rooms
* Manage slots
* Manage product placement
* Manage material placement
* Manage scenes
* Manage cameras
* Publish scene content if granted

---

## ASSET_MANAGER

Can:

* Upload assets
* Process assets
* Replace asset versions
* Generate thumbnails
* Validate GLB/GLTF
* Validate textures
* Manage material maps
* Manage asset metadata

---

## SHOP_MANAGER

Can:

* Manage their own shop
* Add products
* Edit products
* Upload product assets
* Upload product images
* Submit products for approval
* Create campaigns
* View their own analytics

They cannot modify another shop.

---

## SHOP_EDITOR

Can:

* Edit products
* Upload images
* Edit descriptions
* Edit asset metadata

Cannot:

* Delete the shop
* Manage members
* Publish without permission

---

## REVIEWER

Can:

* Review products
* Review materials
* Approve/reject assets
* Approve campaigns

Cannot modify unrelated commercial data.

---

# 9. PERMISSION SYSTEM

Do not make the frontend check:

```text
if user.role === "admin"
```

everywhere.

Instead create permissions.

Examples:

```text
users.read
users.create
users.update
users.delete

shops.read
shops.create
shops.update
shops.delete

products.read
products.create
products.update
products.delete
products.publish

materials.read
materials.create
materials.update
materials.delete
materials.publish

assets.upload
assets.process
assets.replace
assets.delete

houses.read
houses.update

slots.read
slots.create
slots.update
slots.delete

placements.create
placements.update
placements.delete

campaigns.create
campaigns.update
campaigns.publish

analytics.read

settings.read
settings.update
```

Roles receive permissions.

This makes the system extensible.

Supabase's RBAC approach supports this role → permission model and can be enforced through RLS. ([Supabase][1])

---

# 10. DATABASE SECURITY

Every exposed application table must use appropriate Row Level Security.

Never rely only on:

```text
Next.js middleware
```

or:

```text
React permission checks
```

for security.

Frontend permission checks are for UX.

Database RLS is the actual data-access boundary.

Supabase explicitly recommends enabling RLS for exposed tables and using policies to control which rows users can access. ([Supabase][2])

The service role key must never be sent to the browser.

It must only exist in trusted server-side code. ([Supabase][3])

---

# 11. MULTI-TENANCY

The platform should support many shops.

Every shop-owned record should be traceable to a shop.

Example:

```text
shops
  ↓
products
  ↓
product_variants
  ↓
assets
```

Shop A must never be able to modify:

```text
Shop B's products
Shop B's campaigns
Shop B's assets
Shop B's analytics
```

Use RLS policies based on shop membership.

---

# 12. PRODUCTS

Products should have commercial metadata.

Example:

```text
product
---------
id
shop_id
category_id
name
slug
brand
model
description
sku
status
visibility
created_at
updated_at
```

Do not put every 3D property here.

3D properties belong to the asset domain.

---

# 13. PRODUCT VARIANTS

A product may have:

* Different colors
* Different sizes
* Different finishes
* Different models
* Different packaging

Therefore:

```text
product
    ↓
product_variants
```

Example:

```text
Coffee Machine
    ├── Black
    ├── White
    └── Stainless Steel
```

Each variant may have its own:

* images
* 3D asset
* materials
* dimensions

---

# 14. ASSET SYSTEM

Separate:

```text
PRODUCT
```

from:

```text
3D ASSET
```

A product is a commercial object.

An asset is a file representation.

One product can have multiple assets:

```text
PRODUCT
   │
   ├── GLB
   ├── high-resolution GLB
   ├── web GLB
   ├── thumbnail
   ├── product photo
   └── AR version
```

---

# 15. ASSET VERSIONING

Never simply overwrite assets without versioning.

Use:

```text
asset
   ↓
asset_versions
   ↓
asset_files
```

Example:

```text
CoffeeMachine
    v1
    v2
    v3
```

The current published version should be explicitly marked.

This allows rollback.

---

# 16. ASSET PROCESSING PIPELINE

When an asset is uploaded:

```text
UPLOAD
   ↓
VALIDATE
   ↓
SCAN
   ↓
OPTIMIZE
   ↓
GENERATE PREVIEW
   ↓
GENERATE THUMBNAIL
   ↓
GENERATE WEB VERSION
   ↓
EXTRACT METADATA
   ↓
CHECK DIMENSIONS
   ↓
CHECK MATERIALS
   ↓
CHECK TEXTURES
   ↓
READY FOR REVIEW
```

Do not immediately make uploaded assets public.

---

# 17. ASSET STATES

Use a state machine:

```text
DRAFT
UPLOADED
PROCESSING
PROCESSING_FAILED
READY_FOR_REVIEW
REJECTED
APPROVED
PUBLISHED
ARCHIVED
```

Never use arbitrary booleans like:

```text
isApproved
isPublished
isProcessed
```

as the only source of truth.

A state machine is easier to reason about.

---

# 18. MATERIAL SYSTEM

Materials are first-class platform entities.

A material should have:

```text
material_id
name
category
subcategory
manufacturer
shop_id
description
real_width
real_height
real_depth
mapping_mode
material_type
status
```

Possible material types:

```text
PBR_IMAGE
PROCEDURAL
HYBRID
DECAL
TILEABLE
UNIQUE
```

---

# 19. PBR MATERIAL STRUCTURE

A material can contain:

```text
Base Color
Roughness
Normal
Height
Ambient Occlusion
Metallic
Opacity
Emission
Displacement
```

Not every material needs every map.

For example:

```text
WOOD
Base Color
Roughness
Normal
Height
```

Metal:

```text
METAL
Base Color
Metallic
Roughness
Normal
```

Glass:

```text
GLASS
Base Color
Transmission
Roughness
IOR
Normal
```

---

# 20. MATERIAL FILE STRUCTURE

Store materials approximately as:

```text
materials/
  MAT_000001/
    material.json
    preview.webp

    maps/
      basecolor.webp
      normal.webp
      roughness.webp
      metallic.webp
      height.webp
      ao.webp

    source/
      original.jpg

    blender/
      MAT_000001.blend

    web/
      material.json
```

The database stores metadata.

Storage stores the actual files.

---

# 21. MATERIAL METADATA

Example:

```json
{
  "materialId": "MAT_000123",
  "name": "Carrara Marble",
  "category": "flooring",
  "type": "PBR_IMAGE",
  "tileable": true,
  "realWorldSize": {
    "width": 1.2,
    "height": 0.6
  },
  "maps": {
    "baseColor": true,
    "normal": true,
    "roughness": true,
    "height": true,
    "ao": true,
    "metallic": false
  }
}
```

---

# 22. MATERIAL SLOT SYSTEM

Material slots work like product slots.

Example:

```text
KITCHEN_FLOOR_MATERIAL_SLOT
```

Properties:

```text
slot_id
room_id
slot_type
allowed_material_categories
surface_area
mapping_mode
real_world_dimensions
priority
```

Possible categories:

```text
FLOOR
WALL
CEILING
COUNTERTOP
BACKSPLASH
CABINET
DOOR
WINDOW
ROOF
PATIO
DRIVEWAY
```

---

# 23. MATERIAL COMPATIBILITY

A marble flooring material should be allowed in:

```text
FLOOR
```

but not automatically:

```text
FABRIC
```

Create compatibility rules.

Example:

```text
material_category:
FLOORING

compatible_slot_types:
FLOOR
PATIO
STAIR
```

---

# 24. REAL-WORLD MAPPING

This is extremely important.

Never depend only on arbitrary UV scale.

Materials should support:

```text
REAL_WORLD
UV
PROCEDURAL
OBJECT
TRIPLANAR
```

For tiles:

```text
tile_width = 0.6m
tile_height = 0.6m
```

The renderer calculates the correct texture scale.

---

# 25. TILE MATERIALS

Tile materials should optionally support:

```text
tile_width
tile_height
grout_width
grout_depth
grout_color
tile_rotation
random_rotation
random_color_variation
```

Example:

```text
600mm × 600mm
3mm grout
```

The Three.js material system should be able to represent the tile realistically.

---

# 26. WOOD MATERIALS

Wood materials should support:

```text
board_length
board_width
board_thickness
grain_direction
random_offset
color_variation
roughness_variation
```

This allows a real flooring product to be represented according to its actual dimensions.

---

# 27. MATERIAL VARIATION

Avoid obvious repetition.

Support:

```text
color variation
roughness variation
rotation variation
UV offset
noise
microdetail
macrodetail
```

The goal is:

```text
same product
        ↓
many instances
        ↓
natural variation
```

without changing the actual commercial appearance of the product.

---

# 28. BLENDER MATERIAL MASTER

Create a reusable Blender material framework.

Conceptually:

```text
MATERIAL INPUT
      │
      ├── Base Color
      ├── Roughness
      ├── Metallic
      ├── Normal
      ├── Height
      ├── AO
      └── Variation
             ↓
       MASTER PBR NODE
             ↓
       BLENDER MATERIAL
```

All generated materials should follow a predictable structure.

This makes automation possible.

---

# 29. AMBIENTCG-STYLE MATERIAL IMPORT

The platform should eventually support importing PBR material packages from sources such as:

* ambientCG
* manually photographed materials
* scanned materials
* shop-supplied texture packs
* generated materials
* procedural materials

The system should normalize them into the platform's own format.

Do not make the application dependent on one external material provider.

---

# 30. MATERIAL INGESTION

Example workflow:

```text
SOURCE MATERIAL
      ↓
IMPORT
      ↓
IDENTIFY MAPS
      ↓
NORMALIZE NAMES
      ↓
NORMALIZE FORMAT
      ↓
VALIDATE RESOLUTION
      ↓
VALIDATE TILEABILITY
      ↓
GENERATE PREVIEW
      ↓
CREATE MATERIAL RECORD
      ↓
REVIEW
      ↓
PUBLISH
```

Map name normalization should recognize common variants such as:

```text
BaseColor
Base_Color
Albedo
Diffuse

Normal
NormalGL
NormalDX

Roughness
Rough

Metallic
Metalness

Height
Displacement
Displace

AO
AmbientOcclusion
```

---

# 31. TEXTURE RESOLUTION POLICY

Support multiple resolutions.

Example:

```text
LOW
512

WEB
1024

HIGH
2048

ULTRA
4096
```

Do not send 4K textures to every browser by default.

Three.js should load the appropriate resolution based on:

* device
* distance
* scene
* asset
* quality setting
* connection

---

# 32. WEB ASSET OPTIMIZATION

The web version of an asset should be optimized separately from the Blender source.

Pipeline:

```text
BLENDER MASTER
       ↓
WEB EXPORT
       ↓
GLB
       ↓
COMPRESS
       ↓
DRACO / MESHOPT where appropriate
       ↓
TEXTURE OPTIMIZATION
       ↓
WEB STORAGE
```

Keep the master source separate.

Never destroy the high-quality source just to optimize the web asset.

---

# 33. HOUSE DATABASE MODEL

A house should be a database entity.

```text
house
  id
  name
  slug
  version
  status
  thumbnail
  default_scene
```

Rooms:

```text
house
  ↓
rooms
```

Example:

```text
HOUSE_001

Kitchen
Living Room
Dining Room
Master Bedroom
Bedroom 2
Bedroom 3
Bedroom 4
Bathroom 1
Bathroom 2
Hallway
Garage
Garden
Pool
Patio
Front Yard
Back Yard
Exterior
```

---

# 34. SLOTS DATABASE MODEL

Do not rely exclusively on objects inside Blender.

The application should know about the slot.

```text
slot
  id
  house_id
  room_id
  slot_type_id
  name
  category
  position
  rotation
  scale
  compatibility_rules
  status
```

Blender can contain the corresponding physical Empty/object.

The database provides the commercial representation.

---

# 35. BLENDER SLOT IDENTITY

Every Blender slot should have a stable ID.

Example:

```text
SLOT_KITCHEN_COUNTER_001
```

Store this exact ID in Blender custom properties.

Example:

```text
slot_id = "SLOT_KITCHEN_COUNTER_001"
```

The web application uses the same ID.

Never depend on Blender's object index.

Never depend on object order.

Never depend on automatically generated names.

---

# 36. PLACEMENTS

A slot does not necessarily permanently contain a product.

Use:

```text
slot
   ↓
placement
   ↓
product / material
```

Example:

```text
SLOT_KITCHEN_COUNTER_001
        ↓
PLACEMENT_123
        ↓
PRODUCT_COFFEE_MACHINE_001
```

A placement can have:

```text
position_offset
rotation_offset
scale_multiplier
visibility
start_date
end_date
campaign_id
```

---

# 37. CAMPAIGNS

A campaign represents a commercial configuration.

Example:

```text
campaign
  id
  shop_id
  name
  description
  status
  start_date
  end_date
```

A campaign may contain:

```text
products
materials
placements
shots
house configuration
```

---

# 38. CAMPAIGN EXAMPLE

```text
CAMPAIGN: SUMMER HOME

Shop:
Furniture Company

Products:
Sofa
Coffee Table
TV Stand
Outdoor Chair
Lamp

Materials:
Floor Tile
Wall Paint

Placements:
Living Room Sofa
Living Room Table
Garden Chair
Kitchen Tile

Shots:
Living Room Hero
Kitchen Wide
Garden Hero
```

---

# 39. PUBLISHING

Do not immediately expose database changes to the public scene.

Use:

```text
DRAFT
   ↓
REVIEW
   ↓
APPROVED
   ↓
PUBLISHED
```

The public Three.js application should preferably consume a **published scene representation**, not arbitrary draft database state.

---

# 40. PUBLIC SCENE SNAPSHOT

Create a concept of:

```text
published_scene_version
```

It contains the resolved information needed by the renderer.

For example:

```json
{
  "house": "house_001",
  "version": 12,
  "rooms": [...],
  "placements": [...],
  "materials": [...],
  "assets": [...]
}
```

This improves stability.

The renderer should not need to perform dozens of complicated business queries just to display a house.

---

# 41. SCENE RESOLUTION

The backend should resolve:

```text
HOUSE
+
SLOTS
+
PLACEMENTS
+
PRODUCTS
+
MATERIALS
+
ASSETS
+
CAMPAIGN
```

into:

```text
PUBLISHED SCENE
```

Three.js consumes that scene.

This is a major separation-of-concerns rule.

---

# 42. THREE.JS LOADING

Three.js should have separate systems:

```text
AssetLoader
MaterialLoader
ProductLoader
HouseLoader
SlotResolver
SceneManager
CameraManager
InteractionManager
PerformanceManager
```

Do not make one `loadEverything()` function.

---

# 43. ASSET CACHE

Assets should be cached.

If ten slots use the same product:

```text
Product A
Product A
Product A
Product A
```

do not download the GLB four times.

Load once.

Instance/reuse where possible.

---

# 44. PRODUCT INSTANCING

If a material/product can be reused safely:

```text
ONE ASSET
   ↓
INSTANCE
   ↓
INSTANCE
   ↓
INSTANCE
```

This is especially important for:

* Books
* Plants
* Lamps
* Chairs
* Tiles
* Decorations

---

# 45. ADMIN DASHBOARD

The admin dashboard should be a major part of the platform.

Suggested:

```text
/admin

Dashboard
Shops
Users
Products
Materials
Assets
Houses
Rooms
Slots
Placements
Campaigns
Advertisements
Approvals
Analytics
Audit Logs
System Settings
```

---

# 46. ADMIN DASHBOARD — DASHBOARD

Show:

```text
Total Shops
Total Products
Total Materials
Total Assets
Pending Reviews
Active Campaigns
Published Campaigns
Asset Processing Errors
Broken Assets
Recent Activity
```

---

# 47. ADMIN — SHOPS

Admin should be able to:

```text
Create shop
Edit shop
Suspend shop
Reactivate shop
View shop
Manage members
View products
View campaigns
View assets
View analytics
```

Shop page:

```text
Shop
 ├── Profile
 ├── Members
 ├── Products
 ├── Materials
 ├── Assets
 ├── Campaigns
 ├── Advertisements
 └── Analytics
```

---

# 48. ADMIN — PRODUCT MANAGER

Admin should be able to:

```text
Create product
Edit product
Archive product
Approve product
Reject product
Upload asset
Replace asset
Assign category
Assign tags
Set compatibility
Preview in house
Assign slots
Create campaign
```

---

# 49. ADMIN — MATERIAL MANAGER

Admin should be able to:

```text
Create material
Upload PBR maps
Import material
Edit material
Preview material
Set real-world size
Set category
Set compatibility
Assign to material slots
Approve
Publish
Archive
```

---

# 50. ADMIN — HOUSE EDITOR

The house editor should show:

```text
House
 ├── Rooms
 │    ├── Kitchen
 │    ├── Living
 │    ├── Bedroom 1
 │    └── ...
 │
 ├── Product Slots
 ├── Material Slots
 ├── Cameras
 └── Lighting
```

Admin can inspect:

```text
Slot
Compatible categories
Current product
Current material
Position
Rotation
Scale
Visibility
Priority
```

---

# 51. SLOT INSPECTOR

When an admin clicks a slot:

```text
SLOT INSPECTOR

Slot ID:
SLOT_KITCHEN_COUNTER_001

Room:
Kitchen

Type:
Small Appliance

Status:
Active

Current Product:
Coffee Machine

Compatible Categories:
Coffee Machine
Kettle
Toaster
Blender

Current Campaign:
Summer Campaign

[Replace Product]

[Clear Slot]

[View Asset]

[View History]
```

---

# 52. MATERIAL SLOT INSPECTOR

Example:

```text
MATERIAL SLOT

ID:
MAT_SLOT_KITCHEN_FLOOR

Surface:
Kitchen Floor

Current Material:
Carrara Marble

Real World Scale:
1.2m × 0.6m

Grout:
3mm

[Change Material]

[Edit Mapping]

[Preview]

[View Product]
```

---

# 53. ADMIN — ASSET PROCESSING

Admin should have an asset-processing queue.

```text
ASSET PROCESSING

CoffeeMachine.glb
    PROCESSING

MarbleTile.zip
    READY

Sofa.glb
    FAILED

OakFloor.zip
    REVIEW
```

Clicking an asset should show diagnostics.

---

# 54. ASSET VALIDATION

Validate:

```text
File exists
File format
File size
Polygon count
Texture count
Texture resolution
Missing textures
Material count
Bounding box
Dimensions
Origin
Scale
Animation
Normals
UVs
Transparency
```

Flag problems.

Example:

```text
WARNING

Asset dimensions appear incorrect.

Detected:
8.4m wide

Expected:
0.8m – 2.5m

[Review]
```

---

# 55. PRODUCT COMPATIBILITY

A product should have compatibility metadata.

Example:

```text
Product:
Coffee Machine

Compatible:
KITCHEN_COUNTER
KITCHEN_APPLIANCE
DISPLAY_SHELF
```

Not:

```text
BATHROOM_WALL
ROOF
FLOOR
```

The admin should be able to override compatibility manually.

---

# 56. AUTO-SUGGEST PLACEMENT

When a shop uploads a product:

```text
Product:
Coffee Machine
```

the system can suggest:

```text
Suggested Slots:

Kitchen Counter 001
Kitchen Counter 004
Kitchen Appliance 002
Featured Product Shelf 003
```

The admin chooses:

```text
[PLACE]
```

This is an excellent future AI/automation feature.

---

# 57. MATERIAL AUTO-SUGGESTION

For:

```text
600×600 ceramic tile
```

suggest:

```text
Kitchen Floor
Bathroom Floor
Bathroom Wall
Patio
Entrance
```

Again, admin chooses the final placement.

Automation should suggest.

Admin should control publication.

---

# 58. ADMIN OVERRIDE PRINCIPLE

Automation should never silently destroy curated content.

Rule:

```text
AUTOMATION = SUGGEST
ADMIN = APPROVE
DATABASE = AUTHORIZE
RENDERER = DISPLAY
```

---

# 59. AUDIT LOGGING

Every important admin operation should create an audit record.

Examples:

```text
Admin changed product
Admin uploaded asset
Admin approved material
Admin published campaign
Admin deleted placement
Shop member changed
Permission changed
```

Audit log:

```text
user_id
action
entity_type
entity_id
before
after
timestamp
ip / request metadata where appropriate
```

Do not silently mutate important commercial data without history.

---

# 60. SOFT DELETE

Do not immediately hard-delete commercial content.

Use:

```text
active
archived
deleted
```

or:

```text
deleted_at
```

for appropriate entities.

This protects against accidental destruction.

---

# 61. VERSION EVERYTHING IMPORTANT

Version:

```text
Products
Assets
Materials
House scenes
Campaigns
Placements
Published scenes
```

This makes the system recoverable.

---

# 62. SHOP WORKFLOW

A shop should experience something simple.

```text
CREATE SHOP
      ↓
ADD PRODUCT
      ↓
UPLOAD IMAGE / 3D MODEL
      ↓
UPLOAD MATERIALS IF APPLICABLE
      ↓
SUBMIT
      ↓
ADMIN REVIEW
      ↓
APPROVED
      ↓
PRODUCT AVAILABLE
      ↓
PLACE IN HOUSE
      ↓
CAMPAIGN
      ↓
PUBLISH
```

The complexity stays behind the scenes.

---

# 63. ADMIN WORKFLOW

Admin sees the full system.

```text
SHOP
 ↓
PRODUCT
 ↓
ASSET
 ↓
MATERIAL
 ↓
COMPATIBILITY
 ↓
SLOT
 ↓
PLACEMENT
 ↓
CAMPAIGN
 ↓
APPROVAL
 ↓
PUBLISH
```

---

# 64. CUSTOMER EXPERIENCE

The customer should see none of the administrative complexity.

They should see:

```text
HOUSE
 ↓
ROOM
 ↓
PRODUCT
 ↓
PRODUCT INFORMATION
 ↓
SHOP
 ↓
ACTION
```

Potential actions:

```text
View product
View shop
Save
Share
Visit shop
Request quote
Buy
```

The 3D environment should remain immersive.

---

# 65. PRODUCT INTERACTION

When the user clicks a product in Three.js:

```text
3D PRODUCT
    ↓
PRODUCT ID
    ↓
PRODUCT PANEL
```

Panel:

```text
Coffee Machine

Brand
Model
Description
Price
Shop

[View Shop]
[View Product]
```

Do not embed commercial information permanently inside the GLB.

The GLB identifies the asset.

The database provides the commercial information.

---

# 66. MATERIAL INTERACTION

If the customer clicks a floor:

```text
FLOOR
 ↓
MATERIAL
 ↓
PRODUCT/MATERIAL INFORMATION
```

Show:

```text
Carrara Marble

Material
Manufacturer
Dimensions
Finish
Shop

[View Supplier]
```

---

# 67. DEEP LINKING

Every important entity should have a URL.

Examples:

```text
/shop/shop-slug
/product/product-slug
/material/material-slug
/campaign/campaign-slug
/house/house-slug
```

This is important for sharing.

---

# 68. SEO

The 3D experience is not enough.

Product pages should have normal HTML content for:

* SEO
* social sharing
* accessibility
* search engines

Three.js should enhance the experience, not become the only representation of information.

---

# 69. ADMIN SHOULD CONTROL WHAT IS PUBLIC

Every major entity needs visibility:

```text
PRIVATE
UNLISTED
PUBLIC
ARCHIVED
```

Campaigns can additionally have:

```text
DRAFT
SCHEDULED
LIVE
ENDED
```

---

# 70. STORAGE ARCHITECTURE

Suggested buckets:

```text
public-assets/
    product-thumbnails/
    material-previews/
    published-scenes/

private-assets/
    source-files/
    original-models/
    original-textures/

processed-assets/
    web-glb/
    optimized-textures/
    previews/

campaign-assets/
    renders/
    videos/
```

Sensitive/source assets should not automatically be public.

Use signed URLs or server-authorized access where appropriate.

---

# 71. SOURCE VS PUBLISHED ASSETS

Separate:

```text
SOURCE
```

from:

```text
PROCESSED
```

and:

```text
PUBLISHED
```

Example:

```text
source/
    sofa_original.blend

processed/
    sofa_web.glb

published/
    sofa_v4.glb
```

---

# 72. BLENDER EXPORT CONTRACT

Every Blender export should contain predictable metadata.

For example:

```text
asset_id
asset_type
version
product_id
material_ids
slot_ids
dimensions
units
```

If Blender can embed custom metadata in the export pipeline, use it.

The backend should still maintain the authoritative database records.

---

# 73. BLENDER → DATABASE SYNC

Do NOT allow arbitrary Blender exports to silently modify production data.

Use:

```text
BLENDER
 ↓
EXPORT PACKAGE
 ↓
IMPORT
 ↓
VALIDATE
 ↓
PREVIEW
 ↓
ADMIN APPROVAL
 ↓
DATABASE UPDATE
 ↓
PUBLISH
```

This protects the production environment.

---

# 74. EXPORT PACKAGE

A product export could look like:

```text
PRODUCT_000123/

    manifest.json

    model/
        product.glb

    textures/
        ...

    preview/
        thumbnail.webp

    source/
        optional-source-files
```

Manifest:

```json
{
  "productId": "PRODUCT_000123",
  "assetVersion": 4,
  "assetType": "product",
  "dimensions": {
    "width": 0.45,
    "height": 0.35,
    "depth": 0.4
  }
}
```

---

# 75. MATERIAL EXPORT PACKAGE

```text
MAT_000123/

    manifest.json

    maps/
        basecolor.webp
        normal.webp
        roughness.webp
        height.webp
        ao.webp

    preview/
        material.webp

    blender/
        material.blend
```

---

# 76. ADMIN CONTENT IMPORTER

Create an admin importer that accepts:

```text
.glb
.gltf
.zip
.blend
.png
.jpg
.jpeg
.webp
.tif
.exr
```

The importer determines what it is.

For example:

```text
Detected:

3D Model
Possible Product

[Create Product]
[Attach To Existing Product]
```

or:

```text
Detected:

PBR Material Package

[Create Material]
[Attach To Existing Material]
```

---

# 77. CONTENT VALIDATION

Every uploaded asset should receive a validation report.

Example:

```text
ASSET VALIDATION

✓ GLB valid
✓ Geometry valid
✓ UVs present
✓ Materials valid
✓ Textures found
✓ Dimensions detected
✓ Thumbnail generated

WARNING:
Texture resolution 8192×8192

WARNING:
Asset contains 1.8M triangles

Recommendation:
Create web-optimized version.
```

---

# 78. THREE.JS QUALITY LEVELS

Support:

```text
LOW
MEDIUM
HIGH
ULTRA
```

The runtime can select:

```text
low-end device → low
desktop → high
powerful device → ultra
```

Do not load maximum-quality assets for everyone.

---

# 79. LAZY LOADING

Do not load the entire house's high-resolution assets at startup.

Load:

```text
House architecture
```

first.

Then:

```text
Visible room
```

Then:

```text
Visible products
```

Then:

```text
Nearby high-resolution assets
```

This will become increasingly important as the number of products grows.

---

# 80. ROOM-BASED STREAMING

The house should be divided logically.

Example:

```text
Kitchen
Living Room
Bedroom 1
Bedroom 2
Bedroom 3
Bedroom 4
Bathroom
Garden
Garage
```

Each room can have an asset manifest.

When the user enters:

```text
Kitchen
```

load the kitchen's detailed assets.

---

# 81. MATERIAL MEMORY MANAGEMENT

Materials can become extremely expensive.

Avoid creating duplicate materials for every object.

Use:

```text
Material Registry
```

Conceptually:

```text
MAT_000123
     ↓
Material instance
     ↓
Object A
Object B
Object C
```

Only create variants when required.

---

# 82. PRODUCT SLOT REGISTRY

Three.js should maintain a runtime registry:

```text
SlotRegistry

slotId
roomId
currentAsset
currentMaterial
visible
```

Example:

```text
SLOT_KITCHEN_001
    ↓
PRODUCT_000123
```

The registry should not become the database.

It is simply the runtime representation.

---

# 83. ADMIN 3D PREVIEW

The admin should have a 3D preview mode.

Example:

```text
[HOUSE PREVIEW]

Room:
Kitchen

Selected Slot:
Kitchen Counter 003

Product:
Coffee Machine

Material:
Black Metal

[Replace]
[Remove]
[Save Draft]
[Publish]
```

This allows admins to curate the house without editing Blender manually.

---

# 84. DO NOT TURN THE WEB APP INTO BLENDER

The web application should NOT attempt to replace Blender.

Use Blender for:

* Complex modeling
* High-end material authoring
* Architectural changes
* Complex lighting
* High-quality renders
* Product cleanup
* Advanced asset creation

Use Three.js for:

* Runtime display
* Product interaction
* Slot resolution
* Camera navigation
* User experience
* Lightweight scene manipulation
* Web presentation

---

# 85. ADMIN 3D EDITING SHOULD BE LIMITED

The web admin can safely support:

```text
move product
rotate product
scale product within limits
hide product
swap product
swap material
change placement
```

But structural modeling should remain in Blender.

Do not attempt to recreate Blender inside the browser.

---

# 86. CAMPAIGN BUILDER

Create an admin campaign builder.

```text
CREATE CAMPAIGN

Name:
Summer Home Collection

Shop:
Example Shop

House:
Main House

Products:
☑ Sofa
☑ Coffee Machine
☑ TV
☑ Lamp

Materials:
☑ Floor Tile
☑ Wall Paint

Placements:
Kitchen
Living Room
Garden

Shots:
Kitchen Hero
Living Hero
Garden Hero

[Save Draft]
[Submit]
```

---

# 87. AUTOMATIC CAMPAIGN VALIDATION

Before publishing:

```text
CAMPAIGN VALIDATION

✓ All products approved
✓ All materials approved
✓ All assets processed
✓ All placements valid
✓ All slots compatible
✓ No missing assets
✓ All required thumbnails exist
✓ Published scene can be generated

READY TO PUBLISH
```

If anything fails:

```text
CANNOT PUBLISH

✗ Product PROD_0042 missing web asset
✗ Material MAT_0091 not approved
✗ Slot KITCHEN_004 incompatible
```

---

# 88. PUBLISHED SCENE GENERATION

Publishing should create:

```text
Published Scene Version
```

Example:

```text
HOUSE_001
VERSION_042
```

Store the exact configuration.

This gives you reproducibility.

---

# 89. ROLLBACK

If a campaign breaks:

```text
CURRENT:
VERSION 42

ROLLBACK:
VERSION 41
```

Never manually reconstruct a previous scene.

---

# 90. ANALYTICS

Track useful interactions.

Examples:

```text
house_view
room_enter
product_view
material_view
product_click
shop_click
campaign_view
camera_shot_view
share
save
```

Do not track everything blindly.

Design an analytics event schema.

---

# 91. COMMERCIAL ANALYTICS

For shops:

```text
Product impressions
Product interactions
Product clicks
Shop visits
Campaign views
Conversion events
Most viewed rooms
Most viewed products
```

This becomes extremely valuable commercially.

You can eventually tell a shop:

> "Your coffee machine appeared in 12,400 house views and received 1,830 product interactions."

That turns the 3D house from a visual gimmick into an advertising platform with measurable value.

---

# 92. ADMIN ANALYTICS

Admin sees:

```text
Total house views
Total product interactions
Top shops
Top products
Top categories
Top campaigns
Most visited rooms
Most interacted materials
```

---

# 93. PRODUCT PERFORMANCE

A product can eventually show:

```text
PRODUCT PERFORMANCE

Views:
18,204

3D Interactions:
4,821

Shop Clicks:
1,103

Campaigns:
6

Best Room:
Kitchen

Best Camera:
Kitchen Counter Hero
```

---

# 94. CONTENT SEARCH

Admin needs global search.

Search:

```text
Coffee Machine
```

and find:

```text
Products
Assets
Materials
Placements
Campaigns
Shops
```

Search should understand IDs, SKU, names and categories.

---

# 95. TAGGING

Products/materials should support tags.

Examples:

```text
modern
luxury
minimal
kitchen
outdoor
budget
premium
ceramic
marble
oak
black
white
```

Tags help compatibility and discovery.

---

# 96. CATEGORY SYSTEM

Categories should be database-driven.

Do not hardcode every category inside React.

Admin should be able to create:

```text
Kitchen
    Appliances
    Countertop Appliances
    Fixtures
    Furniture
    Decor
```

and:

```text
Flooring
    Tile
    Wood
    Vinyl
    Stone
    Carpet
```

---

# 97. SLOT TYPE SYSTEM

Slot types should also be database-driven.

Examples:

```text
KITCHEN_COUNTER_APPLIANCE
LIVING_SOFA
BEDROOM_BED
BATHROOM_VANITY
FLOOR
WALL
CEILING_LIGHT
GARDEN_PLANT
OUTDOOR_FURNITURE
```

This allows the platform to grow without rewriting the entire application.

---

# 98. FUTURE AI AUTOMATION

Design the architecture so AI can eventually do:

```text
Upload product
 ↓
AI identifies product type
 ↓
AI suggests category
 ↓
AI suggests compatible slots
 ↓
AI estimates dimensions
 ↓
AI detects missing information
 ↓
Admin reviews
 ↓
Approve
```

AI should not directly publish production content by default.

---

# 99. FUTURE AUTOMATIC PRODUCT PLACEMENT

Eventually:

```text
SHOP UPLOADS:

Coffee Machine
```

System:

```text
Detected:
Kitchen appliance

Suggested slots:
Kitchen Counter 001
Kitchen Counter 002
Featured Shelf 003

Suggested camera:
Kitchen Appliance Hero
```

Admin:

```text
[ACCEPT]
```

---

# 100. FUTURE AUTOMATIC MATERIAL PROCESSING

Eventually:

```text
Shop uploads:

tile.jpg
```

Pipeline:

```text
AI / processing
 ↓
Identify tile
 ↓
Generate seamless texture
 ↓
Generate PBR maps
 ↓
Estimate physical dimensions
 ↓
Create material
 ↓
Generate preview
 ↓
Suggest material slots
```

Admin approves.

---

# 101. IMPORTANT: AI MUST NOT BECOME THE SOURCE OF TRUTH

AI can:

```text
suggest
classify
generate
normalize
detect
```

But:

```text
DATABASE
```

remains authoritative.

And:

```text
ADMIN
```

controls important publishing decisions.

---

# 102. SECRETS

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
```

or other server secrets in client code.

The browser should only receive credentials intended for browser use.

All privileged operations should go through trusted server-side code.

Supabase explicitly warns that service-role/secret keys bypass RLS and must never be exposed in the frontend. ([Supabase][3])

---

# 103. SERVER ACTIONS / API

Sensitive operations should go through server-side application code.

Examples:

```text
createShop()
approveProduct()
publishCampaign()
processAsset()
generateScene()
assignPlacement()
deleteAsset()
changeUserRole()
```

Do not trust client-supplied:

```text
shop_id
user_role
permission
price
approval_status
```

Validate them server-side.

---

# 104. VALIDATION

Use a central schema-validation strategy.

Every API operation should validate:

```text
authentication
authorization
input schema
ownership
state transition
```

Example:

```text
Can this user edit this product?
```

must be checked before mutation.

---

# 105. STATE TRANSITIONS

Don't allow:

```text
DRAFT → PUBLISHED
```

if approval is required.

Use:

```text
DRAFT
 ↓
SUBMITTED
 ↓
REVIEW
 ↓
APPROVED
 ↓
PUBLISHED
```

The backend enforces this.

---

# 106. DATABASE FUNCTIONS

Use Postgres functions carefully for operations that benefit from transactional integrity.

Examples:

```text
publish_campaign()
create_published_scene()
assign_product_to_slot()
approve_asset()
```

These operations may involve multiple tables and should not leave the database half-updated.

---

# 107. TRANSACTIONS

Publishing should be atomic.

Do not:

```text
update product
then
update campaign
then
update placement
then
hope nothing fails
```

Use a transactional backend operation where appropriate.

---

# 108. CACHING

Public published scenes should be cache-friendly.

The public application should be able to request:

```text
published house scene
```

and receive a stable version.

When the scene changes:

```text
VERSION 42
```

becomes:

```text
VERSION 43
```

This makes caching much easier.

---

# 109. CDN

Large assets should be served from storage/CDN rather than through application server responses.

The Next.js application should provide metadata and URLs.

Three.js downloads the actual optimized assets from storage/CDN.

---

# 110. MOBILE

Do not assume the desktop GPU.

The architecture must support:

```text
Desktop
Laptop
Tablet
Mobile
```

Use quality profiles.

---

# 111. PERFORMANCE BUDGETS

Every asset should have target budgets.

Example:

```text
Web Product:

Triangle target:
< 100k

Preferred:
< 50k

Texture:
1024–2048

Materials:
as few as practical
```

The exact numbers can be adjusted after testing.

The point is to make performance measurable rather than subjective.

---

# 112. HOUSE PERFORMANCE

Do not let the house become:

```text
10 million polygons
500 unique 4K textures
300 materials
```

without optimization.

Create budgets per room.

Example:

```text
Kitchen
Geometry budget
Texture budget
Material budget
Product budget
```

---

# 113. CONTENT LOD

Products should optionally have:

```text
LOD_HIGH
LOD_MEDIUM
LOD_LOW
```

The browser can choose the appropriate asset.

---

# 114. MATERIAL LOD

Likewise:

```text
HIGH:
2048 PBR

MEDIUM:
1024 PBR

LOW:
512 / simplified material
```

---

# 115. ADMIN SYSTEM SETTINGS

Admin should control configurable values without code changes where appropriate.

Examples:

```text
Maximum upload size
Allowed file types
Maximum texture resolution
Default asset quality
Product approval required
Material approval required
Campaign approval required
Default scene quality
```

Do not expose dangerous infrastructure settings.

---

# 116. FEATURE FLAGS

Use feature flags for unfinished functionality.

Example:

```text
AI_PRODUCT_CLASSIFICATION
AUTO_SLOT_SUGGESTIONS
MATERIAL_AI_GENERATION
CAMPAIGN_AUTOMATION
```

This allows development without exposing incomplete features.

---

# 117. ERROR MONITORING

Track:

```text
asset loading failures
missing textures
invalid GLB
database errors
failed publishing
failed processing
Three.js runtime errors
```

Admin should see important failures.

---

# 118. HEALTH DASHBOARD

Admin:

```text
SYSTEM HEALTH

Database:
✓

Storage:
✓

Asset Processor:
✓

Published Scenes:
✓

Three.js Assets:
98% healthy

Broken Assets:
7

Failed Jobs:
2
```

---

# 119. CONTENT HEALTH

Create automated checks.

Example:

```text
HOUSE HEALTH

Slots:
482

Filled:
211

Empty:
271

Broken:
3

Products:
188

Materials:
76

Missing previews:
4

Invalid assets:
1
```

This is very useful for your business.

---

# 120. THE HOUSE IS AN ADVERTISING INVENTORY

This is a major business concept.

Each slot is potentially advertising inventory.

For example:

```text
SLOT_KITCHEN_COUNTER_001
```

can eventually have commercial metadata:

```text
advertising_value
visibility_score
camera_visibility
average_view_time
category
```

Then you can know:

```text
Which slots are valuable?
```

---

# 121. SLOT VISIBILITY SCORE

A slot could have:

```text
visibility_score
```

calculated from:

* How often users see it
* Camera coverage
* Room popularity
* Interaction rate
* Distance from camera

Example:

```text
Kitchen Coffee Machine Slot
Visibility: 92/100
```

---

# 122. ADVERTISING INVENTORY

Eventually shops could choose:

```text
Kitchen Counter Hero
```

rather than simply:

```text
Advertise my product
```

This creates a proper advertising inventory system.

---

# 123. FUTURE COMMERCIAL MODEL

Potential products:

```text
Basic Placement
Premium Placement
Hero Placement
Room Sponsorship
Material Sponsorship
Full Room Takeover
House Sponsorship
Seasonal Campaign
```

The architecture should not hardcode these yet.

But it should be capable of supporting them.

---

# 124. ROOM SPONSORSHIP

A shop could eventually sponsor:

```text
KITCHEN
```

and supply:

```text
Appliances
Countertops
Tiles
Cabinets
Lighting
Decor
```

The entire kitchen becomes a branded experience.

---

# 125. MATERIAL SPONSORSHIP

A flooring company could sponsor:

```text
Kitchen
Living
Hallway
Bedrooms
```

using its flooring products.

One campaign can therefore contain many material placements.

---

# 126. HOUSE TAKEOVER

Eventually:

```text
SHOP
 ↓
HOUSE TAKEOVER
 ↓
All compatible products
 ↓
Full house campaign
```

This is where the architecture becomes commercially powerful.

---

# 127. IMPORTANT DATA RULE

Never duplicate commercial data inside 3D assets unnecessarily.

For example, don't embed:

```text
price = "$500"
```

inside the GLB.

Prices change.

Instead:

```text
GLB
 ↓
product_id
 ↓
DATABASE
 ↓
current product information
```

---

# 128. IMPORTANT ASSET RULE

Likewise, don't make the product's database identity depend on the filename.

Bad:

```text
coffee_machine_final_FINAL2.glb
```

Good:

```text
asset_id = ASSET_000184
```

The filename is implementation detail.

The ID is identity.

---

# 129. IMPORTANT VERSION RULE

Never assume:

```text
product = asset
```

Instead:

```text
Product
   ↓
Asset Version
   ↓
Published Asset
```

This allows the shop to update its model without creating a new product.

---

# 130. ADMIN SHOULD BE ABLE TO REPLACE A PRODUCT WITHOUT REBUILDING THE HOUSE

This is one of the core acceptance criteria.

Example:

```text
SLOT_KITCHEN_COUNTER_001

CURRENT:
Product A

ADMIN:
Replace with Product B

RESULT:
Product B appears in the house.

No Blender rebuild.
No architectural modification.
No manual Three.js coding.
```

---

# 131. ADMIN SHOULD BE ABLE TO REPLACE A MATERIAL WITHOUT REBUILDING THE HOUSE

Same principle:

```text
KITCHEN_FLOOR

CURRENT:
Material A

ADMIN:
Replace with Material B

RESULT:
Entire floor updates.
```

---

# 132. ADMIN SHOULD BE ABLE TO CREATE NEW SLOTS

Within supported slot types, admin should eventually be able to:

```text
Create slot
Assign room
Assign category
Set compatibility
Set transform
Set priority
Save
```

This allows the inventory to grow.

---

# 133. BLENDER REMAINS THE MASTER FOR STRUCTURAL SLOTS

However, structural architectural slots should still originate from Blender.

The web admin should manage:

```text
commercial placement
```

rather than arbitrary architectural modeling.

---

# 134. DATA FLOW

The canonical flow should be:

```text
BLENDER
   ↓
EXPORT
   ↓
ASSET INGESTION
   ↓
SUPABASE STORAGE
   ↓
DATABASE METADATA
   ↓
ADMIN REVIEW
   ↓
PUBLISHED ASSET
   ↓
PUBLISHED SCENE
   ↓
THREE.JS
```

---

# 135. PRODUCT DATA FLOW

```text
SHOP
 ↓
PRODUCT
 ↓
ASSET
 ↓
PROCESSING
 ↓
APPROVAL
 ↓
COMPATIBILITY
 ↓
SLOT
 ↓
PLACEMENT
 ↓
CAMPAIGN
 ↓
PUBLISHED SCENE
 ↓
THREE.JS
```

---

# 136. MATERIAL DATA FLOW

```text
SHOP / ARTIST / SOURCE
 ↓
MATERIAL
 ↓
PBR MAPS
 ↓
PROCESSING
 ↓
VALIDATION
 ↓
APPROVAL
 ↓
MATERIAL SLOT
 ↓
PLACEMENT
 ↓
CAMPAIGN
 ↓
PUBLISHED SCENE
 ↓
THREE.JS
```

---

# 137. DO NOT OVERENGINEER THE FIRST VERSION

Implement the foundation first.

Phase 1:

```text
Auth
Roles
Shops
Products
Assets
Houses
Rooms
Slots
Placements
Published scenes
Three.js loading
```

Phase 2:

```text
Materials
PBR system
Material slots
Asset processing
Admin 3D preview
```

Phase 3:

```text
Campaigns
Advertisements
Analytics
```

Phase 4:

```text
AI suggestions
Automatic asset classification
Automatic material generation
Automatic placement
```

---

# 138. FIRST DATABASE MIGRATION

Claude Code should first produce a proper Supabase migration structure.

Do not manually create random tables through the dashboard.

Use migrations in source control.

Suggested:

```text
supabase/
  migrations/
    001_extensions.sql
    002_profiles.sql
    003_roles_permissions.sql
    004_shops.sql
    005_products.sql
    006_assets.sql
    007_materials.sql
    008_houses_rooms_slots.sql
    009_placements.sql
    010_campaigns.sql
    011_publishing.sql
    012_audit_logs.sql
    013_analytics.sql
    014_rls.sql
```

---

# 139. MIGRATION RULE

Every schema change must be reproducible.

Never make production-only manual changes that aren't represented in migrations.

---

# 140. SEED DATA

Create seed data for development:

```text
Demo Shop
Demo Products
Demo Materials
Demo House
Demo Rooms
Demo Slots
Demo Campaign
Demo Admin
Demo Customer
```

This allows development without manually configuring everything.

---

# 141. TESTING

The project must test:

```text
Authentication
Authorization
RLS
Product ownership
Asset upload
Asset processing
Slot compatibility
Placement
Publishing
Rollback
Three.js loading
Broken asset handling
```

---

# 142. RLS TESTING

Explicitly test:

```text
Customer cannot edit products.

Shop A cannot access Shop B's private data.

Shop member can edit own shop's products.

Shop member cannot edit another shop's products.

Admin can access approved administrative resources.

Public user can only see published content.
```

RLS should be treated as a first-class test target.

---

# 143. ADMIN SECURITY

Administrative actions should require:

```text
authenticated user
+
appropriate permission
+
valid state
+
ownership where applicable
```

Do not trust:

```text
role passed from frontend
```

---

# 144. AUDIT REQUIREMENT

The following actions must be logged:

```text
Role changed
Permission changed
Product approved
Product rejected
Asset published
Asset deleted
Material approved
Campaign published
Placement changed
Shop suspended
Shop restored
```

---

# 145. ADMIN UI DESIGN PRINCIPLE

The admin interface should expose complexity progressively.

Do not show a shop owner:

```text
Postgres IDs
RLS policies
asset processing internals
```

unless necessary.

Admin sees business concepts.

Super-admin can access technical diagnostics.

---

# 146. THREE ADMIN LEVELS

Consider:

```text
BUSINESS ADMIN
```

for normal operations.

```text
CONTENT ADMIN
```

for 3D/material/content management.

```text
SUPER ADMIN
```

for system configuration.

This keeps the interface manageable.

---

# 147. TECHNICAL ADMIN

Super-admin can access:

```text
Asset diagnostics
Processing queue
Storage usage
Broken assets
Database health
System settings
Feature flags
Audit logs
```

---

# 148. DO NOT GIVE EVERY ADMIN FULL POWER

Use least privilege.

For example:

```text
Marketing Admin
```

shouldn't automatically be able to:

```text
delete users
change permissions
modify RLS
```

---

# 149. PUBLIC VS PRIVATE ASSETS

A product may have:

```text
public thumbnail
public web GLB
private original model
private source textures
```

This is normal.

---

# 150. FUTURE MARKETPLACE

Do not build the marketplace now unless required.

But make the data model capable of:

```text
shop
product
listing
campaign
placement
```

Eventually products could be browsed independently from the house.

---

# 151. THE LONG-TERM VISION

The platform eventually becomes:

```text
                 DIGITAL HOME
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
     PRODUCTS      MATERIALS     SERVICES
        │             │             │
        └─────────────┼─────────────┘
                      ↓
                    SHOPS
                      ↓
                  CAMPAIGNS
                      ↓
                 ADVERTISING
                      ↓
                  CUSTOMERS
```

The house is the visual interface.

Supabase is the business/data backbone.

Three.js is the interactive rendering layer.

Blender is the professional content-production pipeline.

Next.js is the application shell and server/application layer.

---

# 152. FINAL ARCHITECTURAL RULES FOR CLAUDE CODE

Claude Code must follow these rules:

1. Do not create a monolithic architecture.

2. Do not put database queries inside Three.js rendering classes.

3. Do not put business rules inside React components.

4. Do not let the client decide whether a user is authorized.

5. Do not expose Supabase service-role credentials to the browser.

6. Use Supabase RLS for database-level authorization.

7. Use roles and permissions rather than hardcoded admin checks.

8. Keep products separate from assets.

9. Keep materials separate from products.

10. Keep slots separate from placements.

11. Keep campaigns separate from products.

12. Keep published scenes separate from draft scenes.

13. Version important assets and published scenes.

14. Never silently overwrite production assets.

15. Use stable IDs everywhere.

16. Blender object names are not authoritative identities.

17. Database IDs are authoritative identities.

18. Three.js consumes published scene data.

19. Three.js must not become the source of truth.

20. Blender must not become the production database.

21. Large binary assets belong in storage/CDN, not database rows.

22. Source assets and web assets must be separated.

23. Admin actions must be auditable.

24. Important content must use explicit state transitions.

25. Automation should suggest; admins approve.

26. Build for hundreds of slots and thousands of products.

27. Use lazy loading and asset caching.

28. Use real-world material dimensions.

29. Make material swapping first-class.

30. Make product swapping first-class.

31. Make compatibility database-driven.

32. Make categories database-driven.

33. Make slot types database-driven.

34. Make roles/permissions database-driven.

35. Keep structural architectural editing in Blender.

36. Keep commercial placement management in the web application.

37. Keep public presentation separate from administration.

38. Make every important entity versionable.

39. Make every important destructive operation reversible where practical.

40. Every production operation must fail safely.

---

# 153. ACCEPTANCE TEST

The architecture is successful when the following can happen WITHOUT editing the house architecture in Blender:

### Test 1 — Product

Admin uploads:

```text
Coffee Machine
```

System:

```text
creates product
creates asset
processes GLB
validates dimensions
suggests kitchen slots
admin chooses slot
product appears in house
```

### Test 2 — Material

Admin uploads:

```text
600×600 tile PBR package
```

System:

```text
creates material
recognizes maps
sets real-world dimensions
generates preview
suggests floor slots
admin selects Kitchen Floor
material appears
```

### Test 3 — Replacement

Admin changes:

```text
Coffee Machine A
```

to:

```text
Coffee Machine B
```

The house updates without Blender.

### Test 4 — Shop isolation

Shop A cannot access or modify Shop B's private products.

### Test 5 — Publishing

A draft campaign cannot appear publicly until approved/published.

### Test 6 — Rollback

Admin can restore a previous published scene version.

### Test 7 — Asset failure

A broken asset cannot silently break the public house.

### Test 8 — Performance

The public house does not download every high-resolution asset immediately.

### Test 9 — Audit

An administrator's important actions appear in the audit log.

### Test 10 — Scale

The system architecture remains usable when there are:

```text
100+ rooms
1,000+ slots
10,000+ products
10,000+ materials/assets
many shops
many campaigns
```

The exact performance limits should be benchmarked rather than assumed.

---

# 154. MOST IMPORTANT FINAL PRINCIPLE

The platform is NOT:

```text
A 3D house website.
```

It is:

```text
A commercial content platform
with a 3D house as its primary visual interface.
```

That distinction should guide every architectural decision.

The house is the stage.

Slots are the inventory.

Products are the commercial objects.

Materials are commercial surfaces.

Shops are the suppliers.

Campaigns are the advertising configurations.

Supabase is the source of business truth.

Next.js is the application layer.

Three.js is the interactive visualization layer.

Blender is the professional content-production layer.

The admin system is the control plane.

The published scene is the bridge between the commercial database and the 3D runtime.

Build those boundaries correctly from the beginning.

[1]: https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac?utm_source=chatgpt.com "Custom Claims & Role-based Access Control (RBAC) | Supabase Docs"
[2]: https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com "Row Level Security | Supabase Docs"
[3]: https://supabase.com/docs/guides/database/secure-data?utm_source=chatgpt.com "Securing your data | Supabase Docs"
