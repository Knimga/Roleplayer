import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "@roleplayer/server-core/app.js";
import { SESSION_SECRET } from "@roleplayer/server-core/users.js";
import authRouter from "@roleplayer/server-core/authRouter.js";
import { createStoriesRouter } from "@roleplayer/server-core/storiesRouter.js";
import { createSettingsRouter } from "@roleplayer/server-core/settingsRouter.js";
import conversationsRouter from "./routes/conversations.js";
import { db } from "./lib/db.js";
import { stories } from "./db/schema.js";
import { getSettings, setDiscordNotificationsEnabled } from "./lib/settings.js";
import { generateCampaignBible } from "./lib/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../client/dist");
const PORT = process.env.PORT || 3001;

const app = createApp({
  authRouter,
  conversationsRouter,
  storiesRouter: createStoriesRouter(db, stories, { generateCampaignBible }),
  settingsRouter: createSettingsRouter(getSettings, setDiscordNotificationsEnabled),
  sessionSecret: SESSION_SECRET,
  clientDistDir: CLIENT_DIST,
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
