import { createSettingsLib } from "@roleplayer/server-core/settings.js";
import { db } from "./db.js";
import { appSettings } from "../db/schema.js";

export const { getSettings, setDiscordNotificationsEnabled } = createSettingsLib(db, appSettings);
