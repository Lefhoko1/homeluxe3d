import React from 'react';

/**
 * Renders its children only for someone who can actually change something.
 *
 * The point is not to hide buttons -- the database refuses unauthorised
 * writes whether or not a button is on screen, and a gate in the browser
 * secures nothing. The point is that a visitor should not mount the admin
 * components at all: no gizmo listeners on the canvas, no product-management
 * queries, no dialog code in the way of a tour.
 *
 * This replaces `?admin=true`, which showed the toolbar to anyone who typed
 * it and granted nothing when they used it.
 */
const AdminGate = ({ isAdmin, children, fallback = null }) =>
  isAdmin ? <>{children}</> : fallback;

export default AdminGate;
