import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "./requireAuth.js";
import { initializeSituation, advanceMilestone, revertMilestone, validateSituationFields } from "./blueprint.js";

// Takes the app's own db client and stories table rather than importing
// them directly, since schema.js is game-specific data and stays in each app.
// generateBlueprint is the app's own pre-bound createBlueprintGenerator
// instance (client/model/gameLabel/MCP tools already supplied) - optional
// since not every caller needs the Blueprint routes wired up.
export function createStoriesRouter(db, stories, { generateBlueprint } = {}) {
  const router = Router();

  router.use(requireAuth);

  function requireAdmin(req, res) {
    if (req.user.isAdmin) return true;
    res.status(403).json({ error: "Only the admin can manage the campaign" });
    return false;
  }

  async function loadCampaign(id) {
    const [story] = await db
      .select({ blueprint: stories.blueprint, situation: stories.situation })
      .from(stories)
      .where(eq(stories.id, id));
    return story ?? null;
  }

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

  // Generates a fresh Blueprint draft - NOT persisted. The admin reviews (and
  // can edit) this before it's ever created, mirroring how /:id/summarize +
  // /:id/new-chapter split "generate a preview" from "persist the (possibly
  // edited) result" into two separate calls.
  router.post("/:id/blueprint/generate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
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
      const blueprint = await generateBlueprint(trimmedInput);
      res.json({ campaignInput: trimmedInput, ...blueprint });
    } catch (err) {
      console.error("Blueprint generation failed:", err);
      res.status(502).json({ error: "Blueprint generation failed. Try again." });
    }
  });

  // Persists the (possibly admin-edited) Blueprint and seeds the Situation
  // from its openingSituation. The Blueprint is immutable from here on; the
  // Situation is what changes during play (situationPass.js every turn, or
  // the admin via PATCH /:id/situation).
  router.post("/:id/blueprint/approve", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { campaignInput, premise, milestones, openingSituation } = req.body ?? {};
    if (!campaignInput || !premise || !Array.isArray(milestones) || milestones.length === 0 || !openingSituation) {
      return res.status(400).json({ error: "Incomplete Blueprint content" });
    }

    const blueprint = { campaignInput, premise, milestones, openingSituation };
    const situation = initializeSituation({ blueprint });
    if (!situation.objective || !situation.nextMove || !situation.antagonist.move) {
      return res.status(400).json({ error: "Opening situation is incomplete" });
    }

    const [updated] = await db
      .update(stories)
      .set({ blueprint, situation })
      .where(eq(stories.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Story not found" });
    }
    res.json({ blueprint: updated.blueprint, situation: updated.situation });
  });

  // Read-only fetch for the admin-only viewing tabs (Blueprint, Milestones,
  // Situation), independent of the generate/approve creation flow.
  router.get("/:id/blueprint", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const story = await loadCampaign(req.params.id);
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    res.json(story);
  });

  // Admin edit of the Situation's four rewritable fields - the correction
  // path for a drifting rewrite (specs/campaign-situation.md §5.1). Milestone
  // position is deliberately not editable here; it has its own routes below.
  router.patch("/:id/situation", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { errors, value } = validateSituationFields(req.body ?? {});
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const story = await loadCampaign(req.params.id);
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    if (!story.situation) {
      return res.status(400).json({ error: "No Blueprint exists for this Story" });
    }

    const situation = { ...story.situation, ...value, revision: (story.situation.revision ?? 0) + 1 };
    await db.update(stories).set({ situation }).where(eq(stories.id, req.params.id));
    res.json({ situation });
  });

  // Manual admin override for the Milestones tab's Advance/Un-advance
  // controls - same pure functions applySituationUpdate uses when the
  // Situation pass judges a milestone reached, just triggered by the admin.
  // Both no-op (200, unchanged) at their boundaries rather than erroring;
  // the frontend disables the buttons there anyway.
  function createMilestoneMoveRoute(transform) {
    return async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const story = await loadCampaign(req.params.id);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      if (!story.blueprint || !story.situation) {
        return res.status(400).json({ error: "No Blueprint exists for this Story" });
      }

      const situation = transform(story.situation, story.blueprint);
      await db.update(stories).set({ situation }).where(eq(stories.id, req.params.id));
      res.json({ situation });
    };
  }

  router.post("/:id/blueprint/milestones/advance", createMilestoneMoveRoute(advanceMilestone));
  router.post("/:id/blueprint/milestones/revert", createMilestoneMoveRoute(revertMilestone));

  return router;
}
