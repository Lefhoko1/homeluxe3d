import React from 'react';

import './admin.css';

/**
 * The editing toolbar, shown over the 3D view.
 *
 * It replaces three buttons that had been sitting in CanvasContainer with
 * `display: none`, wired to nothing, since before the catalogue existed.
 *
 * Everything here is a thin control over PlacementEditor, which owns the
 * actual scene manipulation. The one piece of judgement in this file is the
 * readout: the admin needs to see the millimetres they are about to save,
 * because "roughly there" in a 3D view is 80mm into a wall.
 */
const MODES = [
  { id: 'translate', icon: '↔', label: 'Move', key: 'G' },
  { id: 'rotate', icon: '⟳', label: 'Rotate', key: 'R' },
  { id: 'scale', icon: '⤢', label: 'Scale', key: 'S' },
];

const AdminBar = ({
  state,
  saving = false,
  message = null,
  onMode,
  onSnap,
  onLockY,
  onDropToFloor,
  onSave,
  onRevert,
  onDelete,
  onUpload,
  onManage,
  onPublish,
  publishing = false,
}) => {
  const { mode, snap, lockY, hasSelection, isDirty, transform, advert } = state;

  return (
    <div className="admin-bar">
      <div className="admin-bar-row">
        <span className="admin-bar-title">🔧 Admin</span>

        <button type="button" className="admin-btn primary" onClick={onUpload}>
          ＋ Upload model
        </button>
        {/* PUBLISH. An admin sees the draft -- their own edits appear as they
            make them -- and a visitor sees the last published snapshot. This
            is the step between the two, and without a button for it the
            separation is just a way of hiding an admin's work from everyone
            including themselves. */}
        <button
          type="button"
          className="admin-btn primary"
          onClick={onPublish}
          disabled={publishing}
          title="Freeze the current layout as a new published version that visitors will see"
        >
          {publishing ? '⏳ Publishing…' : '🚀 Publish'}
        </button>
        <button type="button" className="admin-btn" onClick={onManage}>
          ☰ Manage
        </button>

        <span className="admin-bar-sep" />

        {MODES.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`admin-btn${mode === m.id ? ' active' : ''}`}
            disabled={!hasSelection}
            onClick={() => onMode(m.id)}
            title={`${m.label} (${m.key})`}
          >
            {m.icon} {m.label}
          </button>
        ))}

        <span className="admin-bar-sep" />

        <label className="admin-toggle" title="Snap to 50mm / 15°">
          <input type="checkbox" checked={snap} onChange={(e) => onSnap(e.target.checked)} />
          Snap
        </label>
        <label className="admin-toggle" title="Keep the object on the floor">
          <input type="checkbox" checked={lockY} onChange={(e) => onLockY(e.target.checked)} />
          On floor
        </label>
      </div>

      {hasSelection ? (
        <div className="admin-bar-row selection">
          <span className="admin-selected" title={advert?.productId}>
            {advert?.name ?? 'Selected'}
            {advert?.shopName ? ` — ${advert.shopName}` : ''}
          </span>

          {/* The numbers that are about to be written to the database.
              Millimetres, because that is what the plan is in. */}
          {transform && (
            <span className="admin-readout">
              x {Math.round(transform.x_mm)} · y {Math.round(transform.y_mm)}
              {transform.z_mm ? ` · z ${Math.round(transform.z_mm)}` : ''} mm
              {' · '}
              {Math.round(transform.rotation_deg)}°
              {transform.scale !== 1 ? ` · ×${transform.scale}` : ''}
            </span>
          )}

          <button type="button" className="admin-btn" onClick={onDropToFloor}>
            ⤓ Floor
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={onRevert}
            disabled={!isDirty || saving}
          >
            ↺ Revert
          </button>
          <button
            type="button"
            className={`admin-btn${isDirty ? ' primary' : ''}`}
            onClick={onSave}
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving…' : isDirty ? '✓ Save' : 'Saved'}
          </button>
          <button
            type="button"
            className="admin-btn danger"
            onClick={onDelete}
            disabled={saving || !(advert?.placementId || advert?.pending)}
            title={
              advert?.pending
                ? 'Discard — this has not been saved yet'
                : advert?.placementId
                  ? 'Remove from the house'
                  : 'This item comes from the static catalogue, not the database'
            }
          >
            🗑
          </button>
        </div>
      ) : (
        <div className="admin-bar-row hint">
          Click something in the house to move it, or upload a new model.
        </div>
      )}

      {message && (
        <div className={`admin-bar-row message ${message.tone ?? 'info'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default AdminBar;
