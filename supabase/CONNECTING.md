# Connecting to this project

## The connection that works from here

The **direct** host `db.<ref>.supabase.co` is **IPv6-only**. On a network
without IPv6 it does not resolve at all, which looks like a wrong hostname:

```
db.mqpmmsydsnwetzqejzbe.supabase.co  A    -> none
                                     AAAA -> 2a05:d016:...
```

Use the **session pooler** instead, which is IPv4:

```
host      aws-0-eu-north-1.pooler.supabase.com
port      5432                    (session mode -- required for DDL)
user      postgres.mqpmmsydsnwetzqejzbe
database  postgres
```

The region is **eu-north-1**. It is not guessable — every other region
answers `tenant/user not found`, which is easy to mistake for a bad password.

Port 6543 is the *transaction* pooler; it does not support the session state
migrations need. Use 5432.

## Applying

```
python supabase/apply.py             # migrations + seed, then verify
python supabase/apply.py --seed-only # seed only, schema already applied
python supabase/apply.py --verify    # report only
```

`SUPABASE_DB_URL` comes from the environment, or -- if it is not set there --
from a line in `.env.local`:

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:PASSWORD@aws-0-eu-north-1.pooler.supabase.com:5432/postgres
```

`.env.local` is gitignored and already holds this project's other
credentials. Putting it there rather than exporting it means the seed can be
applied repeatably by whoever is driving, without the password living in a
shell history.

The password contains `+` and `=`, which are not URL-safe, so pass discrete
parameters rather than a URI if you hit auth errors that look like a wrong
password.

## There is no fallback

The app reads the catalogue from this database and from nowhere else. If the
seed has not been applied, the page says so across the top of the window
rather than quietly dressing the house from `catalog.json`. See the note at
the top of `lib/catalog/repository.js`.

## Migrations are idempotent

Everything is `create ... if not exists`, enums are guarded by a `do` block,
and policies and triggers are dropped before being recreated. Re-running a
migration is safe.

One exception worth knowing: `v_live_placements` is **dropped** and recreated
in `0002`, because `create or replace view` cannot add or reorder columns.

## This project is shared

It already contains a **second application** — 33 Prisma-managed tables
(`User`, `Lesson`, `Story`, `PortfolioProject`, …) with `_prisma_migrations`
and real user rows.

There is no collision: those are PascalCase, these are snake_case. But note
that **those tables have row-level security switched off**, so anything
holding the anon key can read them. That is a decision for whoever owns that
app; it does not affect these tables, which all have RLS on.

If HomeLuxe is meant to stand alone, give it its own Supabase project and
re-run the two migrations plus the seed there.
