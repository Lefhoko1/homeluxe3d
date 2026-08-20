"use client";

import React from "react";

import { useAdmin } from "../../components/homeluxe/admin";
import JoinPanel from "../../components/homeluxe/visitor/JoinPanel";
import "../../components/homeluxe/homeluxe.css";
import "../../components/homeluxe/visitor.css";

/**
 * Registering, on its own page, for the links that say "join".
 *
 * Somebody already signed in is sent straight to their shops rather than
 * shown a form they do not need. That is a redirect and not a message,
 * because "you are already signed in" is not news to anybody.
 */
export default function JoinPage() {
  const { isSignedIn, loading } = useAdmin();

  React.useEffect(() => {
    if (!loading && isSignedIn) window.location.replace("/following");
  }, [loading, isSignedIn]);

  return (
    <main className="luxe-page">
      <div className="luxe-top">
        <a className="luxe-wordmark" href="/">
          <strong>HomeLuxe 3D</strong>
          <span>virtual showroom</span>
        </a>
        <a className="luxe-btn ghost" href="/">Back to the house</a>
      </div>

      {loading ? (
        <p className="luxe-sub luxe-narrow">One moment…</p>
      ) : (
        <JoinPanel
          mode="register"
          onDone={() => window.location.assign("/following")}
        />
      )}
    </main>
  );
}
