# Spec: Production Schema Migration (public → cyberpunk_red)

## Status
Executed. The schema move and the three pending migrations (0012-0014) ran
successfully against the live Render database, with real data intact
throughout. Two things happened differently than this plan originally
assumed — see Outcome below.

## Why
The monorepo restructure's data-segregation requirement (both apps share one
Postgres instance, but each is confined to its own schema via its own scoped
Postgres role, enforced at the DB permission level) has been implemented and
verified for **local dev** — see the "Segregate Postgres per app" commit and
`infra/postgres/init/01-schemas-and-roles.sql`.

Cyberpunk Red's production database on Render is live with an active
roleplay campaign, and was never part of that local verification. Its tables
currently live in the default `public` schema, owned by Render's
auto-generated database role (the one already in `server/.env`'s External
Database URL comment), which has full access to the whole database — not
scoped to anything. This spec covers moving that live data into its own
`cyberpunk_red` schema and switching the running app over to a role that can
only see that schema, **without losing any campaign data**. Laria5e needs no
equivalent migration — it isn't deployed yet, so it'll just get its schema
and role created fresh whenever it first is.

## Why this is safe to do live
`ALTER TABLE ... SET SCHEMA` is a metadata-only operation — no rows are
copied or rewritten, so it's fast (milliseconds) regardless of table size.
Wrapping all of them in one transaction makes the whole move atomic: either
every table ends up in `cyberpunk_red` together, or (if anything errors) none
of them move and the app keeps working against `public` exactly as before.
Nothing here drops or rewrites a single row.

## Pre-flight
1. Take a fresh backup first, the same way as the existing ones in the old
   repo's `backups/` folder (e.g. `pg_dump` against the Render External
   Database URL). Don't skip this even though the migration is non-destructive
   — it's the safety net if something unrelated goes wrong mid-window.
2. Point `apps/cyberpunk-red/server/.env`'s `DATABASE_URL` at Render's
   **External Database URL** temporarily, the same way existing migrations
   are already run per `specs/render-hosting.md`'s "Migrations run manually"
   decision. Switch it back to the local URL afterward — same as any other
   manual migration run.
3. Connect with `psql` (or any client) using that URL and confirm what's
   actually there before assuming it matches `server/db/schema.js`:
   ```sql
   \dn                -- list schemas — confirm only "public" (and maybe "drizzle") has app data
   \dt public.*        -- confirm the exact table list — expect stories, conversations, messages, app_settings
   \dt drizzle.*        -- does a migrations-tracking schema/table exist here? (see note below)
   ```
   If the table list differs from the four below (e.g. a migration hasn't
   been applied to prod yet, or an old table still exists), adjust the
   `ALTER TABLE` list in step 2 below to match reality instead of copying it
   blindly.

## Migration
Run as one transaction against the Render External Database URL connection
from step 2 above:

```sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS cyberpunk_red;

ALTER TABLE public.stories       SET SCHEMA cyberpunk_red;
ALTER TABLE public.conversations SET SCHEMA cyberpunk_red;
ALTER TABLE public.messages      SET SCHEMA cyberpunk_red;
ALTER TABLE public.app_settings  SET SCHEMA cyberpunk_red;

-- Only if \dt drizzle.* in the pre-flight check showed this table exists —
-- drizzle-orm's migrator defaults to a "drizzle" schema for its own
-- migration-tracking table when no migrationsSchema is passed, which is
-- what prod has been using until now. Moving it alongside the app's own
-- tables keeps migration history intact once migrate.mjs starts using
-- migrationsSchema: "cyberpunk_red" (already changed in this repo — see
-- server/db/migrate.mjs) — otherwise the next prod migration run would
-- think no migrations have ever been applied and try to replay all of them.
ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA cyberpunk_red;

COMMIT;
```

