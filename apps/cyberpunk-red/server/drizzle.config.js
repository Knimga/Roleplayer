import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Render's Postgres requires SSL on its External Database URL (used here for
// migrating from outside Render's network), but local Docker Postgres
// doesn't support SSL at all — so this only turns SSL on for a non-local
// host, rather than always-on breaking local migrations or always-off
// silently failing against Render (drizzle-kit doesn't surface that failure;
// it just stops after "Using 'pg' driver for database querying").
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

export default defineConfig({
  schema: "./db/schema.js",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
  },
});
