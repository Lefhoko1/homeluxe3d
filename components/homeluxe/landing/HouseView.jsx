import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  loadHouse,
  disposeHouse,
  getDracoLoader,
  disposeDracoLoader,
  createHouseMaterials,
  disposeHouseMaterials,
} from '../house';
import { applyFinishes } from '../house/textures/finishOverrides';
import {
  applyDatabaseMaterials,
  loadMaterialFinishes,
} from '../house/textures/databaseMaterials';
import { loadProducts, disposeProducts } from '../products/ProductLoader';
import { createLighting } from '../lighting/Lighting';
import { getSupabase } from '../../../lib/supabase/client';
import { NEAR_CLIP } from './showcaseData';

/**
 * The showroom, on the front page, from inside the house.
 *
 * NOT A TURNTABLE. The first version of this stood one product on a stand
 * against a blank ground, which is a product shot -- the exact thing this
 * business exists to be an alternative to. The whole argument of the house is
 * that a bed means something different in a bedroom, against a wall, beside a
 * wardrobe, at the size a bedroom makes it look. Putting that bed on a white
 * turntable to advertise the house argues the other side.
 *
 * So the camera stands INSIDE the room, at eye height, looking at the thing.
 * It is the same house, loaded by the same `loadHouse`, dressed with the same
 * placed finishes, furnished by the same `loadProducts` -- everything in the
 * room around the advert is there because it is there in the showroom, not
 * because it was arranged for a photograph.
 *
 * WHAT IT LOOKS AT IS A DATABASE DECISION. `v_landing_showcase` is the few
 * placements an admin has ranked, in their order, and it is read live. There
 * is no product named anywhere in this file.
 *
 * ALMOST NO CONTROLS. This is a section of a marketing page that somebody is
 * reading, not an application they have opened: a toolbar over it would ask
 * them to operate the thing they are still deciding whether to want. It turns
 * slowly by itself, it can be dragged, and if an admin has ranked more than
 * one advert there are dots. That is all.
 */

/**
 * Aim at the thing itself, rather than at where the data says it stands.
 *
 * The room-rectangle viewpoint gets the camera into the right room facing the
 * right way, which is all it can do from coordinates alone -- a placement is a
 * POINT, and a bed is two metres of object hanging off that point in whatever
 * direction it was rotated. Framing from the point alone put the bed at the
 * bottom edge of the picture with a wall filling the rest.
 *
 * So once the model is actually in the scene, its real bounding box decides:
 * look at the middle of the object, and stand far enough back for its largest
 * dimension to fit the frame. Position still comes from the room -- the box
 * says how far, the room says which way and how far is allowed.
 */
function aim(group, card, camera, fallback, offset) {
  if (!card?.placementId) return fallback;

  let found = null;

  group.traverse((child) => {
    if (!found && child.userData?.placementId === card.placementId) found = child;
  });

  if (!found) return fallback;

  const box = new THREE.Box3().setFromObject(found);

  if (box.isEmpty()) return fallback;

  const size = box.getSize(new THREE.Vector3());
  const target = box.getCenter(new THREE.Vector3());

  // How far back the object needs the camera to be for its largest dimension
  // to fit the frame, with a little air around it.
  const reach = Math.max(size.x, size.y, size.z);
  const ideal = (reach * 0.78) / Math.tan((camera.fov * Math.PI) / 360);

  // WHICH WAY TO BACK OFF: towards the furthest corner of the room, not
  // straight back from the object. Furniture stands against a wall, so the
  // straight-back direction runs out of floor in about two metres and the
  // clamp then plants the camera with its back against the opposite wall,
  // too close, cropping the bed. The diagonal is the longest line in a
  // rectangle and is the direction an interior photograph is taken from.
  if (!fallback.rect) return { eye: fallback.eye, target, rect: null };

  const [x0, z0, x1, z1] = fallback.rect;
  const margin = 0.42;
  const corners = [
    [x0 + margin, z0 + margin],
    [x1 - margin, z0 + margin],
    [x0 + margin, z1 - margin],
    [x1 - margin, z1 - margin],
  ].map(([cx, cz]) => new THREE.Vector3(cx + offset.x, 0, cz + offset.z));

  let best = corners[0];
  let bestGap = -1;

  for (const corner of corners) {
    const gap = Math.hypot(corner.x - target.x, corner.z - target.z);

    if (gap > bestGap) {
      bestGap = gap;
      best = corner;
    }
  }

  const away = best.clone().setY(target.y).sub(target).setY(0);

  if (away.lengthSq() < 0.01) return { eye: fallback.eye, target, rect: fallback.rect };
  away.normalize();

  // Take the ideal distance if the room has it, and the corner if it does not.
  const eye = target.clone().addScaledVector(away, Math.min(ideal, bestGap));

  // Standing height, looking slightly down at it -- but never below the top
  // of the object, which would be lying on the floor beside a bed.
  eye.y = Math.min(EYE_LIMIT, Math.max(box.max.y + 0.45, 1.25));

  return { eye, target, rect: fallback.rect };
}

