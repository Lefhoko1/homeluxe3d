import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

import {
  loadHouse,
  disposeHouse,
  getDracoLoader,
  disposeDracoLoader,
  createHouseMaterials,
  disposeHouseMaterials,
  HOUSE_VIEWS,
} from './house';
import { loadProducts, loadOneProduct, disposeProducts, advertFor } from './products';
import { applyFinishes } from './house/textures/finishOverrides';
import { recordEvent } from '../../lib/catalog/repository';
import { ROOM_LABELS } from '../../lib/catalog/useCatalog';
import { createAtmosphere } from './atmosphere/Atmosphere';
import { createLighting } from './lighting/Lighting';
import {
  createTourController,
  loadCharacter,
  disposeCharacter,
  loadRoute,
  TourPad,
  TOUR_START,
} from './tour';
import { AdminBar, AdminGate, AdminList, PlacementEditor, UploadDialog } from './admin';
import { PlacementService } from '../../lib/admin/PlacementService';

const CanvasContainer = ({ currentRoom, currentIndex, isAdmin,
                          shops = [], focusProduct = null, onSelect,
                          onCatalogChanged, onTourApi }) => {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const productsRef = useRef(null);
  const houseRef = useRef(null);
  const houseMaterialsRef = useRef(null);
  const atmosphereRef = useRef(null);
  const lightingRef = useRef(null);
  const interiorBoxRef = useRef(null);
  const cameraBlockersRef = useRef([]);
  const tourRef = useRef(null);
  const characterRef = useRef(null);
  const [touring, setTouring] = useState(false);
  const [advert, setAdvert] = useState(null);
  // Guided-tour state, mirrored into React so the pad can draw itself.
  const routeRef = useRef(null);
  const [guided, setGuided] = useState(false);
  const [tourView, setTourView] = useState('third');
  const [stopLabel, setStopLabel] = useState(null);
  const [progress, setProgress] = useState(null);
  // The pointer handler is installed once; a ref keeps it from capturing
  // the first render's onSelect forever.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // ---- Admin editing ------------------------------------------------------
  // The gizmo is a plain three.js object, not a component: it moves meshes
  // sixty times a second and routing that through React state would re-render
  // the page on every mouse move. React owns the toolbar; the editor owns the
  // scene; `adminState` is the small amount that has to cross between them.
  const editorRef = useRef(null);
  const pickedNodeRef = useRef(null);
  const placementsRef = useRef(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [adminState, setAdminState] = useState({
    mode: 'translate', snap: true, lockY: true,
    hasSelection: false, isDirty: false, transform: null, advert: null,
  });
  const [saving, setSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Three.js scene
    let disposed = false;
    let cleanupPointer = null;   // set once the products group exists

    const scene = new THREE.Scene();
    // Background and fog are set by the atmosphere below, so the sky, the
    // fog and the cloud layers cannot drift out of agreement.

    const camera = new THREE.PerspectiveCamera(
      55,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    canvasRef.current.appendChild(renderer.domElement);

    // Orbit Controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = true;
    // The house is ~14m across, so the old 10m ceiling put the camera inside
    // the building at full zoom-out.
    orbitControls.minDistance = 1.5;
    orbitControls.maxDistance = 75;   // far enough to see the whole 30x40 yard
    orbitControls.maxPolarAngle = Math.PI / 2;
    orbitControls.enabled = true;

    // Store references
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = orbitControls;

    // ---- Sky, clouds, fog ------------------------------------------------
    const atmosphere = createAtmosphere({
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    atmosphere.applyTo(scene);
    atmosphereRef.current = atmosphere;

    // ---- The house and its yard ------------------------------------------
    // Loaded from the per-component GLBs generated by blender/houseluxe.
    // Textures are applied here, in three.js, keyed by Blender material name.
    const houseMaterials = createHouseMaterials({
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    houseMaterialsRef.current = houseMaterials;

    // Products are loaded AFTER the house and parented to it, not to the
    // scene. The house group carries the recentring offset; a product added
    // to the scene instead would sit at raw Blender coordinates, metres away.
    // Chaining also avoids racing the two loads against each other.
    (async () => {
      try {
        const { house, errors, stats } = await loadHouse({
          materials: houseMaterials,
        });

        // The component can unmount while the GLBs are still in flight.
        if (disposed) {
          disposeHouse(house);
          return;
        }

        scene.add(house);
        houseRef.current = house;

        if (errors.length) {
          console.error(
            '[house] %d part(s) failed to load:',
            errors.length,
            errors.map((e) => `${e.file}: ${e.error?.message ?? e.error}`)
          );
        }
        if (stats.untextured.size) {
          console.warn(
            '[house] no three.js material for:',
            [...stats.untextured].join(', ')
          );
        }

        // ---- Shop products ---------------------------------------------
        // Real retail furniture from the Blender catalogue, positioned by
        // the manifest. The old primitive sofas and sofa.glb are gone.
        const { group, placed, errors: productErrors, products } = await loadProducts({
          house: '3bed',
          materials: houseMaterials,
          dracoLoader: getDracoLoader(),
        });

        if (disposed) {
          disposeProducts(group);
          return;
        }

        house.add(group);
        productsRef.current = group;
        // The admin editor is created in its own effect, which cannot run
        // until there is something to edit.
        setSceneReady(true);

        // ---- Activate placed finishes -----------------------------------
        // Which product dresses which surface is DATA. A paint or coating
        // placed on wall.<room> repaints exactly that room; a surface with
        // no placement keeps what Blender gave it.
        const finishSpecs = (placed ?? [])
          .filter((p) => p.isFinish && p.surface)
          .map((p) => {
            // A product sold in several colours carries the colour on the
            // VARIANT, so the placement has to say which one -- otherwise
            // every gamazine wall would come out the default shade.
            const variant = (p.product?.variants ?? []).find(
              (v) => v.slug === p.variant
            );
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

        const { applied } = applyFinishes(
          [house.userData.parts?.floors, house.userData.parts?.wall_finishes],
          finishSpecs,
          { anisotropy: renderer.capabilities.getMaxAnisotropy() }
        );
        if (finishSpecs.length) {
          console.info(
            `[finishes] ${finishSpecs.length} placed, applied to ${applied} mesh(es)`
          );
        }

        // ---- Click an advert --------------------------------------------
        // Raycast only against the products group, never the whole scene:
        // clicking a wall should do nothing, and testing 160 house meshes on
        // every click would be wasted work.
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let downAt = null;

        // Finishes are advertised on SURFACES, not as objects, so they are
        // not in the products group and a raycast against it can never hit
        // them. The link is the material name: Blender bakes it into the
        // mesh, and a finish product declares which one it supplies.
        // Keyed by BOTH names a surface can be wearing: the one Blender baked
        // in, and the one a placed finish replaced it with. A painted wall
        // reports the second, an undressed surface the first -- and looking up
        // only the product's base name finds neither.
        const finishByMaterial = new Map();
        products.forEach((product) => {
          if (product.material) finishByMaterial.set(product.material, product);
        });
        finishSpecs.forEach((spec) => {
          if (spec.product) {
            finishByMaterial.set(spec.surface, spec.product);
            finishByMaterial.set(spec.material, spec.product);
          }
        });

        // Surfaces worth testing. Floors today; walls once paint is sold and
        // the wall meshes are split per room.
        const surfaces = ['floors', 'wall_finishes']
          .map((id) => house.userData.parts?.[id])
          .filter(Boolean);

        const onPointerDown = (event) => {
          // A press that lands on a transform handle belongs to the gizmo.
          // `controls.axis` is non-null while the pointer is over one, which
          // is the only reliable way to tell before the drag begins --
          // otherwise letting go of a handle without moving deselects the
          // very thing being edited.
          if (editorRef.current?.controls?.axis != null) {
            downAt = null;
            return;
          }
          downAt = { x: event.clientX, y: event.clientY };
        };

        const onPointerUp = (event) => {
          // A drag is an orbit, not a click. Without this, every time you
          // rotate the view over a sofa the advert would open.
          if (!downAt) return;
          if (editorRef.current?.isDragging) { downAt = null; return; }
          const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
          downAt = null;
          if (moved > 6) return;

          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(pointer, camera);

          // Objects first: a sofa standing ON a floor should win over the
          // floor behind it.
          let picked = null;
          let pickedNode = null;
          const hits = raycaster.intersectObject(group, true);

          if (hits.length) {
            // The hit is a mesh deep inside the product. Climb to the DIRECT
            // CHILD of the products group: that node holds the placement's
            // transform, and it is what the gizmo must move -- grabbing the
            // mesh instead would move a sofa's arm relative to its own seat.
            // `tag()` copies the advert onto every level, so the userData is
            // there either way.
            let node = hits[0].object;
            while (node && node.parent && node.parent !== group) node = node.parent;
            if (node?.userData?.productId) {
              picked = { ...node.userData };
              pickedNode = node;
            }
          } else if (surfaces.length) {
            // Then surfaces. The mesh is named floors.<room>, so the hit
            // names the room as well as the material.
            const surfaceHits = raycaster.intersectObjects(surfaces, true);
            const mesh = surfaceHits[0]?.object;
            const product = mesh && finishByMaterial.get(mesh.material?.name);
            if (product) {
              // floors.living -> living ; wall.master -> master
              const room = mesh.name?.split('.')[1] ?? null;
              // A finish has no placement of its own in the scene graph, so
              // the room is supplied here rather than read off a placement.
              picked = { ...advertFor(product, { room }), isFinish: true };
            }
          }

          if (!picked) {
            setAdvert(null);
            pickedNodeRef.current = null;
            editorRef.current?.detach();
            onSelectRef.current?.(null);
            return;
          }
          setAdvert(picked);
          // Clicking a product also selects it for editing, when there is an
          // editor. A finish has no object, so it can be advertised but not
          // moved -- it dresses a surface the house already has.
          pickedNodeRef.current = pickedNode;
          if (pickedNode) editorRef.current?.attach(pickedNode);
          else editorRef.current?.detach();
          onSelectRef.current?.(picked);      // tell the panels
          recordEvent('product_click', {
            placementId: picked.placementId ?? null,
            metadata: {
              product: picked.productId,
              shop: picked.shop,
              room: picked.room,
            },
          });
        };

        const dom = renderer.domElement;
        dom.addEventListener('pointerdown', onPointerDown);
        dom.addEventListener('pointerup', onPointerUp);
        cleanupPointer = () => {
          dom.removeEventListener('pointerdown', onPointerDown);
          dom.removeEventListener('pointerup', onPointerUp);
        };

        if (productErrors.length) {
          console.error(
            '[products] %d problem(s):',
            productErrors.length,
            productErrors.map(
              (e) => `${e.stage}:${e.productId ?? ''} ${e.error?.message}`
            )
          );
        }
        console.log(`[products] placed ${placed.length} item(s)`);

        // ---- Walk-through tour ------------------------------------------
        // The character goes in the SCENE, not the house group -- unlike the
        // products. The controller drives the camera and fires raycasts, and
        // both work in world space; parenting the character to the recentred
        // house would leave it offset from its own camera by ~7 metres.
        // TOUR_START is therefore given in world coordinates.
        const character = await loadCharacter({
          materials: houseMaterials,
          dracoLoader: getDracoLoader(),
        });
        if (disposed) {
          disposeCharacter(character);
          return;
        }

        scene.add(character);
        characterRef.current = character;

        // Raycasts read world matrices, which are otherwise only refreshed
        // during render -- so the first ground probe would use stale ones.
        house.updateMatrixWorld(true);

        // Ground = anything you can stand on.
        // Obstacles = everything solid you can walk into.
        // Doors are in NEITHER: every door is treated as open, and doorways
        // are real gaps in the wall geometry.
        const part = (id) => house.userData.parts?.[id];
        const groundObjects = [
          'slab', 'floors', 'porch', 'yard_ground', 'yard_paving', 'yard_beds',
        ].map(part).filter(Boolean);

        // Structure first -- these also block the camera.
        const structure = [
          'walls_exterior', 'walls_interior', 'porch',
          'pool_fence', 'yard_fence',
        ].map(part).filter(Boolean);

        // Everything else solid. Planting is included for its tree trunks;
        // the canopies sit above 2m so the walk rays never reach them.
        // `group` is the furniture, so you cannot walk through a sofa.
        const obstacles = [
          ...structure,
          ...['yard_hedges', 'yard_planting', 'yard_trees']
            .map(part).filter(Boolean),
          group,
        ];

        // ---- Keep the camera in the room it is looking into --------------
        // Orbiting a sofa at close range used to swing the camera straight
        // through the wall behind it, so the shot became: lawn in the
        // foreground, the living room floating beyond it. The walk-through
        // already solved this for itself with `cameraObstacles`; the orbit
        // camera had no equivalent.
        //
        // The envelope is the exterior walls' own bounds, so it needs no
        // hardcoded dimensions and follows the plan.
        const exterior = part('walls_exterior');
        if (exterior) {
          interiorBoxRef.current = new THREE.Box3().setFromObject(exterior);
          // Ceiling included: orbiting upward should stop at it rather than
          // rising through the roof for a plan view of the furniture.
          cameraBlockersRef.current = ['walls_exterior', 'ceiling', 'roof']
            .map(part).filter(Boolean);
        }

        const tour = createTourController({
          character,
          camera,
          controls: orbitControls,
          groundObjects,
          obstacles,
          // The guided route already avoids the walls and the catalogue's
          // furniture, and was verified against both. What it cannot know is
          // furniture an admin moved afterwards -- so that is what the walk
          // keeps testing while it follows the route.
          movableObstacles: [group],
          cameraObstacles: structure,
          start: TOUR_START.position,
          startHeading: TOUR_START.heading,
        });
        tour.attach(window);
        tourRef.current = tour;

        // The solved route through the house. House-local in the manifest,
        // converted to world here because the character lives in the scene.
        routeRef.current = await loadRoute(house);

        // Deep link: /#tour drops the visitor straight onto the driveway.
        // Handy for "take the tour" links in an advert.
        if (window.location.hash === '#tour') {
          tour.enter();
          setTouring(true);
        }
      } catch (error) {
        console.error('[scene] failed to load:', error);
      }
    })();

    const lighting = createLighting({ sunDirection: atmosphere.sunDirection });
    lighting.applyTo(scene);
    lightingRef.current = lighting;

    // Set initial camera position
    const view = HOUSE_VIEWS.overview;
    camera.position.set(...view.position);
    camera.lookAt(...view.target);
    orbitControls.target.set(...view.target);

    // Animation loop
    const clock = new THREE.Clock();
    const camRay = new THREE.Raycaster();
    const toCamera = new THREE.Vector3();

    /**
     * Stop the orbit camera leaving the room it is looking into.
     *
     * Only applies CLOSE UP. Pulled back for the overview the camera is
     * supposed to be outside, and clamping there would yank the viewer into
     * the building the moment they tried to look at the house. So the rule
     * is: if what you are looking at is inside the building AND you are
     * near it, you are inside with it.
     */
    const INSIDE_RANGE = 15;
    const clampCameraToInterior = () => {
      const box = interiorBoxRef.current;
      const blockers = cameraBlockersRef.current;
      if (!box || !blockers.length || tourRef.current?.active) return;
      if (!box.containsPoint(orbitControls.target)) return;

      toCamera.subVectors(camera.position, orbitControls.target);
      const distance = toCamera.length();
      if (distance < 0.05 || distance > INSIDE_RANGE) return;

      toCamera.divideScalar(distance);
      camRay.set(orbitControls.target, toCamera);
      camRay.far = distance;

      const hit = camRay.intersectObjects(blockers, true)[0];
      if (!hit) return;

      // Just short of whatever was hit, and never so close to the target
      // that the near plane clips through it.
      const pulled = Math.max(0.7, hit.distance - 0.25);
      camera.position.copy(orbitControls.target).addScaledVector(toCamera, pulled);
    };

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // The tour takes the camera over when active; OrbitControls is
      // disabled then, so only one of these ever moves it.
      if (tourRef.current?.active) {
        tourRef.current.update(delta);
      } else {
        orbitControls.update();
        clampCameraToInterior();
      }

      atmosphere.update(delta);

      // Keep the sky centred on the viewer so it can never be reached.
      atmosphere.group.position.set(camera.position.x, 0, camera.position.z);
      // And the shadow frustum centred on what is being looked at.
      lighting.follow(orbitControls.target);

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      cleanupPointer?.();

      tourRef.current?.detach(window);
      tourRef.current = null;
      disposeCharacter(characterRef.current);
      characterRef.current = null;
      disposeProducts(productsRef.current);
      disposeHouse(houseRef.current);
      disposeHouseMaterials(houseMaterialsRef.current);
      disposeDracoLoader();   // shuts down the decoder's Web Workers
      atmosphereRef.current?.dispose();
      lightingRef.current?.dispose();
      lightingRef.current = null;
      productsRef.current = null;
      houseRef.current = null;
      houseMaterialsRef.current = null;
      atmosphereRef.current = null;

      if (rendererRef.current && canvasRef.current) {
        canvasRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    // The room label, from the catalogue. The old version hardcoded
    // 'living-room' and announced "Coming soon" for every other value --
    // including the real room codes the scene actually uses.
    const el = document.getElementById('canvas-title');
    if (!el) return;
    const label = ROOM_LABELS[currentRoom]?.label ?? currentRoom;
    el.textContent = advert
      ? `${advert.name} — ${advert.shopName ?? advert.shop}`
      : `${label} — click an item to see the advert`;
  }, [currentRoom, currentIndex, advert]);

  // Selecting in the list flies the camera to that product. Skipped while
  // walking, since the tour owns the camera then.
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    const house = houseRef.current;
    // Finishes have no position -- they dress the whole surface, so there
    // is nowhere to fly to.
    if (!focusProduct?.position || !controls || !camera || !house) return;
    if (tourRef.current?.active) return;

    // Placement positions are house-local; the house group carries the
    // recentring offset, so add it to get world space.
    const target = new THREE.Vector3(...focusProduct.position).add(house.position);
    controls.target.copy(target);

    // Stand back along the current view direction so the move reads as a
    // dolly rather than a teleport to a fixed angle.
    const back = camera.position.clone().sub(controls.target).setY(0);
    if (back.lengthSq() < 0.01) back.set(0, 0, 1);
    back.normalize().multiplyScalar(4.5);
    camera.position.set(target.x + back.x, target.y + 2.6, target.z + back.z);
    controls.update();
  }, [focusProduct]);

  // ---- The placement editor ----------------------------------------------
  // Created only for an admin, and only once there is a scene. Torn down the
  // moment either stops being true, so a sign-out leaves no gizmo behind and
  // no listeners on the canvas.
  useEffect(() => {
    if (!isAdmin || !sceneReady) return undefined;

    const editor = new PlacementEditor({
      camera: cameraRef.current,
      dom: rendererRef.current.domElement,
      scene: sceneRef.current,
      orbitControls: controlsRef.current,
      onChange: setAdminState,
    });
    editorRef.current = editor;
    placementsRef.current = new PlacementService(null, { scene: '3bed' });

    // Blender's own shortcuts, because anyone who has placed furniture in a
    // 3D tool already has them in their fingers.
    const onKey = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'g' || event.key === 'G') editor.setMode('translate');
      else if (event.key === 'r' || event.key === 'R') editor.setMode('rotate');
      else if (event.key === 's' && !event.ctrlKey) editor.setMode('scale');
      else if (event.key === 'Escape') editor.detach();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      editor.dispose();
      editorRef.current = null;
      // OrbitControls is disabled while a handle is held; disposing mid-drag
      // would otherwise leave the camera permanently frozen.
      if (controlsRef.current) controlsRef.current.enabled = true;
    };
  }, [isAdmin, sceneReady]);

  /** Transient toolbar message. Errors stay; confirmations fade. */
  const say = useCallback((text, tone = 'info') => {
    setAdminMessage({ text, tone });
    if (tone !== 'bad') setTimeout(() => setAdminMessage(null), 3500);
  }, []);

  const handleSave = useCallback(async () => {
    const editor = editorRef.current;
    const node = pickedNodeRef.current;
    if (!editor?.hasSelection || !node) return;

    const data = node.userData;
    if (!data.variantId) {
      // Everything in the static catalogue is in this position: it was
      // authored in Blender and has no row to update. Saying so is better
      // than a permission error from PostgREST.
      say(
        'This item comes from the static catalogue, not the database, so ' +
        'there is no row to move. Set the Supabase environment variables to ' +
        'edit placements.',
        'bad'
      );
      return;
    }

    setSaving(true);
    try {
      const placementId = await placementsRef.current.place({
        variantId: data.variantId,
        placementId: data.placementId ?? null,
        transform: editor.toTransform(),
      });

      // The object is now a saved placement, so a second save updates rather
      // than inserting a duplicate.
      node.userData.placementId = placementId;
      node.userData.pending = false;
      node.traverse((child) => {
        if (child.isMesh) child.userData.placementId = placementId;
      });

      editor.markSaved();
      say(data.placementId ? 'Moved.' : 'Placed.');
      // The room lists read the database, so they must re-read or they will
      // keep describing the layout as it was before this save.
      onCatalogChanged?.();
    } catch (error) {
      say(error.message, 'bad');
    } finally {
      setSaving(false);
    }
  }, [say, onCatalogChanged]);

  const handleRevert = useCallback(() => {
    editorRef.current?.revert();
  }, []);

  const handleDelete = useCallback(async () => {
    const node = pickedNodeRef.current;
    if (!node) return;
    const { placementId, pending, name } = node.userData;

    if (!pending && !window.confirm(`Remove "${name}" from the house?`)) return;

    setSaving(true);
    try {
      // A pending object has never been written, so there is nothing to
      // delete -- taking it out of the scene is the whole operation.
      if (placementId) await placementsRef.current.remove(placementId);

      editorRef.current?.detach();
      node.parent?.remove(node);
      node.traverse((child) => { if (child.isMesh) child.geometry?.dispose(); });
      pickedNodeRef.current = null;
      setAdvert(null);
      onSelectRef.current?.(null);
      say(placementId ? 'Removed.' : 'Discarded.');
      if (placementId) onCatalogChanged?.();
    } catch (error) {
      say(error.message, 'bad');
    } finally {
      setSaving(false);
    }
  }, [say, onCatalogChanged]);

  /**
   * Drop a product into the scene from the admin list.
   *
   * Nothing is written here. The model is loaded, put where the camera is
   * looking and handed to the gizmo; it becomes a placement only when the
   * admin presses Save. So a mis-click costs a download and nothing else.
   */
  const handlePlace = useCallback(async ({ product, variant }) => {
    const group = productsRef.current;
    const controls = controlsRef.current;
    if (!group || !variant?.model_url) return;

    setSaving(true);
    try {
      const instance = await loadOneProduct({
        modelUrl: variant.model_url,
        anchor: variant.anchor,
        dracoLoader: getDracoLoader(),
        materials: houseMaterialsRef.current,
        advert: {
          productId: product.qualified_id,
          name: product.name,
          shop: product.shop_slug,
          shopName: product.shop_name,
          category: product.category_code,
          description: product.description,
          price: product.price_cents != null ? product.price_cents / 100 : null,
          currency: product.currency,
          thumbnail: product.thumbnail_url ?? null,
          dimensions: product.width_mm
            ? { width: product.width_mm, depth: product.depth_mm, height: product.height_mm }
            : undefined,
          roomTypes: product.room_types ?? [],
          variantId: variant.id,
          placementId: null,
          // Marks it as never-saved, so Delete discards instead of asking
          // the database to remove a row that does not exist.
          pending: true,
        },
      });

      // Put it where the admin is looking, on the floor. `controls.target` is
      // the point the camera orbits, which is inside whichever room is being
      // viewed -- far more useful than the world origin.
      const target = controls?.target?.clone() ?? new THREE.Vector3();
      target.y = 0;
      group.worldToLocal(target);
      instance.position.set(target.x, 0, target.z);

      group.add(instance);
      pickedNodeRef.current = instance;
      setAdvert({ ...instance.userData });
      editorRef.current?.attach(instance);
      editorRef.current?.setMode('translate');
      say(`${product.name} dropped in. Move it, then press Save.`);
    } catch (error) {
      say(`Could not load that model: ${error.message}`, 'bad');
    } finally {
      setSaving(false);
    }
  }, [say]);

  // The tour only exists once the scene has finished loading, so both of
  // these no-op until then rather than throwing.
  const startTour = () => {
    const tour = tourRef.current;
    if (!tour) return;
    tour.toggle();
    setTouring(tour.active);
    if (!tour.active) { setGuided(false); setStopLabel(null); }
  };

  const exitTour = () => {
    tourRef.current?.exit();
    setTouring(false);
    setGuided(false);
    setStopLabel(null);
  };

  /**
   * Start or stop the guided walk.
   *
   * Arriving at a stop moves the panels to that room, so the list on the left
   * and the advert on the right describe wherever the visitor is standing.
   */
  const toggleGuided = useCallback(() => {
    const tour = tourRef.current;
    const route = routeRef.current;
    if (!tour) return;

    if (tour.touring) {
      tour.stopRoute();
      setGuided(false);
      return;
    }
    if (!route?.waypoints?.length) return;

    tour.followRoute(
      route.waypoints,
      (stop) => {
        setStopLabel(stop.label ?? null);
        setProgress(tour.progress);
        if (stop.room) onSelectRef.current?.({ room: stop.room, roomOnly: true });
      },
      { clearance: route.clearance }
    );
    setTouring(true);
    setGuided(true);
    setProgress(tour.progress);
  }, []);

  // Hand the guided tour up, so the "Auto Tour" button in the bottom bar can
  // start it. The scene has to own the controller -- it needs the camera, the
  // character and the geometry -- so the button borrows it rather than the
  // other way round.
  useEffect(() => {
    onTourApi?.({ startGuided: toggleGuided });
  }, [onTourApi, toggleGuided]);

  const toggleTourView = () => {
    const tour = tourRef.current;
    if (!tour) return;
    tour.toggleView();
    setTourView(tour.view);
  };

  // The guided walk stops itself when the visitor touches a control, so the
  // button has to follow the controller rather than the other way round.
  useEffect(() => {
    if (!guided) return undefined;
    const id = setInterval(() => {
      if (tourRef.current && !tourRef.current.touring) {
        setGuided(false);
        setStopLabel(null);
      }
    }, 400);
    return () => clearInterval(id);
  }, [guided]);

  return (
    <div id="canvas-container" className={isAdmin ? 'admin' : undefined}>
      <div className="canvas-overlay" id="canvas-title">Living Room - Click furniture to explore</div>
      <div className="rotation-indicator">
        <span className="rotation-icon">↻</span>
        <span id="rotation-text">360° View Active</span>
      </div>
      {/* The editing toolbar. Mounted only for someone who can actually
          change something -- it replaces three buttons that sat here with
          `display: none`, wired to nothing. */}
      <AdminGate isAdmin={isAdmin}>
        <AdminBar
          state={adminState}
          saving={saving}
          message={adminMessage}
          onMode={(mode) => editorRef.current?.setMode(mode)}
          onSnap={(on) => editorRef.current?.setSnap(on)}
          onLockY={(on) => editorRef.current?.setLockY(on)}
          onDropToFloor={() => editorRef.current?.dropToFloor()}
          onSave={handleSave}
          onRevert={handleRevert}
          onDelete={handleDelete}
          onUpload={() => setShowUpload(true)}
          onManage={() => setShowList(true)}
        />
      </AdminGate>

      {showUpload && (
        <UploadDialog
          shops={shops}
          onClose={() => setShowUpload(false)}
          onCreated={(created) => {
            say(`Created ${created.qualifiedId}. Open Manage to place it.`);
            onCatalogChanged?.();
          }}
        />
      )}

      {showList && (
        <AdminList
          shops={shops}
          onClose={() => setShowList(false)}
          onPlace={handlePlace}
        />
      )}

      <div className="camera-controls">
        <button className="camera-btn" id="camera-front" title="Front View">👁️</button>
        <button className="camera-btn" id="camera-side" title="Side View">👈</button>
        <button className="camera-btn" id="camera-top" title="Top View">⬇️</button>
        <button className="camera-btn" id="camera-reset" title="Reset View">🔄</button>
        <button
          className="camera-btn"
          id="tour-mode"
          title={touring ? 'Exit walk-through' : 'Walk through the property'}
          onClick={startTour}
          style={{ background: touring ? '#1f6feb' : undefined }}
        >
          🚶
        </button>
      </div>

      {touring && (
        <TourPad
          onPress={(dir) => tourRef.current?.setButton(dir, true)}
          onRelease={(dir) => tourRef.current?.setButton(dir, false)}
          onExit={exitTour}
          onGuided={toggleGuided}
          onToggleView={toggleTourView}
          guided={guided}
          view={tourView}
          stopLabel={stopLabel}
          progress={progress}
        />
      )}

      <div ref={canvasRef} style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
};

// GLTF loading function

export default CanvasContainer;
