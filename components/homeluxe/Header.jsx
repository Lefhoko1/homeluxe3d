import React from 'react';

/**
 * The title bar, and the way in and out of admin.
 *
 * `isAdmin` is now decided by the database -- a profile with role
 * platform_admin, or membership of a shop -- rather than by a URL parameter.
 * Someone can be SIGNED IN without being an admin, which is why those are two
 * separate props: a shop's staff member sees their name, not the tools.
 */
const Header = ({ isAdmin, isSignedIn, displayName, onLogin, onLogout }) => (
  <div id="header">
    <div>
      <h1>🏡 HomeLuxe 3D</h1>
      <div className="header-subtitle">Virtual Furniture Showroom</div>
    </div>

    <div id="admin-controls">
      {isSignedIn ? (
        <>
          <span className="header-user">
            {displayName}
            {isAdmin && <span className="header-role">admin</span>}
          </span>
          {/* The management screen, away from the 3D view. Only useful to
              someone who can actually change something. */}
          {isAdmin && (
            <a className="control-btn" href="/admin">Manage products</a>
          )}
          <button className="control-btn" onClick={onLogout}>Sign out</button>
        </>
      ) : (
        // Labelled for what it is. A visitor never needs to sign in to tour
        // the house, so an unqualified "Sign in" reads as though they do.
        <button className="control-btn primary" onClick={onLogin}>
          🔑 Admin login
        </button>
      )}
    </div>
  </div>
);

export default Header;
