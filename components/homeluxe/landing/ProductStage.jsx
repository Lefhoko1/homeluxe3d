import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three-stdlib';

import { loadOneProduct, disposeProducts } from '../products/ProductLoader';

/**
 * One product, turning, on the front page.
 *
 * A STILL WOULD HAVE BEEN CHEAPER AND WOULD HAVE SOLD NOTHING. The whole
 * claim of this business is that furniture should be seen as an object at its
 * own size rather than as a photograph on a white background -- so a
 * photograph on a white background is the one thing the front page must not
 * use to make that claim. This is the actual .glb the house is furnished
 * with, loaded by the same code the showroom uses, so what somebody turns
 * here is exactly what they walk up to in the bedroom.
 *
 * IT DOES NOT BOOT UNTIL IT IS LOOKED AT. A WebGL context, a Draco decoder
 * and a mesh are a lot to spend on a section most visitors scroll past on
 * their way to the price, so nothing starts until the stage is on screen.
 * Below the fold on a phone, that is often never.
 *
 * A LONG LENS, deliberately. The showroom walks around inside rooms and needs
 * a wide field of view to feel like a room; a product on a stand wants the
 * opposite. At 30 degrees the sofa's front edge stays straight instead of
 * bowing towards the camera -- the same distortion that had to be taken out
 * of the tour, and for the same reason.
 */

/** Frame the object: fill the view whatever size the thing happens to be. */
const frame = (camera, object, fill = 1.5) => {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

  // Far enough back that the bounding sphere fits the vertical field of view,
  // with `fill` as the margin. Then lifted to roughly eye height on the
  // object, which is how furniture is photographed.
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * fill;

  camera.position.set(distance * 0.62, centre.y + radius * 0.85, distance * 0.78);
  camera.near = Math.max(0.05, distance * 0.02);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();

  return centre;
};

const ProductStage = ({ modelUrl, anchor = null, spin = true }) => {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);

  const [live, setLive] = useState(false);      // on screen, so worth booting
  const [failed, setFailed] = useState(null);
  const [ready, setReady] = useState(false);

  // ---- only once it is looked at -----------------------------------------

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
      // A little before it arrives, so the model is there by the time the
      // section is.
      { rootMargin: '240px' },
    );

    watch.observe(holder);

    return () => watch.disconnect();
  }, []);

  // ---- the scene ----------------------------------------------------------

  useEffect(() => {
    if (!live || !canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    const holder = holderRef.current;

    setReady(false);
    setFailed(null);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // A turntable the model hangs off, so dragging spins the product and
    // never the camera. The camera stays where it was framed.
    const turntable = new THREE.Group();

    scene.add(turntable);

    /* Studio light, not house light. Three sources: a broad key from the
       front left, a cool rim from behind to lift the far edge off the
       background, and a hemisphere for the paper bounce. The house's own rig
       is sunlight through windows, which is right in a bedroom and wrong on
       a stand. */
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d3c6, 1.5));

    const key = new THREE.DirectionalLight(0xfff4e2, 2.4);

    key.position.set(3.2, 5.0, 4.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0012;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xdfeaf2, 1.1);

    rim.position.set(-3.6, 2.6, -3.2);
    scene.add(rim);

    /* The shadow is what puts the object on a surface rather than in the air.
       A ShadowMaterial catches it without painting a floor -- the page has no
       floor, and a lit ground plane would show its own edges. */
    const shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );

    shadowGround.rotation.x = -Math.PI / 2;
    shadowGround.receiveShadow = true;
    scene.add(shadowGround);

    const draco = new DRACOLoader();

    draco.setDecoderPath('/draco/');

    const kit = {
      product: null,
      raf: 0,
      target: new THREE.Vector3(),
      // How far it has turned, and where the pointer left it.
      angle: 0,
      dragging: false,
      lastX: 0,
      velocity: 0,
      disposed: false,
    };

    // ---- size --------------------------------------------------------------
    // A ResizeObserver, not a window listener. The same bug distorted the
    // showroom: the canvas is laid out by a grid that changes width without
    // the window ever changing size, and a renderer that only hears about
    // window resizes draws at the wrong aspect and stretches everything.
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

    // ---- the model ---------------------------------------------------------

    let cancelled = false;

    loadOneProduct({ modelUrl, anchor, dracoLoader: draco })
      .then((product) => {
        if (cancelled || kit.disposed) {
          disposeProducts(product);

          return;
        }

        turntable.add(product);
        kit.product = product;

        // Stand it on the floor and turn it about its own middle, whatever
        // the exporter left behind.
        const box = new THREE.Box3().setFromObject(product);
        const centre = box.getCenter(new THREE.Vector3());

        product.position.x -= centre.x;
        product.position.z -= centre.z;
        product.position.y -= box.min.y;

        const framed = frame(camera, turntable);

        kit.target.set(0, framed.y, 0);
        camera.lookAt(kit.target);

        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setFailed(err.message);
      });

    // ---- turning -----------------------------------------------------------

    const down = (e) => {
      kit.dragging = true;
      kit.lastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    };

    const move = (e) => {
      if (!kit.dragging) return;
      const dx = e.clientX - kit.lastX;

      kit.lastX = e.clientX;
      kit.angle += dx * 0.008;
      kit.velocity = dx * 0.008;
    };

    const up = (e) => {
      kit.dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    // ---- the loop ----------------------------------------------------------

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const tick = () => {
      kit.raf = requestAnimationFrame(tick);

      if (kit.dragging) {
        // the pointer is driving
      } else if (Math.abs(kit.velocity) > 0.0004) {
        // Carry the throw for a moment, then hand back to the drift.
        kit.angle += kit.velocity;
        kit.velocity *= 0.94;
      } else if (spin && !still) {
        kit.angle += 0.0033;
      }

      turntable.rotation.y = kit.angle;
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

      if (kit.product) disposeProducts(kit.product);
      shadowGround.geometry.dispose();
      shadowGround.material.dispose();
      // This decoder is the stage's own rather than the showroom's shared
      // one, so its workers can go down with the section.
      draco.dispose();
      renderer.dispose();
    };
  }, [live, modelUrl, anchor, spin]);

  return (
    <div ref={holderRef} className="lp-stage">
      <canvas ref={canvasRef} className="lp-stage-canvas" />

      {failed && (
        <p className="lp-stage-note bad">This model could not be loaded: {failed}</p>
      )}

      {!failed && !ready && <p className="lp-stage-note">Bringing it out…</p>}

      {ready && (
        <p className="lp-stage-hint" aria-hidden="true">
          Drag to turn it
        </p>
      )}
    </div>
  );
};

export default ProductStage;
