import React, { useEffect, useMemo, useState } from 'react';

import { inspectModel } from '../../../lib/admin/ModelInspector';
import { ProductDraft, ValidationError } from '../../../lib/admin/ProductDraft';
import { ProductService } from '../../../lib/admin/ProductService';
import { humanSize } from '../../../lib/storage/AssetStore';

/**
 * Upload a .glb and turn it into an advertised product.
 *
 * The form asks for exactly what the catalogue needs and nothing else:
 * which shop, what it is, where it may stand, what it costs, the model, and
 * the pictures the advert panel shows when a visitor clicks it.
 *
 * The one non-obvious behaviour is that the FILE IS READ BEFORE IT IS SENT.
 * Dropping a model parses it in the browser, which catches a bad export
 * immediately instead of at the next page load, and fills in the dimensions
 * from the geometry -- the file already knows how big it is, so nobody should
 * have to measure it by hand and get it wrong.
 */

const ROOM_TYPES = [
  { id: 'living', label: 'Living' },
  { id: 'dining', label: 'Dining' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'ensuite', label: 'Ensuite' },
  { id: 'laundry', label: 'Laundry' },
  { id: 'hallway', label: 'Hallway' },
  { id: 'storage', label: 'Storage' },
  { id: 'outdoor', label: 'Outdoor' },
];

