import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { ELEVATIONS, elevationView } from '../../../lib/narration/elevationView.js';
import { standalonePiece } from './standalone.js';

/**
 * Every side of a product, close up: "View all sides".
 *
 * In the house a piece is seen where it stands -- against a wall, beside the
 * coffee table, on a screen held upright. Here it is on its own: turning
 * slowly, framed whole for this screen, and the visitor can drag it round,
 * pinch or scroll to come closer, jump to any side, or look at the shop's
 * photographs instead.
 *
 * NOTHING IS DOWNLOADED. The piece is a copy of the one already standing in
 * the house -- sharing its geometry and materials -- so it opens at once,
 * even on a slow connection. (The glossy outline the house draws round it is
 * left behind.)
 *
 * @param {object} props
 * @param {THREE.Object3D} props.object  the placed piece, from the house
 * @param {object}   props.advert        name, shop, price, photos
 * @param {Function} props.onClose
 * @param {Function} [props.onReplay]    show it again on the tour
 */

const SIDES = ELEVATIONS.filter((e) => e.id !== 'detail').map((e) => ({
  ...e,
  label: e.id === 'top' ? 'Above' : e.label.replace(' side', ''),
}));

/** Degrees per second the piece turns by itself until touched. */
const SPIN = 14;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;

const money = (amount, currency = 'BWP') => {
  if (amount == null || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return `${currency === 'BWP' || !currency ? 'P' : currency} ${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
};

const ProductViewer = ({ object, advert = {}, onClose, onReplay = null }) => {
  const holderRef = useRef(null);
  const kitRef = useRef(null);
  const photos = useMemo(() => (advert?.media?.length ? advert.media : advert?.thumbnail ? [advert.thumbnail] : []), [advert]);
  const [tab, setTab] = useState('3d');
  const [photo, setPhoto] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [side, setSide] = useState('front');

  // ---- The 3D view ---------------------------------------------------------
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !object || tab !== '3d') return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    holder.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2.5, 5, -3.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-3, 2, 3);
    scene.add(fill);

    const piece = standalonePiece(object);
    scene.add(piece);
    const box = new THREE.Box3().setFromObject(piece);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);

    const kit = {
      yaw: 0, pitch: 14, zoom: 1,
      wantYaw: 0, wantPitch: 14,
      spinning: true, dragging: null, pinch: null, raf: 0, last: performance.now(),
    };
    kitRef.current = kit;

    const resize = () => {
      const { width, height } = holder.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const watch = new ResizeObserver(resize);
    watch.observe(holder);
    resize();

    const tick = (now) => {
      kit.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - kit.last) / 1000);
      kit.last = now;
      if (kit.spinning && !kit.dragging) kit.wantYaw += SPIN * dt;
      kit.yaw += (kit.wantYaw - kit.yaw) * Math.min(1, dt * 6);
      kit.pitch += (kit.wantPitch - kit.pitch) * Math.min(1, dt * 6);
      // Framed whole for this screen's shape, every frame -- see elevationView.
      const view = elevationView(
        { box, front: new THREE.Vector3(0, 0, -1) },
        { yaw: kit.yaw, pitch: kit.pitch },
        { fov: camera.fov, aspect: camera.aspect }
      );
      const dir = view.eye.clone().sub(view.target);
      camera.position.copy(view.target).addScaledVector(dir, kit.zoom);
      camera.near = Math.max(0.005, view.distance * kit.zoom / 200);
      camera.far = view.distance * 10;
      camera.updateProjectionMatrix();
      camera.lookAt(view.target);
      renderer.render(scene, camera);
    };
    kit.raf = requestAnimationFrame(tick);

    // ---- Drag to turn, pinch or wheel to come closer ----------------------
    const pointers = new Map();
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    const stopSpin = () => { kit.spinning = false; setSpinning(false); };
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture?.(e.pointerId);
      stopSpin();
      if (pointers.size === 1) kit.dragging = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        kit.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: kit.zoom };
        kit.dragging = null;
      }
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (kit.pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        kit.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, kit.pinch.zoom * (kit.pinch.d / Math.max(d, 1))));
      } else if (kit.dragging) {
        kit.wantYaw -= (e.clientX - kit.dragging.x) * 0.45;
        kit.wantPitch = Math.min(75, Math.max(0, kit.wantPitch + (e.clientY - kit.dragging.y) * 0.3));
        kit.dragging = { x: e.clientX, y: e.clientY };
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) kit.pinch = null;
      if (!pointers.size) kit.dragging = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      stopSpin();
      kit.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, kit.zoom * (1 + Math.sign(e.deltaY) * 0.1)));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(kit.raf);
      watch.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      // The copy shares the house's geometry and materials: only the
      // renderer is this view's to dispose.
      renderer.dispose();
      canvas.remove();
      kitRef.current = null;
    };
  }, [object, tab]);

  // Escape closes, like any dialog.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goTo = (id) => {
    const kit = kitRef.current;
    const spec = SIDES.find((s) => s.id === id);
    setSide(id);
    if (!kit || !spec) return;
    kit.spinning = false;
    setSpinning(false);
    // The shortest way round to that side.
    const current = ((kit.wantYaw % 360) + 360) % 360;
    let delta = (((spec.yaw - current) % 360) + 540) % 360 - 180;
    kit.wantYaw += delta;
    kit.wantPitch = spec.pitch;
    kit.zoom = 1;
  };

  const toggleSpin = () => {
    const kit = kitRef.current;
    const next = !spinning;
    setSpinning(next);
    if (kit) kit.spinning = next;
  };

  const price = money(advert?.effectivePrice ?? advert?.price, advert?.currency);

  return (
    <div className="pv-backdrop" onClick={onClose}>
      <div className="pv" role="dialog" aria-modal="true" aria-label={`${advert?.name ?? 'Product'}: all sides`} onClick={(e) => e.stopPropagation()}>
        <div className="pv-head">
          <div className="pv-title">
            <strong>{advert?.name ?? 'Product'}</strong>
            <span>{[advert?.shopName ?? advert?.shop, price].filter(Boolean).join(' · ')}</span>
          </div>
          <button type="button" className="pv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === '3d'} className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}>All sides</button>
          {photos.length > 0 && (
            <button type="button" role="tab" aria-selected={tab === 'photos'} className={tab === 'photos' ? 'on' : ''} onClick={() => setTab('photos')}>
              Photos ({photos.length})
            </button>
          )}
        </div>

        {tab === '3d' ? (
          <>
            <div className="pv-stage" ref={holderRef}>
              <div className="pv-hint">Drag to turn · pinch or scroll to zoom</div>
            </div>
            <div className="pv-sides" role="group" aria-label="Show a side">
              {SIDES.map((s) => (
                <button key={s.id} type="button" className={!spinning && side === s.id ? 'on' : ''} onClick={() => goTo(s.id)}>
                  {s.label}
                </button>
              ))}
              <button type="button" className={`pv-spin${spinning ? ' on' : ''}`} onClick={toggleSpin} aria-pressed={spinning}>
                {spinning ? '❚❚ Stop turning' : '⟳ Turn'}
              </button>
            </div>
          </>
        ) : (
          <div className="pv-photos">
            <img className="pv-photo" src={photos[photo]} alt={`${advert?.name ?? 'Product'}, photo ${photo + 1}`} />
            {photos.length > 1 && (
              <div className="pv-thumbs">
                {photos.map((url, i) => (
                  <button key={url} type="button" className={i === photo ? 'on' : ''} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}>
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {onReplay && (
          <div className="pv-foot">
            <button type="button" className="pv-replay" onClick={() => { onReplay(); onClose?.(); }}>
              ↺ Show it again in the house
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductViewer;
