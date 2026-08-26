import { users } from "@roleplayer/server-core/users.js";
import { createDiscordNotifier, formatPlayerMessage, formatDmReply, formatNewChapter } from "@roleplayer/server-core/discordNotify.js";
import { getSettings } from "./settings.js";

export { formatPlayerMessage, formatDmReply, formatNewChapter };

export const notifyOtherPlayer = createDiscordNotifier({
  users,
  getSettings,
  appLabel: "Cyberpunk Red",
  appUrl: process.env.APP_URL || "https://cyberpunk-red-rp.onrender.com/",
});
