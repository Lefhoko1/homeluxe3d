"use client";

import React from "react";

import { useAdmin } from "../../components/homeluxe/admin";
import Following from "../../components/homeluxe/visitor/Following";
import JoinPanel from "../../components/homeluxe/visitor/JoinPanel";
import "../../components/homeluxe/homeluxe.css";
import "../../components/homeluxe/visitor.css";

/**
 * A visitor's own page: the shops they follow and what they have been told.
 *
 * SIGNED OUT, THIS IS THE SIGN-UP PAGE rather than a redirect to one. Somebody
 * arriving here has already decided they want to follow a shop -- bouncing
 * them to /join and back is two navigations to accomplish nothing, and the
 * reason they came is the best possible thing to put next to the form.
 *
 * `useAdmin` is the session hook the admin uses, and there is nothing
 * admin-specific about it: it watches Supabase auth and reports who is signed
 * in. A visitor has no shops and no platform role, and every field this page
 * reads works out as "a signed-in person".
 */
export default function FollowingPage() {
  const { session, isSignedIn, loading, displayName, signOut } = useAdmin();

  return (
    <main className="luxe-page">
      <div className="luxe-top">
        <a className="luxe-wordmark" href="/">
          <strong>HomeLuxe 3D</strong>
          <span>virtual showroom</span>
        </a>
        <a className="luxe-btn ghost" href="/">
          Back to the house
        </a>
      </div>

      {loading && <p className="luxe-sub luxe-wide">Checking your session…</p>}

      {!loading && !isSignedIn && (
        <JoinPanel mode="register" onDone={() => window.location.reload()} />
      )}

      {!loading && isSignedIn && (
        <Following
          userId={session?.userId}
          displayName={displayName}
          onSignOut={async () => {
            await signOut();
            window.location.href = "/";
          }}
        />
      )}
    </main>
  );
}
