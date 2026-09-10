-- =============================================================================
-- The Grandiose run goes back where it was, and the walk goes round the front
--
-- 0025 retired it because it covered the whole 2,325mm of the dining slider
-- and the character walked out through that door and into it. The owner wants
-- the unit; the answer is therefore the other half of the same problem --
-- change the route, not the furniture.
--
-- IT IS BACK IN EXACTLY THE POSITION 0024 GAVE IT: x 12612, y 2526, turned
-- -90 so its front faces into the room. Nothing about the geometry has been
-- revised, because nothing about it was wrong except what stood in front of
-- it.
--
-- WHAT CHANGED IS WHY THE WALK WAS OUT THERE AT ALL. The tour left by the
-- front door, walked the length of the house outside and came back in through
-- the slider -- which looked like a route preference and was not. The living
-- room was impassable, so the only path from the front door to anywhere was
-- around the outside:
--
--   * The route solver painted EVERY placed product as solid, whatever its
--     height, so the 3.0 x 2.2m jute rug -- sixteen millimetres of it -- was
--     a wall, and padded by the route's 300mm clearance it became 3.6 x 2.8m
--     of blocked floor. That is the living room. Its own centre was inside
--     it. `tour_json` now skips anything under 120mm, which is the rule the
--     browser's collision.js already applied at run time; the two disagreed
--     and the route was solved against a house the walker does not live in.
--   * The media console, the three-seater and the coffee table were padding
--     into each other and closing the last corridor. They have been spaced so
--     the line x = 6650 is clear from the doorway to the north of the room.
--
-- The tour now walks in the front door and stays inside. Not one of its 113
-- waypoints comes within 1.5m of the slider, so the unit standing against it
-- blocks nobody -- which is why this is a route fix and not a compromise.
--
-- THE SLIDER IS STILL BLOCKED, and that is a decision rather than an
-- oversight. A 3.37m run across a terrace door is a real defect in a real
-- house; in a showroom whose visitor never uses that door it is a display.
-- `clearance.test.mjs` still checks every opening and now carries this one
-- pairing as an accepted obstruction, named and reasoned, so the check keeps
-- working for every other door and this cannot spread by silence.
--
-- Run after 0025.
-- =============================================================================

update placement_slots set is_active = true
 where code = 'SLOT_DINING_RUN_001';

-- Put the dining room back among the rooms it may be offered for.
insert into product_room_types (product_id, room_type)
select p.id, 'dining'
  from products p join shops s on s.id = p.shop_id
 where s.slug = 'tubod' and p.slug = 'grandiose-kitchen-unit'
on conflict (product_id, room_type) do nothing;

-- Revive the retired placement if it is still there, rather than making a
-- second one: the row carries its own coordinates and its history.
update placements p set status = 'live'
  from placement_slots sl
 where sl.id = p.slot_id
   and sl.code = 'SLOT_DINING_RUN_001'
   and p.status = 'removed'
   and not exists (
     select 1 from placements x
      where x.slot_id = sl.id and x.status = 'live'
   );

-- And create one if 0025 was applied to a database that never had it.
insert into placements (scene_id, slot_id, variant_id, shop_id, status, note)
select sc.id, sl.id, v.id, p.shop_id, 'live',
       'Uploaded model. Dining room east wall. It covers the slider; the '
       'tour comes in by the front door and never uses that opening.'
  from scenes sc
  join placement_slots sl on sl.scene_id = sc.id
                         and sl.code = 'SLOT_DINING_RUN_001'
  join products p on p.slug = 'grandiose-kitchen-unit'
  join shops s on s.id = p.shop_id and s.slug = 'tubod'
  join product_variants v on v.product_id = p.id and v.slug = 'default'
 where sc.slug = '3bed'
   and not exists (
     select 1 from placements x
      where x.slot_id = sl.id and x.status = 'live'
   );
