import { Router } from "express";
import { eq, asc, desc, and, gt, ne } from "drizzle-orm";
import { requireAuth } from "../requireAuth.js";
import { publish } from "../broadcaster.js";
import { pendingReplies } from "../pendingReplies.js";
import { renderCombatOutcome } from "./context.js";

export const COMBAT_OUTCOME_SENDER = "Combat Outcome";

// The combat-mode routes (specs/combat-encounters.md §5.3, §5.4): player
// messages, rolls, message edit/delete, the combat DM's turn, and the
// admin's manual end. Mounted at /api/combats. Everything app-specific
// comes in as arguments:
//
// - db + tables: the app's drizzle client and its combats / combatMessages /
//   conversations / messages / stories tables (schema.js stays per-app).
// - game: the app's combat module (see README.md) - only its
//   buildRollMessage is used here, so a combat roll reads identically to a
//   narrative one.
// - generateCombatReply / generateCombatEnd: the app's pre-bound combat
//   generator (createCombatGenerator in generator.js).
// - buildRoster(conversation): the app's player-roster builder.
// - notifyOtherPlayer + formatPlayerMessage + formatDmReply: Discord, every
//   combat DM turn included (Open Questions: "every DM turn").
// - afterCombatEnded({ conversation, history, replyText }): the app's
//   narrative passes (Situation pass + leak-check) over the outcome message -
//   the one exchange in which the Situation pass sees a fight.
export function createCombatsRouter({
  db,
  tables,
  game,
  generateCombatReply,
  generateCombatEnd,
  buildRoster,
  notifyOtherPlayer,
  formatPlayerMessage,
  formatDmReply,
  afterCombatEnded,
  users,
}) {
  const { combats, combatMessages, conversations, messages, stories } = tables;
  const { buildRollMessage } = game;
  const router = Router();
  router.use(requireAuth);

  // Loads an *active* combat with its parent conversation, or writes the
  // right error. Every route here starts with this: a resolved combat's id
  // is never a valid target again (its transcript is gone).
  async function loadActiveCombat(combatId, res) {
    const [row] = await db
      .select({
        combat: combats,
        conversation: conversations,
        storyName: stories.name,
        blueprint: stories.blueprint,
        situation: stories.situation,
      })
      .from(combats)
      .innerJoin(conversations, eq(combats.conversationId, conversations.id))
      .leftJoin(stories, eq(conversations.storyId, stories.id))
      .where(eq(combats.id, combatId));

    if (!row) {
      res.status(404).json({ error: "Combat not found" });
      return null;
    }
    if (row.combat.status !== "active") {
      res.status(409).json({ error: "This combat is already over." });
      return null;
    }
    return row;
  }

  function conversationLabel(row) {
    return row.conversation.storyId ? (row.storyName ?? row.conversation.name) : row.conversation.name;
  }

  function resolveSender(row, username) {
    return row.conversation.storyId ? (row.conversation.characterNames?.[username] ?? username) : username;
  }

  async function insertCombatUserMessage(row, user, content) {
    const sender = resolveSender(row, user.username);
    const [saved] = await db
      .insert(combatMessages)
      .values({ combatId: row.combat.id, sender, authorUsername: user.username, role: "user", content })
      .returning();
    publish(row.conversation.id, { type: "combat-message", message: saved });
    notifyOtherPlayer({
      actorUsername: user.username,
      message: formatPlayerMessage(sender, user.username, `${conversationLabel(row)} (combat)`, content),
    });
    return saved;
  }

  async function loadCombatHistory(combatId) {
    return db.select().from(combatMessages).where(eq(combatMessages.combatId, combatId)).orderBy(asc(combatMessages.createdAt));
  }

  // True if no *other* message in this combat was created after `createdAt`
  // - mirrors conversations.js's isLatestMessage, scoped to one combat's
  // transcript instead of a whole chapter. Same reasoning for excluding
  // messageId itself rather than trusting the timestamp comparison alone
  // (Postgres microsecond precision vs. Drizzle's millisecond round-trip).
  async function isLatestCombatMessage(combatId, messageId, createdAt) {
    const [later] = await db
      .select({ id: combatMessages.id })
      .from(combatMessages)
      .where(and(eq(combatMessages.combatId, combatId), gt(combatMessages.createdAt, createdAt), ne(combatMessages.id, messageId)))
      .limit(1);
    return !later;
  }

  // Mirrors conversations.js's findModifiableMessage, scoped to one combat's
  // transcript: a player can edit/delete their own message until the combat
  // DM has replied after it; the combat DM's own messages can never be
  // edited; the admin can delete the single most recent message regardless
  // of role, to retry a bad combat-DM turn the same way the main chat's
  // delete-latest works. No chapter-lock check is needed here - a combat can
  // only be active on the currently unlocked chapter (§4 invariant).
  async function findModifiableCombatMessage(combatId, messageId, user, { allowAdminDeleteLatest = false } = {}) {
    const [row] = await db
      .select()
      .from(combatMessages)
      .where(and(eq(combatMessages.id, messageId), eq(combatMessages.combatId, combatId)));

    if (!row) {
      return { status: 404, error: "Message not found" };
    }

    const isAdminDeletingLatest =
      allowAdminDeleteLatest && user.isAdmin && (await isLatestCombatMessage(combatId, messageId, row.createdAt));

    if (row.role !== "user" && !isAdminDeletingLatest) {
      return { status: 403, error: "The combat DM's messages can't be edited or deleted" };
    }
    if (!user.isAdmin && row.authorUsername !== user.username) {
      return { status: 403, error: "You can only modify your own messages" };
    }

    if (!isAdminDeletingLatest) {
      const [laterReply] = await db
        .select({ id: combatMessages.id })
        .from(combatMessages)
        .where(and(eq(combatMessages.combatId, combatId), eq(combatMessages.role, "assistant"), gt(combatMessages.createdAt, row.createdAt)))
        .limit(1);
      if (laterReply) {
        return { status: 403, error: "This message is locked — the DM has already replied" };
      }
    }

    return { row };
  }

  // The exit path shared by the combat DM's own end_combat and the admin's
  // manual end (§5.4), in this order: narrative passes over the outcome
  // (blocking, same discipline as the narrative /respond - the next turn
  // must read the rewritten Situation), then the outcome becomes one
  // ordinary DM message in the main chapter, the combat is marked resolved
  // with its summary kept, its transcript deleted, and everyone is told.
  async function finishCombat({ row, outcome, actorUsername }) {
    const replyText = renderCombatOutcome(outcome);
    const conversationId = row.conversation.id;

    const history = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
    await afterCombatEnded({
      conversation: { ...row.conversation, blueprint: row.blueprint, situation: row.situation },
      history,
      replyText,
    });

    const saved = await db.transaction(async (tx) => {
      const [outcomeMessage] = await tx
        .insert(messages)
        .values({ conversationId, sender: COMBAT_OUTCOME_SENDER, role: "assistant", content: replyText })
        .returning();
      await tx
        .update(conversations)
        .set({
          lastMessageAt: outcomeMessage.createdAt,
          characterReady: Object.fromEntries(users.map((u) => [u.username, false])),
        })
        .where(eq(conversations.id, conversationId));
      await tx
        .update(combats)
        .set({ status: "resolved", summary: outcome, resolvedAt: new Date() })
        .where(eq(combats.id, row.combat.id));
      await tx.delete(combatMessages).where(eq(combatMessages.combatId, row.combat.id));
      return outcomeMessage;
    });

    publish(conversationId, { type: "combat-ended", message: saved });
    notifyOtherPlayer({ actorUsername, message: formatDmReply(conversationLabel(row), replyText) });
    return saved;
  }

  // Persists every write the DM made to an enemy this message - a lookup
  // result under stats.* (§6) or its update_enemy_status note under
  // condition - so the next message's handoff tier already carries them.
  // Paths are relative to the enemy object.
  async function persistEnemyUpdates(row, enemyUpdates) {
    if (enemyUpdates.length === 0) return;
    const context = structuredClone(row.combat.context);
    for (const { enemyIndex, path, value } of enemyUpdates) {
      const enemy = context.enemies[enemyIndex];
      if (!enemy) continue;
      const keys = path.split(".");
      let cursor = enemy;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cursor[keys[i]] !== "object" || cursor[keys[i]] === null) cursor[keys[i]] = {};
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = value;
    }
    await db.update(combats).set({ context }).where(eq(combats.id, row.combat.id));
  }

  router.post("/:id/messages", async (req, res) => {
    const { content } = req.body ?? {};
    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;

    await insertCombatUserMessage(row, req.user, content.trim());
    res.status(202).json({ status: "sent" });
  });

  router.post("/:id/roll", async (req, res) => {
    const result = buildRollMessage(req.body ?? {});
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;

    await insertCombatUserMessage(row, req.user, result.content);
    res.status(202).json({ status: "sent" });
  });

  router.post("/:id/respond", async (req, res) => {
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;
    const conversationId = row.conversation.id;

    const [lastMessage] = await db
      .select()
      .from(combatMessages)
      .where(eq(combatMessages.combatId, row.combat.id))
      .orderBy(desc(combatMessages.createdAt))
      .limit(1);
    // An empty transcript is the fight's opening turn - the players already
    // declared their action in the handoff, so the DM goes first there.
    if (lastMessage?.role === "assistant") {
      return res.status(409).json({ error: "The DM already replied — send a message first." });
    }
    if (pendingReplies.has(conversationId)) {
      return res.status(409).json({ error: "The DM is already replying — hang tight." });
    }
    pendingReplies.add(conversationId);

    res.status(202).json({ status: "generating" });
    publish(conversationId, { type: "generating" });

    try {
      const history = await loadCombatHistory(row.combat.id);
      const { text, outcome, enemyUpdates } = await generateCombatReply({
        context: row.combat.context,
        history,
        roster: buildRoster(row.conversation),
        onDiceRoll: () => publish(conversationId, { type: "status", text: "DM is rolling..." }),
      });
      await persistEnemyUpdates(row, enemyUpdates);

      if (outcome) {
        // The DM's wrap-up text is delivered live as the fight's last
        // message, then the whole transcript (this row included) is
        // replaced by the outcome message in the main chapter.
        if (text) {
          const [wrap] = await db
            .insert(combatMessages)
            .values({ combatId: row.combat.id, sender: "DM", role: "assistant", content: text })
            .returning();
          publish(conversationId, { type: "combat-message", message: wrap });
        }
        await finishCombat({ row, outcome, actorUsername: req.user.username });
        return;
      }

      const [saved] = await db
        .insert(combatMessages)
        .values({ combatId: row.combat.id, sender: "DM", role: "assistant", content: text })
        .returning();
      await db
        .update(conversations)
        .set({ characterReady: Object.fromEntries(users.map((u) => [u.username, false])) })
        .where(eq(conversations.id, conversationId));
      publish(conversationId, { type: "combat-message", message: saved });
      publish(conversationId, { type: "character-updated" });
      notifyOtherPlayer({ actorUsername: req.user.username, message: formatDmReply(`${conversationLabel(row)} (combat)`, text) });
    } catch (err) {
      console.error("Failed to generate combat DM reply:", err);
      publish(conversationId, { type: "failed" });
    } finally {
      pendingReplies.delete(conversationId);
    }
  });

  router.patch("/:id/messages/:messageId", async (req, res) => {
    const { content } = req.body ?? {};
    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;

    const result = await findModifiableCombatMessage(row.combat.id, req.params.messageId, req.user);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const [updated] = await db
      .update(combatMessages)
      .set({ content: content.trim(), edited: true })
      .where(eq(combatMessages.id, req.params.messageId))
      .returning();

    publish(row.conversation.id, { type: "combat-message-updated", message: updated });
    res.json(updated);
  });

  router.delete("/:id/messages/:messageId", async (req, res) => {
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;

    const result = await findModifiableCombatMessage(row.combat.id, req.params.messageId, req.user, {
      allowAdminDeleteLatest: true,
    });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await db.delete(combatMessages).where(eq(combatMessages.id, req.params.messageId));
    publish(row.conversation.id, { type: "combat-message-deleted", message: { id: req.params.messageId } });
    res.status(204).end();
  });

  // Manual admin override: the combat DM is made to produce the outcome
  // from the transcript as it stands.
  router.post("/:id/end", async (req, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Only the admin can end a combat" });
    }
    const row = await loadActiveCombat(req.params.id, res);
    if (!row) return;
    const conversationId = row.conversation.id;

    if (pendingReplies.has(conversationId)) {
      return res.status(409).json({ error: "The DM is already replying — hang tight." });
    }
    pendingReplies.add(conversationId);
    publish(conversationId, { type: "generating" });

    try {
      const history = await loadCombatHistory(row.combat.id);
      const { outcome } = await generateCombatEnd({ context: row.combat.context, history, roster: buildRoster(row.conversation) });
      const saved = await finishCombat({ row, outcome, actorUsername: req.user.username });
      res.json({ message: saved });
    } catch (err) {
      console.error("Failed to end combat:", err);
      publish(conversationId, { type: "failed" });
      res.status(502).json({ error: "Failed to end the combat — try again." });
    } finally {
      pendingReplies.delete(conversationId);
    }
  });

  return router;
}
