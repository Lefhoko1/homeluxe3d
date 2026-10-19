import { useCallback, useEffect, useState } from 'react';

import { AdminSession } from '../../../lib/auth/AdminSession';

/**
 * The signed-in user, for the components that care.
 *
 * One subscription for the whole app: `onAuthStateChange` fires on sign-in,
 * sign-out and every token refresh, so signing out in another tab closes the
 * toolbar here too, and an expired token cannot leave the admin looking
 * signed in while every save fails.
 */
export function useAdmin() {
  const [session, setSession] = useState(() => new AdminSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    AdminSession.current().then((current) => {
      if (cancelled) return;
      setSession(current);
      setLoading(false);
    });

    const unsubscribe = AdminSession.onChange((next) => {
      if (!cancelled) setSession(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const next = await AdminSession.signIn(email, password);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    setSession(await AdminSession.signOut());
  }, []);

  return {
    session,
    loading,
    isSignedIn: session.isSignedIn,
    // The toolbar appears for anyone who can actually change something --
    // a platform admin, or a shop's own owner/manager.
    isAdmin: session.canAdminister,
    isPlatformAdmin: session.isPlatformAdmin,
    shops: session.manageableShops,
    displayName: session.displayName,
    signIn,
    signOut,
  };
}

export default useAdmin;
