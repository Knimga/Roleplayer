import "dotenv/config";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Runs migrations via drizzle-orm's migrator directly instead of the
// `drizzle-kit migrate` CLI — that CLI silently stops (or exits 1 with no
// message) against Render's Postgres, whether or not SSL is configured,
// making a real failure indistinguishable from a terminal-rendering quirk.
// This surfaces the actual error if one occurs.
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});
const db = drizzle(pool);

try {
  // Tracking table lives inside this app's own schema (not the drizzle-orm
  // default "drizzle" schema) so the cyberpunk_red-scoped role never needs
  // access outside its own schema, and the two apps share no DB object at all.
  await migrate(db, { migrationsFolder, migrationsSchema: "cyberpunk_red" });
  console.log("Migrations applied successfully.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
