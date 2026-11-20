import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  ELEVATIONS,
  MAX_CLIPS,
  MAX_CLIP_MS,
  NarrationService,
  elevationOf,
} from '../../../lib/narration/NarrationService';
import { elevationView } from '../../../lib/narration/elevationView';
import { canRecord, measureAudioFile, startRecording } from '../../../lib/narration/recorder';
import { loadOneProduct } from '../products/ProductLoader';

/**
 * The recording studio: a shop talks the visitor through its product.
 *
 * Pick an elevation -- the model turns to show it, the same angle the tour
 * will show -- press Record, talk, press Stop, listen back, keep it. Up to six
 * clips of up to thirty seconds, in the order they will play. Uploading a
 * file works too, for a shop that recorded on a phone.
 *
 * Recording is free to try. PUBLISHING needs the feature (Premier, or the
 * add-on); without it the screen says so plainly and the database refuses
 * anyway. See supabase/migrations/0028_audio_narration.sql.
 */

const secs = (ms) => `${Math.round(ms / 1000)}s`;
const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// The model, turned to the elevation being talked about
// ---------------------------------------------------------------------------

const ElevationViewer = ({ model, elevation }) => {
  const holderRef = useRef(null);
  const kitRef = useRef(null);
  const [state, setState] = useState(model ? 'loading' : 'none');

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !model?.url) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    holder.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, -4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1.6, 0.02, 200);

    const kit = { renderer, scene, camera, piece: null, eye: new THREE.Vector3(), aim: new THREE.Vector3(), wantEye: null, wantAim: null, raf: 0 };
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

    let cancelled = false;
    loadOneProduct({ modelUrl: model.url, anchor: model.anchor })
      .then((piece) => {
        if (cancelled) return;
        scene.add(piece);
        kit.piece = piece;
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('failed'); });

    const tick = () => {
      kit.raf = requestAnimationFrame(tick);
      if (kit.wantEye) {
        // Eased, so a change of elevation reads as walking round the piece.
        kit.eye.lerp(kit.wantEye, 0.12);
        kit.aim.lerp(kit.wantAim, 0.12);
      }
      camera.position.copy(kit.eye);
      camera.lookAt(kit.aim);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(kit.raf);
      watch.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      kitRef.current = null;
    };
  }, [model?.url, model?.anchor]);

  // Aim at the elevation. Products face -Z at rotation 0, as in the house.
  useEffect(() => {
    const kit = kitRef.current;
    if (!kit?.piece || state !== 'ready') return;
    const box = new THREE.Box3().setFromObject(kit.piece);
    const view = elevationView(
      { box, front: new THREE.Vector3(0, 0, -1) },
      elevationOf(elevation),
      { fov: kit.camera.fov, aspect: kit.camera.aspect }
    );
    // THE LENS FOLLOWS THE MODEL'S SIZE. Uploaded models are often in
    // centimetres -- a 2m sofa arrives 200 units long -- and with fixed
    // near/far planes the camera ended up seeing a slice of the inside of it.
    const size = box.getSize(new THREE.Vector3()).length();
    kit.camera.near = Math.max(0.001, view.distance / 500);
    kit.camera.far = (view.distance + size) * 4;
    kit.camera.updateProjectionMatrix();
    if (!kit.wantEye) {
      kit.eye.copy(view.eye);
      kit.aim.copy(view.target);
    }
    kit.wantEye = view.eye;
    kit.wantAim = view.target;
  }, [elevation, state]);

  return (
    <div className="narr-viewer" ref={holderRef}>
      {state === 'loading' && <div className="narr-viewer-note">Loading the model…</div>}
      {state === 'failed' && <div className="narr-viewer-note">The model could not be shown, but you can still record.</div>}
      {state === 'none' && <div className="narr-viewer-note">This product has no model yet. You can still record.</div>}
      <div className="narr-viewer-label">{elevationOf(elevation).label}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The studio
// ---------------------------------------------------------------------------

const NarrationStudio = ({ productId, onClose }) => {
  const service = useMemo(() => new NarrationService(), []);
  const [data, setData] = useState(null);       // from service.load
  const [allowed, setAllowed] = useState(null); // may publish?
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);       // what is being saved

  const [elevation, setElevation] = useState('front');
  const [photo, setPhoto] = useState('');
  // The recorder: idle | recording | review
  const [mode, setMode] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState(null);       // {blob, durationMs, url}
  const [redoing, setRedoing] = useState(null); // clip being re-recorded
  const [playing, setPlaying] = useState(null); // clip id being played
  const recRef = useRef(null);
  const audioRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const loaded = await service.load(productId);
      setData(loaded);
      setAllowed(await service.canPublish(loaded.product.shopId));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [service, productId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Stop everything on the way out: a microphone left open is a red dot in
  // the visitor's tab bar long after the dialog is gone.
  useEffect(() => () => {
    recRef.current?.cancel();
    audioRef.current?.pause();
  }, []);
  useEffect(() => () => { if (take?.url) URL.revokeObjectURL(take.url); }, [take]);

  const clips = data?.clips ?? [];
  const total = clips.reduce((sum, c) => sum + c.durationMs, 0);
  const full = clips.length >= MAX_CLIPS && !redoing;

  const play = (id, url) => {
    audioRef.current?.pause();
    if (playing === id) { setPlaying(null); return; }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  };

  const record = async () => {
    setError(null);
    audioRef.current?.pause();
    setPlaying(null);
    try {
      const rec = await startRecording({ onTick: setElapsed });
      recRef.current = rec;
      setElapsed(0);
      setMode('recording');
      // Ends by Stop, or by itself at thirty seconds.
      const result = await rec.done;
      recRef.current = null;
      if (!result) { setMode('idle'); return; }
      setTake({ ...result, url: URL.createObjectURL(result.blob) });
      setMode('review');
    } catch (e) {
      setError(e.message);
      setMode('idle');
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setError(null);
    try {
      const durationMs = await measureAudioFile(file);
      if (durationMs > MAX_CLIP_MS + 500) {
        setError(`That file is ${secs(durationMs)}. A clip can be at most ${MAX_CLIP_MS / 1000} seconds — trim it and try again.`);
        return;
      }
      setTake({ blob: file, durationMs, url: URL.createObjectURL(file) });
      setMode('review');
    } catch (e) {
      setError(e.message);
    }
  };

  const keep = async () => {
    if (!take || !data) return;
    setBusy('Saving the clip…');
    try {
      // Only replace a clip that is still there; otherwise keep it as new.
      const target = redoing && clips.find((c) => c.id === redoing.id);
      if (target) {
        await service.replaceAudio(data.product, target, { audio: take.blob, durationMs: take.durationMs });
      } else {
        await service.addClip(
          data.product,
          { audio: take.blob, durationMs: take.durationMs, elevation: redoing?.elevation ?? elevation, imageUrl: photo || null },
          clips.length
        );
      }
      setTake(null);
      setRedoing(null);
      setMode('idle');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const discard = () => {
    setTake(null);
    setMode('idle');
  };

  const act = async (label, fn) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const move = (index, by) => {
    const order = clips.map((c) => c.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + by, 0, moved);
    act('Reordering…', () => service.reorder(data.product.id, order));
  };

  const remove = (clip) => {
    if (!window.confirm(`Delete the ${elevationOf(clip.elevation).label.toLowerCase()} clip? It cannot be undone.`)) return;
    // Deleting the clip that is being recorded again: the next take becomes a
    // new clip, not a replacement for one that no longer exists.
    if (redoing?.id === clip.id) setRedoing(null);
    act('Deleting…', () => service.deleteClip(data.product, clip, clips.filter((c) => c.id !== clip.id)));
  };

  const published = data?.status === 'published';

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal wide narr" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h2>
            Narration{data ? ` — ${data.product.name}` : ''}
            {data && (
              <span className={`admin-status ${published ? 'published' : 'draft'}`}>
                {published ? 'on the tour' : clips.length ? 'draft' : 'not recorded'}
              </span>
            )}
          </h2>
          <button type="button" className="admin-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="narr-body">
          <p className="narr-intro">
            Talk visitors through this product. Pick a view, press <strong>Record</strong>,
            and explain what they are looking at. When the tour reaches the product it
            plays your clips in order and turns to each view as you talk about it.
            Up to {MAX_CLIPS} clips of up to {MAX_CLIP_MS / 1000} seconds each.
          </p>

          {allowed === false && (
            <div className="admin-note warn">
              You can record and listen back now. To play it on the tour, audio narration
              needs the <strong>Premier</strong> plan or the <strong>Audio narration add-on</strong> —
              contact Spacivelle to switch it on.
            </div>
          )}
          {error && <div className="admin-note bad">{error}</div>}
          {!data && !error && <div className="admin-note">Loading…</div>}

          {data && (
            <div className="narr-grid">
              <div className="narr-left">
                <ElevationViewer model={data.model} elevation={redoing?.elevation ?? elevation} />

                <div className="narr-views" role="group" aria-label="Which view you are talking about">
                  {ELEVATIONS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={`narr-view${(redoing?.elevation ?? elevation) === e.id ? ' on' : ''}`}
                      onClick={() => setElevation(e.id)}
                      disabled={mode !== 'idle' || Boolean(redoing)}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>

                {data.photos.length > 0 && !redoing && (
                  <div className="narr-photos">
                    <span>Photo to show with this view:</span>
                    <div className="narr-photo-row">
                      <button
                        type="button"
                        className={`narr-photo none${photo === '' ? ' on' : ''}`}
                        onClick={() => setPhoto('')}
                      >
                        None
                      </button>
                      {data.photos.map((url) => (
                        <button
                          key={url}
                          type="button"
                          className={`narr-photo${photo === url ? ' on' : ''}`}
                          onClick={() => setPhoto(url)}
                        >
                          <img src={url} alt="" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* The recorder */}
                <div className={`narr-recorder ${mode}`}>
                  {redoing && mode === 'idle' && (
                    <div className="narr-redo">
                      Recording again: <strong>{elevationOf(redoing.elevation).label}</strong>
                      <button type="button" className="admin-btn" onClick={() => setRedoing(null)}>Cancel</button>
                    </div>
                  )}

                  {mode === 'idle' && (
                    <div className="narr-actions">
                      <button
                        type="button"
                        className="narr-rec"
                        onClick={record}
                        disabled={full || !canRecord() || Boolean(busy)}
                        title={full ? `${MAX_CLIPS} clips is the most a product can have` : 'Start recording'}
                      >
                        <span className="narr-dot" aria-hidden /> Record
                      </button>
                      <label className={`admin-btn${full || busy ? ' disabled' : ''}`}>
                        Upload audio file
                        <input
                          type="file"
                          accept="audio/*"
                          hidden
                          disabled={full || Boolean(busy)}
                          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
                        />
                      </label>
                      {full && <span className="narr-hint">{MAX_CLIPS} clips — delete one to add another.</span>}
                    </div>
                  )}

                  {mode === 'recording' && (
                    <div className="narr-live">
                      <div className="narr-meter" aria-hidden>
                        <div style={{ width: `${(elapsed / MAX_CLIP_MS) * 100}%` }} />
                      </div>
                      <div className="narr-live-row">
                        <span className="narr-dot live" aria-hidden />
                        <span className="narr-time" aria-live="off">
                          {clock(elapsed)} / {clock(MAX_CLIP_MS)}
                        </span>
                        <button type="button" className="admin-btn primary" onClick={() => recRef.current?.stop()}>
                          ■ Stop
                        </button>
                      </div>
                      <div className="narr-hint">It stops by itself at {MAX_CLIP_MS / 1000} seconds.</div>
                    </div>
                  )}

                  {mode === 'review' && take && (
                    <div className="narr-review">
                      <audio src={take.url} controls preload="auto" />
                      <div className="narr-actions">
                        <button type="button" className="admin-btn primary" onClick={keep} disabled={Boolean(busy)}>
                          {busy ?? `Keep this ${secs(take.durationMs)} clip`}
                        </button>
                        <button type="button" className="admin-btn" onClick={discard} disabled={Boolean(busy)}>
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="narr-right">
                <div className="narr-list-head">
                  <strong>Clips, in the order they play</strong>
                  <span>{clips.length}/{MAX_CLIPS} · {clock(total)}</span>
                </div>

                {clips.length === 0 && (
                  <div className="narr-empty">
                    Nothing recorded yet. Start with the front: what is it, and why would
                    someone want it?
                  </div>
                )}

                <ol className="narr-list">
                  {clips.map((clip, index) => (
                    <li key={clip.id} className={redoing?.id === clip.id ? 'redoing' : ''}>
                      {clip.imageUrl
                        ? <img className="narr-thumb" src={clip.imageUrl} alt="" />
                        : <span className="narr-thumb none">{index + 1}</span>}
                      <div className="narr-clip-main">
                        <select
                          value={clip.elevation}
                          aria-label="View"
                          disabled={Boolean(busy)}
                          onChange={(e) => act('Saving…', () => service.updateClip(clip.id, { elevation: e.target.value }))}
                        >
                          {ELEVATIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                        </select>
                        <span className="narr-len">{secs(clip.durationMs)}</span>
                      </div>
                      <div className="narr-clip-actions">
                        <button type="button" className="narr-icon" onClick={() => play(clip.id, clip.audioUrl)} aria-label={playing === clip.id ? 'Stop' : 'Play'} title={playing === clip.id ? 'Stop' : 'Play'}>
                          {playing === clip.id ? '■' : '▶'}
                        </button>
                        <button type="button" className="narr-icon" onClick={() => { setRedoing(clip); setElevation(clip.elevation); }} disabled={mode !== 'idle' || Boolean(busy)} aria-label="Record again" title="Record again">↻</button>
                        <button type="button" className="narr-icon" onClick={() => move(index, -1)} disabled={index === 0 || Boolean(busy)} aria-label="Play earlier" title="Play earlier">↑</button>
                        <button type="button" className="narr-icon" onClick={() => move(index, 1)} disabled={index === clips.length - 1 || Boolean(busy)} aria-label="Play later" title="Play later">↓</button>
                        <button type="button" className="narr-icon danger" onClick={() => remove(clip)} disabled={Boolean(busy)} aria-label="Delete" title="Delete">✕</button>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="narr-publish">
                  {published ? (
                    <>
                      <span className="narr-on">● Playing on the tour</span>
                      <button type="button" className="admin-btn" disabled={Boolean(busy)}
                        onClick={() => act('Taking it off the tour…', () => service.unpublish(data.product.id))}>
                        Take off the tour
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="admin-btn primary"
                      disabled={!clips.length || allowed === false || Boolean(busy)}
                      title={allowed === false ? 'Needs Premier or the Audio narration add-on' : !clips.length ? 'Record a clip first' : ''}
                      onClick={() => act('Publishing…', () => service.publish(data.product.id))}
                    >
                      Put on the tour
                    </button>
                  )}
                  {busy && <span className="narr-hint">{busy}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NarrationStudio;
