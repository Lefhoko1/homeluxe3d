import { useEffect, useState } from "react";

import { rowsToManifest } from "../../../lib/catalog/repository";
import { getSupabase } from "../../../lib/supabase/client";
import { featuredCards } from "./showcaseData";

/**
 * What the platform has chosen to lead the front page with.
 *
 * READ LIVE FROM `v_landing_showcase`, not from a published snapshot and not
 * from a list in the code. An admin ranking a placement in the admin module
 * changes this page on the next reload -- featuring moves nothing in the
 * house, so it has no business waiting for a scene publish.
 *
 * THE ROOM RECTANGLES COME FROM THE WALK'S OWN MANIFEST. `collision.json` is
 * what the showroom pushes a walking visitor out of; using it here means the
 * camera is placed inside the same rectangle the walls actually enclose, so
 * it cannot end up standing in a wall when a room is resized in Blender.
 *
 * NOTHING FEATURED IS A LEGITIMATE ANSWER, and it returns an empty list
 * rather than inventing something to show. The hero falls back to the floor
 * plan, which is drawn from the same manifest and is equally true.
 */
export function useFeatured(scene = "3bed") {
  const [featured, setFeatured] = useState([]);
  const [failed, setFailed] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    if (!supabase) {
      setFailed("The site is not connected to its database.");
      setLoading(false);

      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const [{ data, error }, collision] = await Promise.all([
          // Already ordered by rank inside the view, so no order() here --
          // the order is the admin's decision and it lives in the database.
          supabase.from("v_landing_showcase").select("*"),
          fetch("/models/house/collision.json").then((r) => r.json()),
        ]);

        if (error) throw new Error(error.message);
        if (cancelled) return;

        const manifest = rowsToManifest(data ?? [], scene);

        setFeatured(featuredCards(manifest, collision.rooms ?? [], scene));
      } catch (err) {
        if (!cancelled) setFailed(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scene]);

  return { featured, failed, loading };
}
