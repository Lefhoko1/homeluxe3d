"use client";

import React, { useState } from "react";

import { AdminShell, useAdmin } from "../../components/homeluxe/admin";
import LoginModal from "../../components/homeluxe/LoginModal";
import "../../components/homeluxe/homeluxe.css";

/**
 * The management application, away from the 3D view.
 *
 * This route used to be one list with two tabs. It is now the whole admin --
 * the house's slots and what stands in them, the catalogue, the assets and
 * their versions, the shops, the campaigns, the analytics, the audit log --
 * because the specification asks for seventeen screens and the work an
 * operator does every day is spread across most of them.
 *
 * PLACING IS STILL ABSENT FROM ONE PLACE ONLY: dragging a product around in
 * 3D needs a scene, and there is none here. Everything that does NOT need a
 * rendered house is here rather than floating over one, which is the right
 * split -- nobody wants to audit a shop's permissions through a translucent
 * panel with a house being rendered behind it.
 *
 * This page's whole job is the three states before the application starts:
 * checking, signed out, and signed in as somebody with nothing to administer.
 * Everything after that is `AdminShell`.
 */
export default function AdminPage() {
  const {
    session,
    isAdmin,
    isSignedIn,
    loading,
    displayName,
    shops,
    signIn,
    signOut,
  } = useAdmin();
  const [showLogin, setShowLogin] = useState(false);

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
        <p>Sign in to manage the house.</p>
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
    // than an empty application, which reads as "there is nothing here".
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

  return <AdminShell session={session} shops={shops} onSignOut={signOut} />;
}
