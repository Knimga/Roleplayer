import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations } from "./schema.js";

const [existing] = await db.select().from(conversations).where(eq(conversations.isMain, true));

if (existing) {
  console.log(`Main conversation already exists: ${existing.id}`);
} else {
  const [created] = await db
    .insert(conversations)
    .values({ name: "Main", isMain: true })
    .returning();
  console.log(`Created main conversation: ${created.id}`);
}

process.exit(0);
