import { eq } from "drizzle-orm";

// Takes the app's own db client and appSettings table rather than importing
// them directly, since schema.js is game-specific data and stays in each app.
export function createSettingsLib(db, appSettings) {
  async function getSettings() {
    let [row] = await db.select().from(appSettings).limit(1);
    if (!row) {
      [row] = await db.insert(appSettings).values({}).returning();
    }
    return row;
  }

  async function setDiscordNotificationsEnabled(enabled) {
    const { id } = await getSettings();
    const [row] = await db
      .update(appSettings)
      .set({ discordNotificationsEnabled: enabled })
      .where(eq(appSettings.id, id))
      .returning();
    return row;
  }

  return { getSettings, setDiscordNotificationsEnabled };
}
