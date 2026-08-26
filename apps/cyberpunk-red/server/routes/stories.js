import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { stories } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.patch("/:id", async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const [updated] = await db
    .update(stories)
    .set({ name: name.trim() })
    .where(eq(stories.id, req.params.id))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "Story not found" });
  }
  res.json({ id: updated.id, name: updated.name });
});

export default router;
