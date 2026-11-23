import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { elevationView } from '../../../lib/narration/elevationView.js';
import { standalonePiece } from '../tour/standalone.js';

/**
 * The product itself, turning, as the first slide of the details card's
 * gallery (ProductPanel).
 *
 * It turns by itself until touched; drag turns it, pinch or scroll brings it
 * closer, and the button stops or restarts the turning. Framed whole for the
 * slide's shape at every angle (lib/narration/elevationView).
 *
 * NOTHING IS DOWNLOADED: it is a copy of the piece already standing in the
 * house, sharing its geometry and materials (tour/standalone.js). Only drawn
 * while its slide is showing -- a second WebGL view running behind a photo
 * would cost a phone for nothing.
 *
 * @param {object} props
 * @param {THREE.Object3D} props.object  the placed piece, from the house
 * @param {boolean} props.active         its slide is the one showing
 */

/** Degrees per second it turns by itself. */
const SPIN = 16;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;

const ModelSlide = ({ object, active = true }) => {
  const holderRef = useRef(null);
  const kitRef = useRef(null);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !object || !active) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    holder.prepend(renderer.domElement);

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
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.01, 200);

    const kit = {
      yaw: 20, pitch: 14, zoom: 1, wantYaw: 20, wantPitch: 14,
      spinning: kitRef.current?.spinning ?? true,
      dragging: null, pinch: null, raf: 0, last: performance.now(),
    };
    kitRef.current = kit;
    setSpinning(kit.spinning);

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
      const view = elevationView(
        { box, front: new THREE.Vector3(0, 0, -1) },
        { yaw: kit.yaw, pitch: kit.pitch },
        { fov: camera.fov, aspect: camera.aspect }
      );
      const dir = view.eye.clone().sub(view.target);
      camera.position.copy(view.target).addScaledVector(dir, kit.zoom);
      camera.near = Math.max(0.005, (view.distance * kit.zoom) / 200);
      camera.far = view.distance * 10;
      camera.updateProjectionMatrix();
      camera.lookAt(view.target);
      renderer.render(scene, camera);
    };
    kit.raf = requestAnimationFrame(tick);

    // Drag to turn; pinch or wheel to come closer. A HORIZONTAL drag turns
    // the piece; the gallery's own swipe is left to the photo slides.
    const pointers = new Map();
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    const stopSpin = () => { kit.spinning = false; setSpinning(false); };
    const onDown = (e) => {
      e.stopPropagation();
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
      // renderer is this slide's to dispose.
      renderer.dispose();
      canvas.remove();
    };
  }, [object, active]);

  const toggleSpin = () => {
    const kit = kitRef.current;
    const next = !spinning;
    setSpinning(next);
    if (kit) kit.spinning = next;
  };

  return (
    <div className="model-slide" ref={holderRef}>
      <span className="model-slide-badge">3D</span>
      <button
        type="button"
        className={`model-slide-spin${spinning ? ' on' : ''}`}
        onClick={toggleSpin}
        aria-pressed={spinning}
        aria-label={spinning ? 'Stop turning' : 'Turn it round'}
        title={spinning ? 'Stop turning' : 'Turn it round'}
      >
        {spinning ? '❚❚' : '⟳'}
      </button>
      <span className="model-slide-hint">Drag to turn · pinch to zoom</span>
    </div>
  );
};

export default ModelSlide;