Then create the scoped role (outside the transaction; role creation isn't
transactional in the same way and this ordering doesn't matter):

```sql
CREATE ROLE cyberpunk_red_app WITH LOGIN PASSWORD '<GENERATE_A_STRONG_RANDOM_PASSWORD>';
ALTER ROLE cyberpunk_red_app SET search_path = cyberpunk_red;

GRANT USAGE, CREATE ON SCHEMA cyberpunk_red TO cyberpunk_red_app;
-- Needed only because drizzle-orm's migrator unconditionally issues
-- `CREATE SCHEMA IF NOT EXISTS` for migrationsSchema on every run, even
-- when it already exists — Postgres checks database-level CREATE privilege
-- before evaluating IF NOT EXISTS. Grants no access to any other schema.
GRANT CREATE ON DATABASE <RENDER_DB_NAME> TO cyberpunk_red_app;

-- The tables above already existed before this role did, so (unlike a
-- fresh local install) ALTER DEFAULT PRIVILEGES alone won't cover them —
-- it only applies to objects created *after* it's set. Grant explicitly:
GRANT ALL ON ALL TABLES IN SCHEMA cyberpunk_red TO cyberpunk_red_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cyberpunk_red TO cyberpunk_red_app;

-- Covers any *future* migration that creates a new table, as long as that
-- migration is run authenticated as the same existing Render-owner role
-- named below (check the exact name in the Render dashboard's connection
-- info, or the External Database URL's username — it's the role currently
-- in server/.env's comment, not written out again here).
ALTER DEFAULT PRIVILEGES FOR ROLE <RENDER_DB_OWNER_ROLE> IN SCHEMA cyberpunk_red
  GRANT ALL ON TABLES TO cyberpunk_red_app;
ALTER DEFAULT PRIVILEGES FOR ROLE <RENDER_DB_OWNER_ROLE> IN SCHEMA cyberpunk_red
  GRANT ALL ON SEQUENCES TO cyberpunk_red_app;
```

Generate the password with something like `openssl rand -hex 24` — don't
reuse the local dev password (`dev_cyberpunk_pw`), and don't commit the
filled-in version of this script anywhere; fill the placeholder in only in
your terminal/psql session.

## Cutover
1. In the Render dashboard, update the cyberpunk-red server service's
   `DATABASE_URL` env var to the new role: same host/port/database name as
   before, just `cyberpunk_red_app` / the new password instead of the old
   owner role's credentials.
2. Redeploy or restart that service so it picks up the new env var.
3. Watch the live app for a few minutes: log in, open an existing
   conversation, send a message, confirm the dice roller and NPC rolls still
   work. All existing data (stories, chapters, character state) should be
   exactly as it was — this only moved *where* the tables live, not their
   contents.

## Rollback
The schema move itself is non-destructive and doesn't need to be undone to
recover — the fast fix if the new role/env var has a problem is to revert
Render's `DATABASE_URL` back to the original owner-role connection string.
Note that role's `search_path` defaults to `"$user", public`, which no
longer contains the app's tables after the move, so simply reverting the env
var isn't enough on its own — either:
- run `ALTER ROLE <RENDER_DB_OWNER_ROLE> SET search_path = cyberpunk_red, public;`
  once (keeps the new schema layout, just lets the old role see it too), or
- fully revert with `ALTER TABLE cyberpunk_red.<table> SET SCHEMA public;`
  for each of the four tables (and the migrations table, if moved), undoing
  the migration entirely.

## Open Questions
- Exact current table list in prod `public` schema — assumed to match
  `server/db/schema.js` (stories, conversations, messages, app_settings) but
  must be confirmed live in the pre-flight step, not assumed from this repo.
- Whether a `drizzle` schema/`__drizzle_migrations` table actually exists in
  prod — depends on how migrations have been run there historically; also a
  pre-flight discovery step, not assumed.

## Also pending: drop is_main_story (migration 0013)

A second, unrelated schema change is now also waiting on prod, from
backporting laria5e's main-story → story rename (see that commit): migration
`0013_thick_maginty.sql` drops the `is_main_story` column from
`conversations` — it's been fully redundant with `storyId` (set on every
Story chapter, null otherwise) since standalone conversations stopped being
creatable, and code no longer reads or writes it at all as of that commit.

