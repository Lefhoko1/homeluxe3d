import React from 'react';

/**
 * The title bar, and the ways in.
 *
 * THREE KINDS OF PERSON PASS THROUGH HERE and the bar has to make sense to
 * all of them. A visitor who has never signed in wants to follow a shop; a
 * signed-in visitor wants the shops they follow; someone who runs a shop
 * wants the tools. `isAdmin` and `isSignedIn` are separate props for exactly
 * that reason -- a shop's staff member is signed in and sees their name, not
 * the management screen.
 *
 * The unsigned call to action is FOLLOW A SHOP, not "sign in". Nobody needs
 * an account to walk through the house, so an unqualified sign-in prompt
 * suggests they do; and "join" without a reason is a chore. The reason is the
 * button.
 */
const Header = ({
  isAdmin,
  isSignedIn,
  displayName,
  unreadCount = 0,
  onLogin,
  onLogout,
}) => (
  <div id="header">
    <div>
      <h1>HomeLuxe 3D</h1>
      <div className="header-subtitle">Virtual furniture showroom</div>
    </div>

    <div id="admin-controls">
      {isSignedIn ? (
        <>
          <span className="header-user">
            {displayName}
            {isAdmin && <span className="header-role">admin</span>}
          </span>

          {/* Where a visitor's own things live: the shops they follow and
              what those shops have told them. */}
          <a className="control-btn" href="/following">
            My shops
            {unreadCount > 0 && (
              <span className="header-unread" aria-label={`${unreadCount} unread`}>
                {unreadCount}
              </span>
            )}
          </a>

          {/* The management screen, away from the 3D view. Only useful to
              someone who can actually change something. */}
          {isAdmin && (
            <a className="control-btn" href="/admin">Manage products</a>
          )}
          <button className="control-btn" onClick={onLogout}>Sign out</button>
        </>
      ) : (
        <>
          <a className="control-btn primary" href="/join">Follow a shop</a>
          <button className="control-btn" onClick={onLogin}>Sign in</button>
        </>
      )}
    </div>
  </div>
);

export default Header;
