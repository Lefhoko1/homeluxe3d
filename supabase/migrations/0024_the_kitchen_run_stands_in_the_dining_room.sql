-- =============================================================================
-- The Grandiose run, stood up where there is room for it
--
-- 0023 put this product in the database and then retired its placement,
-- because a 3367mm object has nowhere to stand in a 4290 x 3130 kitchen whose
-- south side is a 2400mm doorway and whose longest backed wall is 3135mm. That
-- measurement has not changed and the kitchen slot stays retired.
--
-- This stands it in the DINING ROOM instead, so it can be looked at while the
-- kitchen's walls are decided. That is what this migration is: a viewing, not
-- a resolution.
--
-- WHAT THE DINING ROOM ACTUALLY IS -- measured from collision.json, not
-- assumed, because three placements have already been lost to assuming:
--
--   room            x 10150..12970   y 230..4230      2820 x 4000
--   south wall      2820mm, and it carries a 2400mm window sill
--   east wall       4000mm, piers y 4230..3400 and y 1000..230,
--                   so a 2400mm window between them
--   north, west     open -- the living/dining is open-plan, which is the
--                   same reason the Juliet stand ended up in bedroom 2
--
-- The east wall is the only side long enough. The unit runs along it.
--
-- IT COVERS PART OF THE WINDOW, and that is stated rather than hidden. The
-- full-height section is 1950mm (pantry 630 + upper cupboard 1320) and the
-- longest solid stretch of that wall is 830mm, so about 1120mm of tall
-- carcass stands in front of glass. The remaining 1380mm is counter height
-- under a worktop, which is what a kitchen window is for. No arrangement of
-- this unit in this house avoids that; only a plan change does.
--
-- Run after 0023.
-- =============================================================================

-- A dining room is now a room it may be offered for. The kitchen entry stays:
-- this widens where it MAY stand, it does not move the product.
insert into product_room_types (product_id, room_type)
select p.id, 'dining'
  from products p join shops s on s.id = p.shop_id
 where s.slug = 'tubod' and p.slug = 'grandiose-kitchen-unit'
on conflict (product_id, room_type) do nothing;

-- =============================================================================
-- WHERE IT STANDS, AND WHY THOSE NUMBERS
--
-- x 12612mm  -- back 20mm off the east plaster at 12970, less half of 676mm
--               of depth. The front face lands at 12274mm and the nearest
--               solved waypoint is at 11810mm, so 464mm of gap against the
--               260mm the walker needs. `clearance.test.mjs` checks this
--               against the live row rather than against this comment.
-- y 2526mm   -- the 3367mm run laid along the wall's 4000mm, 20mm off the far
--               end at 4230, spanning y 843..4210.
-- rot -90    -- THE MODEL FACES +Z IN ITS OWN FRAME (backsplash at z 0.02,
--               handles at z 0.65). A quarter turn anticlockwise points that
--               front at -x, which is into the room. The same turn sends the
--               model's -x end -- the full-height pantry -- to the high-y end
--               of the wall, which is where the 830mm of solid pier is. The
--               tall end therefore gets what backing exists and the counter
--               end takes the window.
--
-- ORIGIN 'derived', as in 0023: this slot came from a product, not from the
-- plan, and the drift check counts Blender-authored slots on both sides.
-- =============================================================================

insert into placement_slots (
  scene_id, room_id, code, label, category_code, kind, room_type,
  x_mm, y_mm, z_mm, rotation_deg,
  max_width_mm, max_depth_mm, max_height_mm, is_active, origin
)
select sc.id, rm.id, 'SLOT_DINING_RUN_001', 'Dining wall run', 'kitchen_unit',
       'object', 'dining',
       12612.0, 2526.0, 0.0, -90.0,
       3400.0, 700.0, 2100.0, true, 'derived'
  from scenes sc join rooms rm on rm.scene_id = sc.id
 where sc.slug = '3bed' and rm.code = 'dining'
on conflict (scene_id, code) do update set
  x_mm = excluded.x_mm, y_mm = excluded.y_mm, z_mm = excluded.z_mm,
  rotation_deg = excluded.rotation_deg,
  max_width_mm = excluded.max_width_mm, is_active = true;

insert into placements (scene_id, slot_id, variant_id, shop_id, status, note)
select sc.id, sl.id, v.id, p.shop_id, 'live',
       'Uploaded model. Along the dining room east wall, tall end to the '
       'solid pier, counter end past the window. Temporary: the kitchen has '
       'no wall long enough and this is here to be looked at.'
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

-- The kitchen slot from 0023 stays retired. It is not superseded -- it is the
-- position this unit should eventually occupy, and it is inactive because the
-- room cannot hold it yet, which is still true.
