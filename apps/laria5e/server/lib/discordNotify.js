import { users } from "@roleplayer/server-core/users.js";
import { createDiscordNotifier, formatPlayerMessage, formatDmReply, formatNewChapter } from "@roleplayer/server-core/discordNotify.js";
import { getSettings } from "./settings.js";

export { formatPlayerMessage, formatDmReply, formatNewChapter };

export const notifyOtherPlayer = createDiscordNotifier({
  users,
  getSettings,
  appLabel: "Laria 5e",
  appUrl: process.env.APP_URL || "http://localhost:5173",
});