/** Nobody looks at a bed from above shoulder height while standing in a room. */
const EYE_LIMIT = 1.72;

/** What the wait is actually waiting for. A blank box for eight seconds
    looks broken; "Furnishing the rooms…" looks like work. */
const OPENING = {
  starting: 'Opening the house…',
  house: 'Building the house…',
  products: 'Furnishing the rooms…',
  finishes: 'Painting and tiling…',
  textures: 'Painting and tiling…',
  ready: null,
};

const HouseView = ({ featured = [], index = 0, onIndexChange }) => {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);

  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState('starting');

  const current = featured[index] ?? null;

  // ---- do not boot a 3D engine nobody has looked at -----------------------

  useEffect(() => {
    const holder = holderRef.current;

    if (!holder) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setLive(true);

      return undefined;
    }

    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          watch.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    watch.observe(holder);

    return () => watch.disconnect();
  }, []);

  // ---- the house ----------------------------------------------------------
  //
  // Built ONCE and kept. Moving to the next advert moves the camera; it does
  // not reload eight hundred kilobytes of building.

  useEffect(() => {
    if (!live || !canvasRef.current || !featured.length) return undefined;

    const canvas = canvasRef.current;
    const holder = holderRef.current;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();

    // Not the showroom's sky dome and backdrop: from inside a room you see a
    // metre of it through one window, and it costs a 2048px gradient to get
    // there. A flat warm ground behind the glass reads as daylight.
    scene.background = new THREE.Color(0xdfe6ec);

    const camera = new THREE.PerspectiveCamera(52, 1, NEAR_CLIP, 220);

    const lighting = createLighting({
      sunDirection: new THREE.Vector3(0.55, 0.62, 0.36).normalize(),
    });

    scene.add(lighting.group ?? lighting);

    const kit = {
      house: null,
      products: null,
      materials: null,
      raf: 0,
      disposed: false,
      // Where the camera is going, and where it is now. Every move is eased
      // rather than cut: a jump between two adverts reads as a glitch.
      eye: new THREE.Vector3(),
      target: new THREE.Vector3(),
      swing: 0,
      dragging: false,
      lastX: 0,
      velocity: 0,
    };

    sceneRef.current = { camera, kit };

    const resize = () => {
      const { width, height } = holder.getBoundingClientRect();

      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const sizeWatch = new ResizeObserver(resize);

    sizeWatch.observe(holder);
    resize();

    let cancelled = false;

    (async () => {
      try {
        const materials = createHouseMaterials();

        kit.materials = materials;

        setStage('house');
        const { house } = await loadHouse({ materials, includeSite: false });

        if (cancelled || kit.disposed) {
          disposeHouse(house);

          return;
        }

        scene.add(house);
        kit.house = house;

        setStage('products');
        const { group, placed } = await loadProducts({
          house: '3bed',
          materials,
          dracoLoader: getDracoLoader(),
        });

        if (cancelled || kit.disposed) {
          disposeProducts(group);

          return;
        }

        house.add(group);
        kit.products = group;

        // THE PAINT AND THE TILE, exactly as the showroom applies them. Skip
        // this and the front page shows white plaster in rooms the showroom
        // shows in Gamazine -- the same house, advertised two ways.
        const finishSpecs = (placed ?? [])
          .filter((p) => p.isFinish && p.surface)
          .map((p) => {
            const variant = (p.product?.variants ?? []).find((v) => v.slug === p.variant);

            return {
              surface: p.surface,
              category: p.product?.category,
              material: variant?.material ?? p.product?.material ?? p.surface,
              texture: variant?.texture ?? p.product?.texture,
              swatch: variant?.swatch ?? p.product?.swatch,
              tileMm: p.product?.dimensions?.width,
              product: p.product,
              room: p.room,
              variantName: variant?.name,
            };
          });

        setStage('finishes');
        applyFinishes(
          [house.userData.parts?.floors, house.userData.parts?.wall_finishes],
          finishSpecs,
          { anisotropy: renderer.capabilities.getMaxAnisotropy() },
        );

        try {
          const supabase = getSupabase();
          setStage('textures');
          const finishes = await loadMaterialFinishes(supabase);

          applyDatabaseMaterials([house], finishes, {
            publicUrl: (path) =>
              supabase.storage.from('material-maps').getPublicUrl(path).data.publicUrl,
            anisotropy: renderer.capabilities.getMaxAnisotropy(),
          });
        } catch {
          // An uploaded texture that will not load is not worth an empty
          // front page; the procedural one underneath is already correct.
        }

        setStage('ready');
        setReady(true);
      } catch (err) {
        if (!cancelled) setFailed(err.message);
      }
    })();

    // ---- dragging turns the view, it does not walk --------------------------

    const down = (e) => {
      kit.dragging = true;
      kit.lastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!kit.dragging) return;
      kit.velocity = (e.clientX - kit.lastX) * 0.004;
      kit.swing += kit.velocity;
      kit.lastX = e.clientX;
    };
    const up = (e) => {
      kit.dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const swung = new THREE.Vector3();

    const tick = () => {
      kit.raf = requestAnimationFrame(tick);

      if (!kit.dragging) {
        if (Math.abs(kit.velocity) > 0.0002) {
          kit.swing += kit.velocity;
          kit.velocity *= 0.93;
        } else if (!still) {
          // A drift, not an orbit. Slow enough that it reads as the room
          // breathing rather than as a carousel.
          kit.swing += 0.00045;
        }
      }

      // The eye, swung a little round whatever it is looking at.
      //
      // A CUT BETWEEN ADVERTS, NOT A GLIDE. Easing the camera from a bedroom
      // to the living room walks it straight through the wall between them,
      // and for as long as the flight lasts the visitor is looking at the
      // back of a wall with the sofa peeking out below it. That is a second
      // or so on a real machine and much longer on a slow one, and there is
      // nothing to be gained by it: these are two photographs of two rooms,
      // and photographs cut.
      swung.copy(kit.eye).sub(kit.target);
      swung.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(kit.swing) * 0.32);
      swung.add(kit.target);

      camera.position.copy(swung);
      camera.lookAt(kit.target);

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      cancelled = true;
      kit.disposed = true;
      cancelAnimationFrame(kit.raf);
      sizeWatch.disconnect();

      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);

      if (kit.products) disposeProducts(kit.products);
      if (kit.house) disposeHouse(kit.house);
      if (kit.materials) disposeHouseMaterials(kit.materials);
      disposeDracoLoader();
      renderer.dispose();
      sceneRef.current = null;
    };
    // The house is built once. `featured.length` only gates the very first
    // build -- which advert is being looked at is the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, featured.length]);

  // ---- move to whichever advert is showing --------------------------------

  useEffect(() => {
    const held = sceneRef.current;

    // WAIT FOR THE HOUSE. Without this the first run lands before `loadHouse`
    // has returned, the offset below is zero, and the camera is planted a
    // whole house-width away from the room -- then eased back through every
    // wall in between when the correct position arrives.
    if (!held || !current?.view || !held.kit.house) return;

    const { kit, camera } = held;
    const offset = kit.house.position;

    const fallback = {
      eye: new THREE.Vector3().fromArray(current.view.eye).add(offset),
      target: new THREE.Vector3().fromArray(current.view.target).add(offset),
      rect: current.rect,
    };

    const shot = kit.products
      ? aim(kit.products, current, camera, fallback, offset)
      : fallback;

    // Back inside the walls. `aim` works from a bounding box and knows
    // nothing about the room, so a wide sofa can push the camera through the
    // wall behind it before this puts it back.
    if (shot.rect) {
      const [x0, z0, x1, z1] = shot.rect;
      const margin = 0.42;

      shot.eye.x = Math.min(Math.max(shot.eye.x, x0 + offset.x + margin), x1 + offset.x - margin);
      shot.eye.z = Math.min(Math.max(shot.eye.z, z0 + offset.z + margin), z1 + offset.z - margin);
    }

    kit.eye.copy(shot.eye);
    kit.target.copy(shot.target);
    // Start the new room square-on rather than part-way through the drift.
    kit.swing = 0;
    kit.velocity = 0;
  }, [current, ready]);

  return (
    <div ref={holderRef} className="lp-house">
      <canvas ref={canvasRef} className="lp-house-canvas" />

      {failed && <p className="lp-house-note bad">The house could not be loaded: {failed}</p>}
      {!failed && !ready && <p className="lp-house-note">{OPENING[stage] ?? 'Opening the house…'}</p>}

      {ready && current && (
        <>
          {/* The advert, the way the showroom shows one: what it is, whose
              it is, what it costs. */}
          <figcaption className="lp-house-card">
            <span className="lp-house-shop">
              {current.shopName}
              {current.room && <span> · {current.room}</span>}
            </span>
            <strong className="lp-house-name">{current.name}</strong>
            {current.priceLabel && (
              <span className="lp-house-price">{current.priceLabel}</span>
            )}
            <a
              className="lp-house-link"
              href={`/showroom?product=${encodeURIComponent(current.id)}`}
            >
              Walk to it →
            </a>
          </figcaption>

          {featured.length > 1 && (
            <div className="lp-house-dots" role="tablist" aria-label="Featured products">
              {featured.map((item, at) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={at === index}
                  aria-label={item.name}
                  className={`lp-house-dot${at === index ? ' on' : ''}`}
                  onClick={() => onIndexChange?.(at)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HouseView;
