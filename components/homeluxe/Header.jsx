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
 *
 * IT IS THE FRONT PAGE'S BAR NOW, down to the class names -- the same
 * `luxe-wordmark`, the same `luxe-btn`. The showroom used to have chrome of
 * its own invented before there was a front page to agree with: a heavier
 * wordmark, a second subtitle, and buttons with 2px borders and a teal fill
 * that appear nowhere else on the site. Walking from `/` into `/showroom`
 * looked like leaving for a different company's product, which is the one
 * thing a door between two of your own pages must not do.
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
    {/* THE WORDMARK IS THE WAY OUT. The house used to be the whole site, so
        there was nowhere to go back to; now there is a front page, and the
        first place anybody looks for it is the logo. */}
    <a className="luxe-wordmark header-brand" href="/">
      <strong>HomeLuxe 3D</strong>
      <span>Gaborone</span>
    </a>

    <div id="admin-controls">
      {isSignedIn ? (
        <>
          <span className="header-user">
            {displayName}
            {isAdmin && <span className="header-role">admin</span>}
          </span>

          {/* Where a visitor's own things live: the shops they follow and
              what those shops have told them. */}
          <a className="luxe-btn ghost" href="/following">
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
            <a className="luxe-btn ghost" href="/admin">Manage products</a>
          )}
          <button type="button" className="luxe-btn quiet" onClick={onLogout}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <a className="luxe-btn primary" href="/join">Follow a shop</a>
          <button type="button" className="luxe-btn ghost" onClick={onLogin}>
            Sign in
          </button>
        </>
      )}
    </div>
  </div>
);

export default Header;