const UploadDialog = ({ shops = [], onClose, onCreated, onPlace }) => {
  // Set once the product exists, to ask how to place it. Only when there is a
  // house to place into -- `onPlace` is absent on the standalone admin page.
  const [placeChoice, setPlaceChoice] = useState(null);
  const [shopId, setShopId] = useState(shops[0]?.id ?? '');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [price, setPrice] = useState('');
  const [roomTypes, setRoomTypes] = useState([]);
  const [dimensions, setDimensions] = useState({ width: '', depth: '', height: '' });
  const [status, setStatus] = useState('published');

  const [categories, setCategories] = useState([]);
  const [inspection, setInspection] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [modelError, setModelError] = useState(null);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(null);
  const [problems, setProblems] = useState([]);

  const shop = useMemo(() => shops.find((s) => s.id === shopId), [shops, shopId]);

  useEffect(() => {
    new ProductService()
      .categories()
      .then(setCategories)
      .catch((error) => setProblems([error.message]));
  }, []);

  // Object URLs are a leak if they are not revoked -- the browser holds the
  // whole file in memory until they are.
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [images]);

  const chooseModel = async (file) => {
    if (!file) return;
    setModelError(null);
    setInspection(null);
    setInspecting(true);
    try {
      const result = await inspectModel(file);
      setInspection(result);
      // The geometry knows its own size; trust it unless the admin overrides.
      setDimensions({
        width: String(result.dimensions.width),
        depth: String(result.dimensions.depth),
        height: String(result.dimensions.height),
      });
      if (!name) setName(file.name.replace(/\.glb$/i, '').replace(/[-_]+/g, ' '));
    } catch (error) {
      setModelError(error.message);
    } finally {
      setInspecting(false);
    }
  };

  const toggleRoom = (id) =>
    setRoomTypes((current) =>
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id]
    );

  const submit = async (event) => {
    event.preventDefault();
    setProblems([]);
    setBusy(true);

    const draft = new ProductDraft({
      shopId,
      shopSlug: shop?.slug,
      name,
      sku,
      description,
      categoryCode,
      currency: shop?.currency ?? 'BWP',
      price,
      roomTypes,
      dimensions,
      status,
      inspection,
      images,
    });

    try {
      const created = await draft.save(setStep);

      // The database checked the model against the dimensions typed above and
      // refused it. The product was created and the file was kept -- it is a
      // draft, which no visitor can see -- so the dialog STAYS OPEN with the
      // reason showing, because the thing to do next is fix the export and
      // upload it again, not start over.
      if (created.assetProblems?.length) {
        setProblems([
          `Saved as a draft -- the model did not pass its check, so it is not `
          + `visible in the house yet.`,
          ...created.assetProblems,
        ]);
        onCreated?.(created);
        return;
      }

      onCreated?.(created);

      // Ask how to place it, rather than closing and leaving the admin to go
      // and find the new product in Manage.
      if (onPlace) {
        const variants = await new ProductService().variants(created.productId);
        const variant = variants.find((v) => v.model_url);
        if (variant) {
          setPlaceChoice({ created, variant });
          return;
        }
      }
      onClose?.();
    } catch (error) {
      setProblems(
        error instanceof ValidationError ? error.problems : [error.message]
      );
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  // -- the product exists: how should it go into the house? ---------------
  if (placeChoice) {
    const { created, variant } = placeChoice;
    // What the 3D view needs to label the model, taken from the form just
    // submitted -- the same shape the Manage list hands over.
    const product = {
      qualified_id: created.qualifiedId,
      name,
      shop_slug: shop?.slug,
      shop_name: shop?.name,
      category_code: categoryCode,
      description,
      price_cents: price ? Math.round(Number(price) * 100) : null,
      currency: shop?.currency ?? 'BWP',
      thumbnail_url: null,
      width_mm: Number(dimensions.width) || null,
      depth_mm: Number(dimensions.depth) || null,
      height_mm: Number(dimensions.height) || null,
      room_types: roomTypes,
    };
    const place = (withAi) => {
      onPlace({ product, variant }, { withAi });
      onClose?.();
    };

    return (
      <div className="admin-modal-backdrop" onClick={onClose}>
        <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
          <div className="admin-modal-head">
            <h2>{name} is ready to place</h2>
            <button type="button" className="admin-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="admin-place-choice">
            <div className="admin-note">
              Created {created.qualifiedId}. How would you like to put it in the house?
            </div>
            <div className="admin-place-choice-actions">
              <button type="button" className="admin-btn" onClick={() => place(false)}>
                ✋ Place manually
              </button>
              <button type="button" className="admin-btn primary" onClick={() => place(true)}>
                ✨ Place with AI
              </button>
              <button type="button" className="admin-btn" onClick={onClose}>
                Later
              </button>
            </div>
            <div className="admin-note">
              <strong>Manually</strong> drops it where you are looking, to move, rotate and scale
              with the handles. <strong>With AI</strong> drops it in and opens a prompt: describe
              where it should go and the AI reads the room, checks the position against the walls,
              furniture, doors and walkway, and moves it there for you to review and Save.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h2>Upload a product</h2>
          <button type="button" className="admin-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={submit}>
          {/* -- the model ------------------------------------------------ */}
          <label className="admin-field">
            <span className="admin-label">3D model (.glb)</span>
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => chooseModel(e.target.files?.[0])}
              disabled={busy}
            />
          </label>

          {inspecting && <div className="admin-note">Reading the model…</div>}
          {modelError && <div className="admin-note bad">{modelError}</div>}

          {inspection && (
            <div className="admin-inspection">
              <div className="admin-inspection-row">
                <strong>{inspection.file.name}</strong>
                <span>{humanSize(inspection.bytes)}</span>
                <span>{inspection.triangles.toLocaleString('en-GB')} triangles</span>
                <span>{inspection.meshes} mesh(es)</span>
              </div>
              <div className="admin-inspection-row">
                {inspection.dimensions.width} × {inspection.dimensions.depth} ×{' '}
                {inspection.dimensions.height} mm
              </div>
              {inspection.warnings.map((w, i) => (
                <div className="admin-note warn" key={i}>{w.message}</div>
              ))}
              {inspection.errors.map((e, i) => (
                <div className="admin-note bad" key={i}>{e.message}</div>
              ))}
            </div>
          )}

          {/* -- who is selling it ---------------------------------------- */}
          <div className="admin-grid-2">
            <label className="admin-field">
              <span className="admin-label">Shop</span>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} disabled={busy}>
                <option value="">Choose a shop…</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span className="admin-label">Category</span>
              <select
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
                disabled={busy}
              >
                <option value="">Choose a category…</option>
                {categories
                  .filter((c) => c.kind === 'object')
                  .map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
              </select>
            </label>
          </div>

          <div className="admin-grid-2">
            <label className="admin-field">
              <span className="admin-label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </label>
            <label className="admin-field">
              <span className="admin-label">SKU (optional)</span>
              <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={busy} />
            </label>
          </div>

          <label className="admin-field">
            <span className="admin-label">Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="What a visitor reads when they click it."
            />
          </label>

          {/* -- where it may go ------------------------------------------ */}
          <div className="admin-field">
            <span className="admin-label">
              Rooms it may be placed in
              <small> — a product scoped to nothing can never be placed</small>
            </span>
            <div className="admin-chips">
              {ROOM_TYPES.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className={`admin-chip${roomTypes.includes(room.id) ? ' on' : ''}`}
                  onClick={() => toggleRoom(room.id)}
                  disabled={busy}
                >
                  {room.label}
                </button>
              ))}
            </div>
          </div>

          {/* -- money and size ------------------------------------------- */}
          <div className="admin-grid-4">
            <label className="admin-field">
              <span className="admin-label">Price ({shop?.currency ?? 'BWP'})</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="18999"
                disabled={busy}
              />
            </label>
            {['width', 'depth', 'height'].map((axis) => (
              <label className="admin-field" key={axis}>
                <span className="admin-label">{axis} (mm)</span>
                <input
                  value={dimensions[axis]}
                  onChange={(e) =>
                    setDimensions((d) => ({ ...d, [axis]: e.target.value }))
                  }
                  disabled={busy}
                />
              </label>
            ))}
          </div>

          {/* -- the pictures --------------------------------------------- */}
          <label className="admin-field">
            <span className="admin-label">
              Photographs
              <small> — the first is the one shown in the advert panel</small>
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImages([...(e.target.files ?? [])])}
              disabled={busy}
            />
          </label>

          {previews.length > 0 && (
            <div className="admin-previews">
              {previews.map((url, i) => (
                <div className={`admin-preview${i === 0 ? ' first' : ''}`} key={url}>
                  <img src={url} alt="" />
                  {i === 0 && <span className="admin-preview-tag">Advert image</span>}
                </div>
              ))}
            </div>
          )}

          <label className="admin-field">
            <span className="admin-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
              <option value="published">Published — visible to visitors</option>
              <option value="draft">Draft — only you can see it</option>
            </select>
          </label>

          {problems.length > 0 && (
            <div className="admin-problems">
              {problems.map((p, i) => <div key={i}>• {p}</div>)}
            </div>
          )}

          <div className="admin-modal-foot">
            {step && <span className="admin-step">{step}</span>}
            <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? 'Uploading…' : 'Create product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadDialog;
