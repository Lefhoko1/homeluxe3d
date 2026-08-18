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

MIGRATIONS_DIR = os.path.join(HERE, "migrations")
SEED = os.path.join(HERE, "seed.sql")


def migrations() -> list[str]:
    """Every migration, in order.

    FOUND BY LISTING, NOT BY NAMING. This pointed at `0001_init.sql` alone,
    which was true when there was one migration and quietly false from the
    day there were two: a database built with this script got the tables and
    none of the scoping, promotions, batches or views added since, and the
    failure only shows up later as an empty catalogue.

    The numeric prefix is what orders them, so a new migration needs nothing
    here but a filename.
    """
    return [
        os.path.join(MIGRATIONS_DIR, name)
        for name in sorted(os.listdir(MIGRATIONS_DIR))
        if name.endswith(".sql")
    ]

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


ENV_LOCAL = os.path.join(os.path.dirname(HERE), ".env.local")


def db_url() -> str | None:
    """The connection string, from the environment or from `.env.local`.

    THE FILE IS THE POINT. A database password cannot go in the repo and
    should not go in a shell history or a chat window either, but it has to
    reach this script somehow, and `export` does not survive between separate
    commands. `.env.local` is already gitignored and already holds this
    project's other credentials, so one line in it lets the seed be applied
    repeatably by whoever -- or whatever -- is driving, without the password
    being typed anywhere it will be kept.

    The environment still wins, so CI can set it and never touch a file.
    """
    from_env = os.environ.get("SUPABASE_DB_URL")
    if from_env:
        return from_env

    try:
        with open(ENV_LOCAL, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                if key.strip() == "SUPABASE_DB_URL":
                    # Quotes are how everyone writes a value with punctuation
                    # in it, and this password has plenty.
                    return value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass

    return None


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

    url = db_url()
    if not url:
        print("SUPABASE_DB_URL is not set.\n")
        print("  Supabase dashboard -> Project Settings -> Database -> Connection string")
        print("  Use the SESSION POOLER host (port 5432) -- see CONNECTING.md.\n")
        print("  Either export it:")
        print("    export SUPABASE_DB_URL='postgresql://USER:PASSWORD@HOST:5432/postgres'\n")
        print("  Or add one line to .env.local, which is gitignored:")
        print("    SUPABASE_DB_URL=postgresql://USER:PASSWORD@HOST:5432/postgres")
        return 2

    conn = connect(url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            if args.verify:
                return 1 if verify(cur) else 0

            if not args.seed_only:
                for path in migrations():
                    print(f"applying {os.path.relpath(path, HERE)} ...")
                    run_file(cur, path)
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
