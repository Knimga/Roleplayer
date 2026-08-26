import { createDb } from "@roleplayer/server-core/db.js";
import * as schema from "../db/schema.js";

export const db = createDb(schema);
