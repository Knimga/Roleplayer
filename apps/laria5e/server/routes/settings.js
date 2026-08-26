import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getSettings, setDiscordNotificationsEnabled } from "../lib/settings.js";

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

export default router;
