import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "@roleplayer/server-core/app.js";
import { SESSION_SECRET, users } from "@roleplayer/server-core/users.js";
import authRouter from "@roleplayer/server-core/authRouter.js";
import { createStoriesRouter } from "@roleplayer/server-core/storiesRouter.js";
import { createSettingsRouter } from "@roleplayer/server-core/settingsRouter.js";
import { createCombatsRouter } from "@roleplayer/server-core/combat/index.js";
import conversationsRouter, { runNarrativePasses } from "./routes/conversations.js";
import { db } from "./lib/db.js";
import { stories, conversations, messages, combats, combatMessages } from "./db/schema.js";
import { getSettings, setDiscordNotificationsEnabled } from "./lib/settings.js";
import { generateBlueprint, generateCombatReply, generateCombatEnd, buildPlayerRoster } from "./lib/claude.js";
import { combatGame } from "./combat/index.js";
import { notifyOtherPlayer, formatPlayerMessage, formatDmReply } from "./lib/discordNotify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../client/dist");
const PORT = process.env.PORT || 3001;

// Combat mode (specs/combat-encounters.md): the shared engine's router,
// handed this app's tables, its combat game module (./combat/), its
// pre-bound combat DM, its roster builder, and the narrative passes to run
// once over each fight's outcome.
const combatsRouter = createCombatsRouter({
  db,
  tables: { combats, combatMessages, conversations, messages, stories },
  game: combatGame,
  generateCombatReply,
  generateCombatEnd,
  buildRoster: (conversation) =>
    buildPlayerRoster(
      conversation.characterNames,
      conversation.characterDetails,
      conversation.characterDescriptions,
      conversation.characterGear,
      conversation.characterHp,
    ),
  notifyOtherPlayer,
  formatPlayerMessage,
  formatDmReply,
  afterCombatEnded: runNarrativePasses,
  users,
});

const app = createApp({
  authRouter,
  conversationsRouter,
  storiesRouter: createStoriesRouter(db, stories, { generateBlueprint }),
  settingsRouter: createSettingsRouter(getSettings, setDiscordNotificationsEnabled),
  combatsRouter,
  sessionSecret: SESSION_SECRET,
  clientDistDir: CLIENT_DIST,
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