Same story as the schema migration above: non-destructive (`DROP COLUMN` on
a column nothing reads anymore), already run and verified against local dev,
but not yet run against the live Render database — needs the same "point
`server/.env` at the External Database URL, run `npm run db:migrate`,
backup first" workflow, with the same explicit-sign-off-before-touching-prod
rule. Can reasonably be bundled into the same maintenance window as the
schema-segregation migration above rather than done separately, since both
are quick, reviewed, non-destructive changes to the same database.

## Also pending: discord_notifications_enabled default flips to off (migration 0014)

A third change, from making Discord notifications shared code
(`packages/server-core/src/discordNotify.js`) and requiring the feature
default off on first deploy: migration `0014_loud_kid_colt.sql` changes
`app_settings.discord_notifications_enabled`'s column default from `true`
to `false`. Already run and verified against local dev.

**This one needs a decision, not just a run**, because `ALTER COLUMN ...
SET DEFAULT` only changes what a *future* `INSERT` gets when it doesn't
specify a value — it does not touch any row that already exists. Cyberpunk
Red's prod database almost certainly already has an `app_settings` row
(both players have real webhook URLs configured, and the feature has
presumably been in active use), so running just this migration against prod
would change nothing observable there — the existing row keeps whatever
value it already has, `true` by the old default unless someone explicitly
turned it off already.

Before running this against prod, check the live row's current value first
(`SELECT discord_notifications_enabled FROM app_settings;`) and decide:
- Leave the existing prod row alone (migration only affects hypothetical
  future fresh installs) — the simplest option, and the right one if
  Discord pings are wanted to keep working exactly as they do today.
- Or explicitly `UPDATE app_settings SET discord_notifications_enabled =
  false;` if the intent is for the live app to actually go quiet by
  default too, not just future deployments — this is a real behavior
  change to the live app/active campaign, so it needs the same sign-off as
  everything else in this doc, not just being bundled in because it's
  convenient.

## Outcome

Executed live. `stories`/`conversations`/`messages`/`__drizzle_migrations`
moved into `cyberpunk_red` via the `ALTER TABLE ... SET SCHEMA` transaction
exactly as planned — atomic, no data loss, verified against the pre-migration
`pg_dump` backup afterward (row counts matched). `app_settings` didn't exist
in prod at all before this (migration 0012 creates it) — the plan's Open
Question about the exact prod table list was resolved to "3 tables, no
`app_settings`," not the 4 originally assumed.

Two things didn't go as planned, both around role privilege:

- **The role-creation/scoping section above was never actually run as
  written.** Render's dashboard doesn't support raw `CREATE ROLE` — instead
  we used Render's own "add a database user" feature for both
  `cyberpunkred_postgres_db_user` and `laria5e_postgres_db_user`. That
  automatically makes each one a member of the database's owner role (with
  an automatic `SET ROLE` on connect) but **without `ADMIN OPTION`** — so
  the `REVOKE ... FROM ...` / `ALTER ROLE ... SET search_path` /
  `ALTER ROLE ... RESET ROLE` statements above all fail with "permission
  denied," for either role, run by either role. Neither of us can grant
  ourselves that privilege; it needs a Render support request. See
  `steering/tech.md`'s "Open gap: prod DB roles aren't actually
  schema-isolated" callout — both apps' Postgres roles currently have full
  read/write access to both schemas, not just their own. The `GRANT ...
  ON SCHEMA/TABLES/SEQUENCES` statements above still ran fine (granting on
  an object you own doesn't need `ADMIN OPTION` on the grantee), they're
  just redundant on top of the un-revocable owner access.
- **`search_path` is set via each app's `DATABASE_URL` connection string
  instead of `ALTER ROLE`**, for the same reason —
  `?options=-c%20search_path%3D<schema>` appended to the connection string
  achieves the same practical effect (the app's queries resolve to its own
  schema without needing every query schema-qualified) without needing any
  elevated privilege, since it's a client-supplied startup parameter, not a
  persistent server-side role attribute. This is **not** a security
  boundary, just a default-resolution convenience — see the tech.md
  callout.

Laria 5e's schema was created and migrated (all 18 migrations, fresh) the
same session, using the same `options`-based `search_path` approach — no
live data to move there, just a fresh schema.
