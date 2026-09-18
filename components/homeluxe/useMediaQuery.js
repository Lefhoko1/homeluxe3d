import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept current as the window changes.
 *
 * FALSE ON THE SERVER. There is no screen to measure during the prerender, so
 * the first paint is the desktop layout and a phone switches over as soon as
 * the page hydrates -- the same moment the 3D view starts, so nobody sees it.
 *
 * Safari before 14 has only the old addListener/removeListener on a
 * MediaQueryList, and iPhones stay on old Safari for years, so both are
 * handled.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      if (list.addEventListener) {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener(onChange);
      return () => list.removeListener(onChange);
    },
    [query],
  );

  const read = () =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);

  return useSyncExternalStore(subscribe, read, () => false);
}
