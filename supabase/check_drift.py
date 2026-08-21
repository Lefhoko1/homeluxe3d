"""Does the database still say what Blender authored?

    python supabase/check_drift.py

WHY THIS EXISTS. The pipeline runs one way:

    plan + catalogue  ->  catalog.json, slots.json  ->  seed.sql  ->  database

and only the first arrow is automatic. `export_navigation.py` rewrites the
manifests; nothing downstream regenerates or applies the seed. So a change to
where a sofa stands lands in the manifests, the browser's route and collision
model pick it up, and the database keeps yesterday's coordinates -- silently,
because both halves are internally consistent and neither can see the other.

That is not hypothetical. The recliner sat at 9,650 in the database and 9,400
in the catalogue for several commits, and it was only noticed because a
debugging script happened to print both numbers side by side.

THE DATABASE CANNOT DETECT THIS ON ITS OWN. It has no idea what catalog.json
says, and a table recording the last-seeded values would go stale in exactly
the case that matters -- if the seed has not been run, the record of what was
seeded is stale too. Drift can only be seen from where both sides are
visible, which is here.

Exits 1 when they disagree, so it can be a build step rather than a habit.
"""

from __future__ import annotations

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "blender"))

CATALOG = os.path.join(REPO, "public", "models", "products", "catalog.json")

#: How far apart two coordinates may be before it counts, in millimetres.
#:
#: Not zero: the manifests round to four decimal places of a metre on the way
#: out and back, so an exact comparison reports drift that is really 0.05mm of
#: floating point. Half a millimetre is far below anything anybody could see
#: and far above anything rounding can invent.
TOLERANCE_MM = 0.5


def _connect():
    """The same connection `apply.py` uses, or None with a reason."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("apply", os.path.join(HERE, "apply.py"))
    apply = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(apply)

    url = apply.db_url()
    if not url:
        print("  ! SUPABASE_DB_URL is not set, so there is nothing to compare against.")
        return None

    import psycopg2

    conn = psycopg2.connect(url)
    conn.autocommit = True
    return conn


def authored_placements() -> dict:
    """Where the catalogue says each product stands, in plan millimetres."""
    with io.open(CATALOG, encoding="utf-8") as handle:
        catalog = json.load(handle)

    out = {}
    for placement in catalog.get("houses", {}).get("3bed", []):
        if placement.get("isFinish") or not placement.get("position"):
            continue
        x_m, _y, z_m = placement["position"]
        out[placement["product"]] = (
            round(x_m * 1000.0, 1),
            round(-z_m * 1000.0, 1),
            float(placement.get("rotationY", 0.0) or 0.0),
        )
    return out


def authored_slots() -> dict:
    """Every slot the plan declares, by its stable external id."""
    from houseluxe.config.slots_3bed import SLOTS

    return {s.id: (round(s.x, 1), round(s.y, 1)) for s in SLOTS}


def compare(conn) -> int:
    cur = conn.cursor()
    problems = 0

    # -- what stands where -------------------------------------------------
    want = authored_placements()
    cur.execute(
        """select qualified_id, x_mm, y_mm, rotation_deg
             from v_live_placements
            where model_url is not null"""
    )
    have = {r[0]: (float(r[1]), float(r[2]), float(r[3] or 0)) for r in cur.fetchall()}

    rows = []
    for product, wanted in sorted(want.items()):
        got = have.get(product)
        if got is None:
            rows.append((product, f"{wanted[0]:.0f},{wanted[1]:.0f}", "not placed", False))
            problems += 1
            continue
        moved = (
            abs(got[0] - wanted[0]) > TOLERANCE_MM
            or abs(got[1] - wanted[1]) > TOLERANCE_MM
            or abs(((got[2] - wanted[2] + 180) % 360) - 180) > 0.5
        )
        if moved:
            problems += 1
        rows.append((
            product,
            f"{wanted[0]:.0f},{wanted[1]:.0f} @{wanted[2]:.0f}",
            f"{got[0]:.0f},{got[1]:.0f} @{got[2]:.0f}",
            not moved,
        ))

    print(f"\n  {'product':<40}{'catalogue':>20}{'database':>20}   ")
    print("  " + "-" * 84)
    for product, wanted, got, ok in rows:
        mark = "" if ok else "   <-- DRIFTED"
        print(f"  {product[:38]:<40}{wanted:>20}{got:>20}{mark}")

    # -- the inventory -----------------------------------------------------
    want_slots = authored_slots()
    cur.execute(
        """select external_id, x_mm, y_mm from placement_slots
            where external_id is not null and is_active"""
    )
    have_slots = {r[0]: (float(r[1]), float(r[2])) for r in cur.fetchall()}

    missing = sorted(set(want_slots) - set(have_slots))
    extra = sorted(set(have_slots) - set(want_slots))
    moved = sorted(
        code for code, xy in want_slots.items()
        if code in have_slots
        and (abs(have_slots[code][0] - xy[0]) > TOLERANCE_MM
             or abs(have_slots[code][1] - xy[1]) > TOLERANCE_MM)
    )

    print(f"\n  slots: {len(want_slots)} authored, {len(have_slots)} active in the database")
    for label, codes in (("never seeded", missing), ("no longer authored", extra),
                         ("moved since seeding", moved)):
        if codes:
            problems += len(codes)
            print(f"    ! {len(codes)} {label}: {', '.join(codes[:6])}"
                  + (f" and {len(codes) - 6} more" if len(codes) > 6 else ""))
    if not (missing or extra or moved):
        print("    every authored slot is in the database, in the right place")

    return problems


def main() -> int:
    conn = _connect()
    if conn is None:
        return 0                       # nothing to check is not a failure

    problems = compare(conn)
    conn.close()

    if problems:
        print(
            f"\n  ! {problems} difference(s). The database is not showing what the\n"
            "    catalogue says. Regenerating the manifests does NOT reseed --\n"
            "    that arrow of the pipeline is manual:\n\n"
            "        python supabase/generate_seed.py\n"
            "        python supabase/apply.py --seed-only\n"
        )
        return 1

    print("\n  the database agrees with the catalogue and the plan\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
