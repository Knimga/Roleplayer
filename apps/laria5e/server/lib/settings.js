import { db } from "./db.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function getSettings() {
  let [row] = await db.select().from(appSettings).limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({}).returning();
  }
  return row;
}

export async function setDiscordNotificationsEnabled(enabled) {
  const { id } = await getSettings();
  const [row] = await db
    .update(appSettings)
    .set({ discordNotificationsEnabled: enabled })
    .where(eq(appSettings.id, id))
    .returning();
  return row;
}
