import { Router } from "express";
import { requireAuth } from "./requireAuth.js";

// Takes the already-instantiated getSettings/setDiscordNotificationsEnabled
// functions rather than a db/schema pair, since each app's own lib/settings.js
// is what binds createSettingsLib to its own db + appSettings table.
export function createSettingsRouter(getSettings, setDiscordNotificationsEnabled) {
  const router = Router();

  router.use(requireAuth);

  router.get("/", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    res.json(await getSettings());
  });

  router.patch("/", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
    const { discordNotificationsEnabled } = req.body ?? {};
    if (typeof discordNotificationsEnabled !== "boolean") {
      return res.status(400).json({ error: "discordNotificationsEnabled must be true or false" });
    }
    res.json(await setDiscordNotificationsEnabled(discordNotificationsEnabled));
  });

  return router;
}
