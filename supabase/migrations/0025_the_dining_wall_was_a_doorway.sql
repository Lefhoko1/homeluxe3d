-- =============================================================================
-- The dining room's east wall is not a wall
--
-- 0024 stood the Grandiose run along it, "the only side of that room long
-- enough (4000mm)", and said about 1120mm of the unit would cover part of a
-- window. That was wrong, and it was reported by somebody watching the tour:
-- the character walked out through the sliding door and into the unit.
--
-- What is actually on that wall, read from doors.json and collision.json
-- rather than from the last migration's description of them:
--
--   ext.east pier      y  230 .. 1000     770mm
--   dining.slider      y 1596 .. 3921    2325mm  <- the way out to the pool
--   ext.east pier      y 3400 .. 4230     830mm
--
-- It is not a window. It is the house's main opening onto the terrace, the
-- one the tour leaves by, and the unit covered 2325mm of a 2325mm aperture --
-- all of it. Not most of it: all of it.
--
-- So the dining room has no wall for this either. Its south side is 2820mm
-- and carries a window; its north and west sides are open to the hall and the
-- living room. The longest solid run on the east side is 830mm.
--
-- The placement and its slot are retired, exactly as 0023 retired the kitchen
-- pair and for the same reason. The product, its variant and its model stay
-- in the catalogue: Tubod sells it whether or not this house has a wall for
-- it. What is left is the finding, which has not changed since 0023 -- the
-- Grandiose needs 1,950mm of full-height backing with 1,380mm of anything
-- beyond it, and no room in this plan offers that today.
--
-- WHY NOTHING CAUGHT IT. The waypoint check passed, because the route is
-- solved around the walls and no waypoint sits in a doorway. `doors.test.mjs`
-- passed, because it tests the door -- that the slider opens in time and that
-- its aperture is wider than a walker -- and a door knows nothing about what
-- has been parked in front of it. Nothing compared the two.
-- `clearance.test.mjs` now does, for every hinged leaf and every sash, and it
-- was verified against this exact placement before this migration ran.
--
-- Run after 0024.
-- =============================================================================

update placements set status = 'removed'
 where slot_id = (select id from placement_slots
                   where code = 'SLOT_DINING_RUN_001')
   and status = 'live';

update placement_slots set is_active = false
 where code = 'SLOT_DINING_RUN_001';

-- The dining room is no longer a room this product may be offered for. It was
-- added in 0024 on the strength of that wall; the wall is a doorway, so the
-- offer goes with it. The kitchen entry from 0023 stays: that is still where
-- it belongs the day the kitchen has a run long enough.
delete from product_room_types
 where room_type = 'dining'
   and product_id = (
     select p.id from products p
       join shops s on s.id = p.shop_id
      where s.slug = 'tubod' and p.slug = 'grandiose-kitchen-unit'
   );
