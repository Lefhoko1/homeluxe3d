"use client";

import React, { useState } from "react";

import {
  AdminList,
  RequestQueue,
  useAdmin,
} from "../../components/homeluxe/admin";
import LoginModal from "../../components/homeluxe/LoginModal";
import "../../components/homeluxe/homeluxe.css";

/**
 * The management screen, away from the 3D view.
 *
 * The same list is available inside the showroom, where it is the quickest
 * way to get from "upload" to "place". This route exists for the other half
 * of the job -- reviewing what a shop has published, unpublishing something
 * whose promotion has ended, clearing out a draft -- which nobody wants to do
 * while a house is being rendered behind them.
 *
 * Placing is deliberately absent here: it needs a scene, and there is none.
 *
 * TWO TABS, BECAUSE THERE ARE TWO KINDS OF WORK. "Products" is everything
 * that exists. "Made to order" is everything a shop has asked us to make and
 * that does not exist yet -- which is most of what actually comes in, since
 * a furniture shop has photographs and a price list and no way on earth to
 * export a .glb. Both end in the same place; only the first hundred metres
 * differ.
 */
export default function AdminPage() {
  const { isAdmin, isSignedIn, loading, displayName, shops, signIn, signOut } =
    useAdmin();
  const [showLogin, setShowLogin] = useState(false);
  const [tab, setTab] = useState<"products" | "requests">("products");

  if (loading) {
    return (
      <main className="admin-page">
        <p>Checking your session…</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="admin-page">
        <h1>HomeLuxe admin</h1>
        <p>Sign in to manage products.</p>
        <button
          className="admin-btn primary"
          onClick={() => setShowLogin(true)}
        >
          Sign in
        </button>
        {showLogin && (
          <LoginModal
            onClose={() => setShowLogin(false)}
            onLogin={async (email: string, password: string) => {
              await signIn(email, password);
              setShowLogin(false);
            }}
          />
        )}
      </main>
    );
  }

  if (!isAdmin) {
    // Signed in, but not as anyone who manages a shop. Saying so is better
    // than an empty list, which reads as "there is nothing here".
    return (
      <main className="admin-page">
        <h1>HomeLuxe admin</h1>
        <p>
          You are signed in as {displayName}, but this account does not manage
          any shop. Ask a platform admin to add you to one.
        </p>
        <button className="admin-btn" onClick={signOut}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-page-head">
        <h1>HomeLuxe admin</h1>
        <span>{displayName}</span>
        <button className="admin-btn" onClick={signOut}>
          Sign out
        </button>
        <a className="admin-btn" href="/">
          Open the showroom
        </a>
      </div>

      <nav className="admin-tabs">
        <button
          className={`admin-tab${tab === "products" ? " on" : ""}`}
          type="button"
          onClick={() => setTab("products")}
        >
          Products
        </button>
        <button
          className={`admin-tab${tab === "requests" ? " on" : ""}`}
          type="button"
          onClick={() => setTab("requests")}
        >
          Made to order
        </button>
      </nav>

      {/* Inline rather than as an overlay: this whole page is the list, so
          there is nothing to dismiss it back to. */}
      {tab === "products" ? (
        <AdminList inline shops={shops} />
      ) : (
        <RequestQueue shops={shops} />
      )}
    </main>
  );
}
