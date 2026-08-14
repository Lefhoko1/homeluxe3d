"""Apply the migration and seed to a Supabase Postgres database.

The dashboard SQL editor works fine for a one-off, but this exists so the
schema can be applied repeatably -- from a script, a teammate's machine, or
CI -- without pasting a thousand lines into a web form.

    set SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
    python supabase/apply.py            # migration + seed
    python supabase/apply.py --verify   # just report what is there

The connection string and password are read from the environment and never
written to disk. The database password is NOT the anon key: it bypasses
row-level security completely, so it belongs in a shell session or a secret
store, never in the repo.
"""

from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

MIGRATION = os.path.join(HERE, "migrations", "0001_init.sql")
SEED = os.path.join(HERE, "seed.sql")

# Tables the verify step expects to find, with what they mean.
EXPECTED = [
    ("shops", "advertisers"),
    ("products", "things for sale"),
    ("product_variants", "models and finishes"),
    ("scenes", "tourable environments"),
    ("rooms", "rooms in a scene"),
    ("placement_slots", "advertising inventory"),
    ("placements", "what is standing where"),
    ("campaigns", "scheduled runs"),
    ("shop_follows", "followers"),
    ("notifications", "fan-out"),
    ("interaction_events", "analytics"),
    ("enquiries", "leads"),
]


def connect(url: str):
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 is not installed:  python -m pip install psycopg2-binary")
        raise SystemExit(2)
    return psycopg2.connect(url)


def run_file(cur, path: str) -> None:
    """Execute a whole .sql file in one go.

    psycopg2 sends the file as a single command string, which Postgres runs as
    an implicit transaction -- so a failure part-way leaves nothing behind
    rather than a half-built schema.
    """
    with open(path, "r", encoding="utf-8") as handle:
        cur.execute(handle.read())


def verify(cur) -> int:
    print("\nSchema")
    print("-" * 62)
    missing = 0
    for table, meaning in EXPECTED:
        cur.execute(
            "select to_regclass(%s) is not null", (f"public.{table}",)
        )
        exists = cur.fetchone()[0]
        count = ""
        if exists:
            cur.execute(f"select count(*) from public.{table}")
            count = f"{cur.fetchone()[0]:>6} rows"
        else:
            missing += 1
        mark = "ok  " if exists else "MISS"
        print(f"  {mark} {table:<20} {count:<12} {meaning}")

    # Row-level security must be on everywhere, or the whole tenancy model is
    # decorative. Worth failing loudly about.
    cur.execute(
        """
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by 1
        """
    )
    unprotected = [r[0] for r in cur.fetchall()]
    print("-" * 62)
    if unprotected:
        print(f"  WARNING: row-level security OFF on: {', '.join(unprotected)}")
    else:
        print("  row-level security: enabled on every public table")

    cur.execute("select count(*) from pg_policies where schemaname = 'public'")
    print(f"  policies: {cur.fetchone()[0]}")
    return missing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true",
                        help="report what exists, change nothing")
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("SUPABASE_DB_URL is not set.\n")
        print("  Supabase dashboard -> Project Settings -> Database -> Connection string")
        print("  export SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres'")
        return 2

    conn = connect(url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            if args.verify:
                return 1 if verify(cur) else 0

            if not args.seed_only:
                print(f"applying {os.path.relpath(MIGRATION, HERE)} ...")
                run_file(cur, MIGRATION)
                print("  schema created")

            print(f"applying {os.path.relpath(SEED, HERE)} ...")
            run_file(cur, SEED)
            print("  seeded")

            missing = verify(cur)
            return 1 if missing else 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
