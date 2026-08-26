import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "./requireAuth.js";

// Takes the app's own db client and stories table rather than importing
// them directly, since schema.js is game-specific data and stays in each app.
export function createStoriesRouter(db, stories) {
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

  return router;
}
