-- Bootstraps the two app-scoped schemas and roles for local dev.
-- Runs once, automatically, the first time the postgres container starts
-- against an empty data volume (docker-entrypoint-initdb.d convention) -
-- it will NOT re-run on an existing volume. If you need to re-apply this
-- after editing it, either drop the docker volume and restart, or run the
-- statements below by hand against the running container.
--
-- Each app gets its own schema and its own login role, scoped to only that
-- schema (no access to the other app's schema, and no fallback to public -
-- each role's search_path is set to its own schema only). Migration tracking
-- tables live inside each app's own schema too (see migrationsSchema in
-- each app's server/db/migrate.mjs), so no shared bookkeeping table either.

-- Cyberpunk Red
CREATE SCHEMA IF NOT EXISTS cyberpunk_red;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cyberpunk_red_app') THEN
    CREATE ROLE cyberpunk_red_app WITH LOGIN PASSWORD 'dev_cyberpunk_pw';
  END IF;
END
$$;
ALTER ROLE cyberpunk_red_app SET search_path = cyberpunk_red;
GRANT USAGE, CREATE ON SCHEMA cyberpunk_red TO cyberpunk_red_app;
-- drizzle-orm's migrator always issues `CREATE SCHEMA IF NOT EXISTS` for its
-- migrationsSchema, even when it already exists - Postgres checks database-
-- level CREATE privilege before evaluating IF NOT EXISTS, so this is needed
-- purely to let that no-op statement succeed (it does not grant access into
-- any *other* schema in the database).
GRANT CREATE ON DATABASE roleplayer TO cyberpunk_red_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA cyberpunk_red GRANT ALL ON TABLES TO cyberpunk_red_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA cyberpunk_red GRANT ALL ON SEQUENCES TO cyberpunk_red_app;

-- Laria 5e
CREATE SCHEMA IF NOT EXISTS laria5e;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'laria5e_app') THEN
    CREATE ROLE laria5e_app WITH LOGIN PASSWORD 'dev_laria5e_pw';
  END IF;
END
$$;
ALTER ROLE laria5e_app SET search_path = laria5e;
GRANT USAGE, CREATE ON SCHEMA laria5e TO laria5e_app;
GRANT CREATE ON DATABASE roleplayer TO laria5e_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA laria5e GRANT ALL ON TABLES TO laria5e_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA laria5e GRANT ALL ON SEQUENCES TO laria5e_app;
