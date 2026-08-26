import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

// Takes the app's own schema module rather than importing one directly,
// since schema.js is game-specific data and stays in each app.
export function createDb(schema) {
  return drizzle(process.env.DATABASE_URL, { schema });
}
