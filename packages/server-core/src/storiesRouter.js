import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "./requireAuth.js";
import { initializeTrackers, advanceBeatsTracker, revertBeatsTracker } from "./campaignBible.js";

// Takes the app's own db client and stories table rather than importing
// them directly, since schema.js is game-specific data and stays in each app.
// generateCampaignBible is the app's own pre-bound createCampaignBibleGenerator
// instance (client/model/gameLabel/MCP tools already supplied) - optional
// since not every caller needs the Campaign Bible routes wired up.
export function createStoriesRouter(db, stories, { generateCampaignBible } = {}) {
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

  // Generates a fresh Campaign Bible draft - NOT persisted. The admin reviews
  // (and can edit) this before it's ever created, mirroring how
  // /:id/summarize + /:id/new-chapter split "generate a preview" from
  // "persist the (possibly edited) result" into two separate calls.
  router.post("/:id/campaign-bible/generate", async (req, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Only the admin can manage the Campaign Bible" });
    }
    const { campaignInput } = req.body ?? {};
    if (!campaignInput || typeof campaignInput !== "string" || !campaignInput.trim()) {
      return res.status(400).json({ error: "Campaign input is required" });
    }

    const [story] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, req.params.id));
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    try {
      const trimmedInput = campaignInput.trim();
      const bible = await generateCampaignBible(trimmedInput);
      res.json({ campaignInput: trimmedInput, ...bible });
    } catch (err) {
      console.error("Campaign Bible generation failed:", err);
      res.status(502).json({ error: "Campaign Bible generation failed. Try again." });
    }
  });

  // Persists the (possibly admin-edited) generated content and initializes
  // the mutable beats tracker. This is the only write path for
  // campaignBible - it's immutable narrative content from here on;
  // beatsTracker is what changes during play (Phase 3). (Villain's Plan
  // intentionally not generated/persisted - deferred, see
  // specs/future-features/campaign-bible-villain-plan.md.)
  router.post("/:id/campaign-bible/approve", async (req, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Only the admin can manage the Campaign Bible" });
    }
    const { campaignInput, centralConflict, beats } = req.body ?? {};
    if (!campaignInput || !centralConflict || !beats) {
      return res.status(400).json({ error: "Incomplete Campaign Bible content" });
    }

    const { beatsTracker } = initializeTrackers({ beats });
    const campaignBible = { campaignInput, centralConflict };

    const [updated] = await db
      .update(stories)
      .set({ campaignBible, beatsTracker })
      .where(eq(stories.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Story not found" });
    }
    res.json({
      campaignBible: updated.campaignBible,
      beatsTracker: updated.beatsTracker,
    });
  });

  // Manual admin override for the Beats tab's Advance/Un-advance controls -
  // same advanceBeatsTracker/revertBeatsTracker pure functions the automatic
  // tracker-update pass (Phase 3) already uses, just triggered directly by
  // the admin instead of Claude's own judgment. Shares one handler since the
  // two only differ in which transform runs; both no-op (200, unchanged
  // tracker) at their respective boundaries rather than erroring, since
  // "already exhausted" / "already on beat_1" aren't really error states -
  // the frontend disables the button in those cases anyway, this is just the
  // server-side mirror of that guard.
  function createBeatsMoveRoute(transform) {
    return async (req, res) => {
      if (!req.user.isAdmin) {
        return res.status(403).json({ error: "Only the admin can manage the Campaign Bible" });
      }

      const [story] = await db
        .select({ beatsTracker: stories.beatsTracker })
        .from(stories)
        .where(eq(stories.id, req.params.id));
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      if (!story.beatsTracker) {
        return res.status(400).json({ error: "No Campaign Bible exists for this Story" });
      }

      const beatsTracker = transform(story.beatsTracker);
      await db.update(stories).set({ beatsTracker }).where(eq(stories.id, req.params.id));
      res.json({ beatsTracker });
    };
  }

  router.post("/:id/campaign-bible/beats/advance", createBeatsMoveRoute(advanceBeatsTracker));
  router.post("/:id/campaign-bible/beats/revert", createBeatsMoveRoute(revertBeatsTracker));

  // Read-only fetch for the admin-only viewing tabs (Bible Text, Beats) -
  // lets the admin watch live tracker status while the feature is new,
  // independent of the generate/approve creation flow.
  router.get("/:id/campaign-bible", async (req, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Only the admin can manage the Campaign Bible" });
    }

    const [story] = await db
      .select({
        campaignBible: stories.campaignBible,
        beatsTracker: stories.beatsTracker,
      })
      .from(stories)
      .where(eq(stories.id, req.params.id));

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    res.json(story);
  });

  return router;
}
