import { Router } from "express";
import { eq, asc, desc, count, and, gt, ne, sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations, messages, stories, combats, combatMessages } from "../db/schema.js";
import { requireAuth } from "@roleplayer/server-core/requireAuth.js";
import { users } from "@roleplayer/server-core/users.js";
import { subscribe, publish } from "@roleplayer/server-core/broadcaster.js";
import { pendingReplies } from "@roleplayer/server-core/pendingReplies.js";
import {
  generateReply,
  generateCombatHandoff,
  generateChapterSummary,
  runSituationPass,
  runLeakCheckPass,
} from "../lib/claude.js";
import { getActiveMilestone, applySituationUpdate } from "@roleplayer/server-core/blueprint.js";
import { notifyOtherPlayer, formatPlayerMessage, formatDmReply, formatNewChapter } from "../lib/discordNotify.js";
import { combatGame } from "../combat/index.js";

const router = Router();
const MAX_CONVERSATIONS = 50;

const CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const AVATAR_DATA_URL_RE = new RegExp(`^data:(${ALLOWED_AVATAR_TYPES.join("|")});base64,(.+)$`);

const MAX_TEXT_FIELD_LENGTH = 500;

// AC changes rarely (armor swap, spell effect) and is edited in place, not
// locked at Story creation like name/class/level — same mutable-anytime
// lifecycle as avatar/description/gear/HP.
const DEFAULT_AC = 16;
const MAX_AC = 99; // matches the client's 2-digit-max input

router.use(requireAuth);

function defaultConversationName() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(name) {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function assertUnderConversationCap(res) {
  const [{ value: conversationCount }] = await db.select({ value: count() }).from(conversations);
  if (conversationCount >= MAX_CONVERSATIONS) {
    res.status(400).json({
      error: `You've hit the ${MAX_CONVERSATIONS}-conversation limit. Delete an old conversation to make room.`,
    });
    return false;
  }
  return true;
}

// A chapter is only mutable while it's the latest in its story — once a
// newer chapter exists, everything about the old one (messages, rolls, DM
// replies, avatar/description/gear edits) is permanently read-only, for
// everyone, including the admin. Shared by assertActiveChapter (route-level,
// writes the 403 itself) and findModifiableMessage (returns a status/error
// pair like its other checks) so the same rule backs both. Always false for
// a conversation with no storyId (regular conversations, and Stories
// predating this feature until backfilled).
//
// Explicitly excludes conversationId itself rather than relying on the
// `gt(createdAt)` comparison alone: Postgres stores timestamps at
// microsecond precision, but Drizzle round-trips `createdAt` through a JS
// `Date` (millisecond precision) once it's been fetched and passed back in
// here, truncating it — so comparing a row's real stored value against a
// truncated copy of its own timestamp can spuriously read as "later than
// itself". Excluding the row by id sidesteps that entirely.
async function hasLaterChapter(conversationId, storyId, createdAt) {
  if (!storyId) return false;
  const [laterChapter] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.storyId, storyId),
        gt(conversations.createdAt, createdAt),
        ne(conversations.id, conversationId),
      ),
    )
    .limit(1);
  return !!laterChapter;
}

// Takes the already-fetched conversation row rather than re-querying, since
// every call site already has it.
async function assertActiveChapter(conversationId, conversation, res) {
  if (await hasLaterChapter(conversationId, conversation?.storyId, conversation?.createdAt)) {
    res.status(403).json({ error: "This chapter is locked — start a new chapter to continue." });
    return false;
  }
  return true;
}

// Combat mode (specs/combat-encounters.md §4): while a chapter has an active
// combat, all player traffic belongs to it and the narrative DM is off duty.
// The invariants - one active combat per chapter; no narrative turn, player
// message, roll, or chapter transition while one is active - are enforced
// here at the route level rather than in the schema.
async function findActiveCombat(conversationId) {
  const [combat] = await db
    .select({ id: combats.id, context: combats.context, createdAt: combats.createdAt })
    .from(combats)
    .where(and(eq(combats.conversationId, conversationId), eq(combats.status, "active")))
    .limit(1);
  return combat ?? null;
}

async function assertNoActiveCombat(conversationId, res) {
  if (await findActiveCombat(conversationId)) {
    res.status(409).json({ error: "A combat is in progress — this chapter is in combat mode until it ends." });
    return false;
  }
  return true;
}

// Enters combat mode from a validated handoff (§5.1): every enemy's core
// stats are computed server-side from this game's tables and stored in the
// record before the first combat turn (§6), so the combat DM only ever
// reads numbers, never derives them. The cut-in (the narrative DM's text up
// to the instant violence broke out) is persisted by the caller as an
// ordinary DM message first, so the chapter transcript reads cut-in, then
// (later) outcome.
async function startCombat(conversationId, handoff) {
  const context = {
    ...handoff,
    enemies: handoff.enemies.map((enemy) => ({ ...enemy, stats: combatGame.generateCoreStats(enemy) })),
  };
  const [combat] = await db.insert(combats).values({ conversationId, context }).returning();
  publish(conversationId, { type: "combat-started", combat: { id: combat.id, messages: [] } });
  console.log(`[combat] started ${combat.id} in ${conversationId}: ${context.enemies.length} enemies - ${context.objective}`);
  return combat;
}

// A conversation-scoped message is always attributed to the poster's
// character name in a Story conversation, or their username otherwise
// — shared by the plain send route and the dice-roll route below.
function resolveSender(conversation, username) {
  return conversation?.storyId ? (conversation.characterNames?.[username] ?? username) : username;
}

async function insertUserMessage(conversationId, sender, authorUsername, content, conversationName) {
  const [saved] = await db
    .insert(messages)
    .values({ conversationId, sender, authorUsername, role: "user", content })
    .returning();

  await db.update(conversations).set({ lastMessageAt: saved.createdAt }).where(eq(conversations.id, conversationId));

  publish(conversationId, { type: "created", message: saved });
  notifyOtherPlayer({ actorUsername: authorUsername, message: formatPlayerMessage(sender, authorUsername, conversationName, content) });
  return saved;
}

// Shared by the edit and delete message routes — the actual enforcement,
// re-evaluated fresh on every request rather than trusted from client state.
// Also correctly resolves the race where a GM reply lands in the DB moments
// before an edit/delete request arrives: the request just gets rejected as
// locked, same as if the lock had already been visible client-side.
// True if no *other* message in the conversation was created after
// `createdAt` - i.e. the row it came from is the single most recent message
// overall, regardless of role. Used only for the admin delete-latest escape
// hatch below; everywhere else "latest" is scoped to assistant replies
// specifically (see the laterReply check). Explicitly excludes messageId
// itself rather than relying on the `gt(createdAt)` comparison alone - same
// reasoning as hasLaterChapter above: Postgres stores timestamps at
// microsecond precision, but Drizzle round-trips `createdAt` through a JS
// `Date` (millisecond precision) once fetched and passed back in here,
// truncating it - so comparing a row's real stored value against a
// truncated copy of its own timestamp can spuriously read as "later than
// itself".
async function isLatestMessage(conversationId, messageId, createdAt) {
  const [later] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        gt(messages.createdAt, createdAt),
        ne(messages.id, messageId),
      ),
    )
    .limit(1);
  return !later;
}

// `allowAdminDeleteLatest` is passed only by the delete route - lets the
// admin delete the single most recent message in the conversation even when
// it's the DM's own reply, to cleanly retry a bad response without any
// other special-casing. Never applies to edits (a delete-only affordance).
// Unlocks the role check below; ownership (admin already bypasses it) and
// the chapter-lock check still apply as normal. The laterReply check is
// explicitly skipped rather than left to "naturally" pass - see its own
// comment below for why it can't just be left alone here.
async function findModifiableMessage(conversationId, messageId, user, { allowAdminDeleteLatest = false } = {}) {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));

  if (!row) {
    return { status: 404, error: "Message not found" };
  }

  const isAdminDeletingLatest =
    allowAdminDeleteLatest && user.isAdmin && (await isLatestMessage(conversationId, messageId, row.createdAt));

  if (row.role !== "user" && !isAdminDeletingLatest) {
    return { status: 403, error: "GM messages can't be edited or deleted" };
  }
  if (!user.isAdmin && row.authorUsername !== user.username) {
    return { status: 403, error: "You can only modify your own messages" };
  }

  const [conversation] = await db
    .select({ storyId: conversations.storyId, createdAt: conversations.createdAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (await hasLaterChapter(conversationId, conversation?.storyId, conversation?.createdAt)) {
    return { status: 403, error: "This chapter is locked — start a new chapter to continue." };
  }

  // Skipped for the admin-deletes-latest case: isAdminDeletingLatest already
  // confirmed via isLatestMessage (correctly excluding row's own id) that no
  // message of any role has a later createdAt, which trivially implies no
  // *assistant* message does either - the query below would otherwise
  // self-match on the same timestamp-truncation issue isLatestMessage guards
  // against, since it doesn't exclude row's own id and row itself can now be
  // the assistant message being checked (previously impossible to reach
  // this line with an assistant row, since the role check above always
  // short-circuited first).
  if (isAdminDeletingLatest) {
    return { row };
  }
  const [laterReply] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "assistant"), gt(messages.createdAt, row.createdAt)))
    .limit(1);
  if (laterReply) {
    return { status: 403, error: "This message is locked — the DM has already replied" };
  }

  return { row };
}

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: conversations.id,
      name: conversations.name,
      storyId: conversations.storyId,
      storyName: stories.name,
      characterNames: conversations.characterNames,
      characterDetails: conversations.characterDetails,
      avatarImages: conversations.avatarImages,
      characterDescriptions: conversations.characterDescriptions,
      characterGear: conversations.characterGear,
      characterHp: conversations.characterHp,
      characterAc: conversations.characterAc,
      characterReady: conversations.characterReady,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .orderBy(desc(conversations.lastMessageAt));

  // Separate aggregate rather than joining messages onto the select above -
  // that select already carries several jsonb columns, and joining messages
  // in would force a GROUP BY across all of them just to aggregate one
  // number. Powers the chapter cost-indicator dot (LeftPanel.jsx) - only
  // matters for Story chapters, but cheap enough to compute for every
  // conversation rather than special-casing which ones need it.
  const totals = await db
    .select({ conversationId: messages.conversationId, totalChars: sql`sum(length(${messages.content}))`.mapWith(Number) })
    .from(messages)
    .groupBy(messages.conversationId);
  const totalCharsById = new Map(totals.map((t) => [t.conversationId, t.totalChars]));

  res.json(rows.map((r) => ({ ...r, totalChars: totalCharsById.get(r.id) ?? 0 })));
});

router.post("/", async (req, res) => {
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }

  if (!(await assertUnderConversationCap(res))) return;

  const now = new Date();
  const [conversation] = await db
    .insert(conversations)
    .values({ name: defaultConversationName(), lastMessageAt: now })
    .returning();

  await db.insert(messages).values({
    conversationId: conversation.id,
    sender: req.user.username,
    authorUsername: req.user.username,
    role: "user",
    content: content.trim(),
  });

  res.status(201).json({ id: conversation.id, name: conversation.name });
});

router.post("/story", async (req, res) => {
  const characterNames = req.body?.characterNames ?? {};
  const characterDetails = req.body?.characterDetails ?? {};

  const missingName = users.some((u) => !characterNames[u.username] || !String(characterNames[u.username]).trim());
  if (missingName) {
    return res.status(400).json({ error: "A character name is required for each player" });
  }

  const invalidDetails = users.some((u) => {
    const details = characterDetails[u.username] ?? {};
    const level = Number(details.level);
    return !CLASSES.includes(details.playerClass) || !Number.isInteger(level) || level < 1 || level > 20;
  });
  if (invalidDetails) {
    return res.status(400).json({ error: "A valid class and level (1-20) are required for each player" });
  }

  if (!(await assertUnderConversationCap(res))) return;

  const capitalized = Object.fromEntries(
    users.map((u) => [u.username, capitalize(String(characterNames[u.username]))]),
  );
  const storyName = users.map((u) => capitalized[u.username]).join(" & ");
  const details = Object.fromEntries(
    users.map((u) => [
      u.username,
      { playerClass: characterDetails[u.username].playerClass, level: Number(characterDetails[u.username].level) },
    ]),
  );

  const [story] = await db.insert(stories).values({ name: storyName }).returning();

  const characterHp = Object.fromEntries(users.map((u) => [u.username, { current: 0, max: 0 }]));
  const characterAc = Object.fromEntries(users.map((u) => [u.username, DEFAULT_AC]));
  const characterReady = Object.fromEntries(users.map((u) => [u.username, false]));

  const [conversation] = await db
    .insert(conversations)
    .values({
      name: "Chapter 1",
      storyId: story.id,
      characterNames: capitalized,
      characterDetails: details,
      characterHp,
      characterAc,
      characterReady,
      lastMessageAt: new Date(),
    })
    .returning();

  res.status(201).json({ id: conversation.id, name: conversation.name, storyId: story.id, storyName: story.name });
});

router.patch("/:id", async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const [updated] = await db
    .update(conversations)
    .set({ name: name.trim() })
    .where(eq(conversations.id, req.params.id))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json({ id: updated.id, name: updated.name });
});

router.delete("/:id", async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Only the admin can delete conversations" });
  }

  const [conversation] = await db
    .select({ storyId: conversations.storyId, createdAt: conversations.createdAt })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  // The active (latest) chapter of a story can still be deleted — undoing an
  // accidental "+ New Chapter" reactivates the one before it. Earlier
  // chapters are permanently protected, same rule as every other edit.
  if (await hasLaterChapter(req.params.id, conversation.storyId, conversation.createdAt)) {
    return res.status(403).json({ error: "Earlier chapters can't be deleted." });
  }

  await db.transaction(async (tx) => {
    // Combat records hang off the chapter (resolved ones are kept as the
    // audit trail), so they go with it - transcripts first for the FK.
    const chapterCombats = await tx.select({ id: combats.id }).from(combats).where(eq(combats.conversationId, req.params.id));
    for (const { id } of chapterCombats) {
      await tx.delete(combatMessages).where(eq(combatMessages.combatId, id));
    }
    await tx.delete(combats).where(eq(combats.conversationId, req.params.id));
    await tx.delete(messages).where(eq(messages.conversationId, req.params.id));
    await tx.delete(conversations).where(eq(conversations.id, req.params.id));

    // No orphaned story left behind with zero chapters under it — this was
    // the only (or last remaining) chapter, so the story itself goes too.
    if (conversation.storyId) {
      const [{ value: remaining }] = await tx
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.storyId, conversation.storyId));
      if (remaining === 0) {
        await tx.delete(stories).where(eq(stories.id, conversation.storyId));
      }
    }
  });

  res.status(204).end();
});

router.get("/:id/messages", async (req, res) => {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, req.params.id))
    .orderBy(asc(messages.createdAt));
  res.json(rows);
});

// The chapter's active combat, if any, for the UI's combat block (§5.5) -
// its id and transcript only. The handoff context (enemy stat blocks,
// motives) is DM-side material and never leaves the server.
router.get("/:id/combat", async (req, res) => {
  const combat = await findActiveCombat(req.params.id);
  if (!combat) {
    return res.json({ combat: null });
  }
  const rows = await db
    .select()
    .from(combatMessages)
    .where(eq(combatMessages.combatId, combat.id))
    .orderBy(asc(combatMessages.createdAt));
  res.json({ combat: { id: combat.id, messages: rows } });
});

router.get("/:id/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":\n\n");

  subscribe(req.params.id, res);

  const keepAlive = setInterval(() => res.write(":\n\n"), 20000);
  req.on("close", () => clearInterval(keepAlive));
});

router.post("/:id/typing", async (req, res) => {
  const [conversation] = await db
    .select({ storyId: conversations.storyId, characterNames: conversations.characterNames })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  publish(req.params.id, {
    type: "typing",
    sender: resolveSender(conversation, req.user.username),
    senderUsername: req.user.username,
  });

  res.status(204).end();
});

router.post("/:id/messages", async (req, res) => {
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }

  const [conversation] = await db
    .select({
      characterNames: conversations.characterNames,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
      name: conversations.name,
      storyName: stories.name,
    })
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .where(eq(conversations.id, req.params.id));

  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;
  if (!(await assertNoActiveCombat(req.params.id, res))) return;

  const sender = resolveSender(conversation, req.user.username);
  const conversationName = conversation.storyId ? (conversation.storyName ?? conversation.name) : conversation.name;
  await insertUserMessage(req.params.id, sender, req.user.username, content.trim(), conversationName);

  res.status(202).json({ status: "sent" });
});

router.post("/:id/avatar", async (req, res) => {
  const { image } = req.body ?? {};

  const [conversation] = await db
    .select({
      avatarImages: conversations.avatarImages,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Avatars are only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const match = typeof image === "string" ? image.match(AVATAR_DATA_URL_RE) : null;
  if (!match) {
    return res.status(400).json({ error: "Image must be a PNG, JPEG, GIF, or WEBP" });
  }

  const byteLength = Buffer.byteLength(match[2], "base64");
  if (byteLength > MAX_AVATAR_BYTES) {
    return res.status(400).json({ error: "Image must be 3MB or smaller" });
  }

  const avatarImages = { ...(conversation.avatarImages ?? {}), [req.user.username]: image };

  await db.update(conversations).set({ avatarImages }).where(eq(conversations.id, req.params.id));

  res.json({ avatarImages });
});

router.patch("/:id/description", async (req, res) => {
  const { description } = req.body ?? {};

  const [conversation] = await db
    .select({
      characterDescriptions: conversations.characterDescriptions,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Character descriptions are only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;
  if (typeof description !== "string") {
    return res.status(400).json({ error: "Description must be text" });
  }

  const trimmed = description.trim();
  if (trimmed.length > MAX_TEXT_FIELD_LENGTH) {
    return res.status(400).json({ error: `Description must be ${MAX_TEXT_FIELD_LENGTH} characters or fewer` });
  }

  const characterDescriptions = { ...(conversation.characterDescriptions ?? {}), [req.user.username]: trimmed };

  await db.update(conversations).set({ characterDescriptions }).where(eq(conversations.id, req.params.id));

  res.json({ characterDescriptions });
});

router.patch("/:id/gear", async (req, res) => {
  const { gear } = req.body ?? {};

  const [conversation] = await db
    .select({
      characterGear: conversations.characterGear,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Weapons & Gear is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;
  if (typeof gear !== "string") {
    return res.status(400).json({ error: "Weapons & Gear must be text" });
  }

  const trimmed = gear.trim();
  if (trimmed.length > MAX_TEXT_FIELD_LENGTH) {
    return res.status(400).json({ error: `Weapons & Gear must be ${MAX_TEXT_FIELD_LENGTH} characters or fewer` });
  }

  const characterGear = { ...(conversation.characterGear ?? {}), [req.user.username]: trimmed };

  await db.update(conversations).set({ characterGear }).where(eq(conversations.id, req.params.id));

  res.json({ characterGear });
});

router.patch("/:id/hp", async (req, res) => {
  const { current, max } = req.body ?? {};
  if (current === undefined && max === undefined) {
    return res.status(400).json({ error: "current and/or max is required" });
  }

  const [conversation] = await db
    .select({
      characterHp: conversations.characterHp,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "HP is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const existing = conversation.characterHp?.[req.user.username] ?? { current: 0, max: 0 };
  const merged = {
    current: current !== undefined ? Number(current) : existing.current,
    max: max !== undefined ? Number(max) : existing.max,
  };

  if (!Number.isInteger(merged.max) || merged.max < 1) {
    return res.status(400).json({ error: "Max HP must be a whole number of 1 or more" });
  }
  if (!Number.isInteger(merged.current) || merged.current > merged.max) {
    return res.status(400).json({ error: "Current HP must be a whole number no greater than Max HP" });
  }

  const characterHp = { ...(conversation.characterHp ?? {}), [req.user.username]: merged };

  await db.update(conversations).set({ characterHp }).where(eq(conversations.id, req.params.id));
  publish(req.params.id, { type: "character-updated" });

  res.json({ characterHp });
});

router.patch("/:id/ac", async (req, res) => {
  const { ac } = req.body ?? {};
  const value = Number(ac);
  if (!Number.isInteger(value) || value < 0 || value > MAX_AC) {
    return res.status(400).json({ error: `AC must be a whole number from 0 to ${MAX_AC}` });
  }

  const [conversation] = await db
    .select({
      characterAc: conversations.characterAc,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "AC is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const characterAc = { ...(conversation.characterAc ?? {}), [req.user.username]: value };

  await db.update(conversations).set({ characterAc }).where(eq(conversations.id, req.params.id));
  publish(req.params.id, { type: "character-updated" });

  res.json({ characterAc });
});

router.patch("/:id/ready", async (req, res) => {
  const { ready } = req.body ?? {};
  if (typeof ready !== "boolean") {
    return res.status(400).json({ error: "ready must be true or false" });
  }

  const [conversation] = await db
    .select({
      characterReady: conversations.characterReady,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Ready status is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const characterReady = { ...(conversation.characterReady ?? {}), [req.user.username]: ready };

  await db.update(conversations).set({ characterReady }).where(eq(conversations.id, req.params.id));
  publish(req.params.id, { type: "character-updated" });

  res.json({ characterReady });
});

router.post("/:id/summarize", async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Only the admin can start a new chapter" });
  }

  const [conversation] = await db
    .select({
      characterNames: conversations.characterNames,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Chapters are only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, req.params.id))
    .orderBy(asc(messages.createdAt));

  try {
    const summary = await generateChapterSummary(history, conversation.characterNames);
    res.json({ summary });
  } catch (err) {
    console.error("Failed to generate chapter summary:", err);
    res.status(502).json({ error: "Failed to generate a chapter summary — try again." });
  }
});

router.post("/:id/new-chapter", async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Only the admin can start a new chapter" });
  }

  const { summary } = req.body ?? {};
  if (!summary || typeof summary !== "string" || !summary.trim()) {
    return res.status(400).json({ error: "A summary is required" });
  }

  const conversationId = req.params.id;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Chapters are only supported for Story conversations" });
  }
  const [story] = await db
    .select({
      name: stories.name,
      blueprint: stories.blueprint,
      situation: stories.situation,
    })
    .from(stories)
    .where(eq(stories.id, conversation.storyId));
  if (!(await assertActiveChapter(conversationId, conversation, res))) return;
  // A chapter can't close mid-fight: the outcome message belongs in this
  // chapter, and the summary would otherwise miss it.
  if (!(await assertNoActiveCombat(conversationId, res))) return;
  if (pendingReplies.has(conversationId)) {
    return res.status(409).json({ error: "This chapter already has something in flight — hang tight." });
  }
  pendingReplies.add(conversationId);

  try {
    if (!(await assertUnderConversationCap(res))) return;

    const [{ value: chapterCount }] = await db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.storyId, conversation.storyId));

    const [newChapter] = await db
      .insert(conversations)
      .values({
        name: `Chapter ${chapterCount + 1}`,
        storyId: conversation.storyId,
        characterNames: conversation.characterNames,
        characterDetails: conversation.characterDetails,
        avatarImages: conversation.avatarImages,
        characterDescriptions: conversation.characterDescriptions,
        characterGear: conversation.characterGear,
        characterHp: conversation.characterHp,
        characterAc: conversation.characterAc,
        // Deliberately not carried over from the outgoing chapter, unlike
        // every other field here — "ready" is a signal about the round in
        // progress, and a new chapter starts a fresh scene with none yet.
        characterReady: Object.fromEntries(users.map((u) => [u.username, false])),
        lastMessageAt: new Date(),
      })
      .returning();

    const [recap] = await db
      .insert(messages)
      .values({
        conversationId: newChapter.id,
        sender: "Story So Far",
        role: "assistant",
        content: summary.trim(),
      })
      .returning();

    await db.update(conversations).set({ lastMessageAt: recap.createdAt }).where(eq(conversations.id, newChapter.id));
    publish(newChapter.id, { type: "created", message: recap });

    try {
      // generateReply expects history ending in a user turn (the Anthropic
      // API rejects a `messages` array ending in `assistant` as unsupported
      // "assistant prefill") — [recap] alone doesn't have one, so a
      // synthetic, never-persisted kickoff message stands in for it.
      const kickoff = {
        role: "user",
        sender: "System",
        content: "Begin the new chapter now — open with a scene that picks up from where the summary above leaves off.",
      };
      // A chapter can't open into a fight, so a start_combat handoff here
      // is ignored - only the text is used (specs/combat-encounters.md §5.1).
      const { text: introText } = await generateReply(
        [recap, kickoff],
        conversation.characterNames,
        conversation.characterDetails,
        conversation.characterDescriptions,
        conversation.characterGear,
        undefined,
        story?.blueprint ?? null,
        story?.situation ?? null,
        () => publish(newChapter.id, { type: "status", text: "DM is rolling..." }),
      );

      await Promise.all([
        maybeUpdateSituation({
          storyId: conversation.storyId,
          blueprint: story?.blueprint,
          situation: story?.situation,
          history: [recap, kickoff],
          replyText: introText,
        }),
        maybeCheckLeak({ blueprint: story?.blueprint, situation: story?.situation, replyText: introText }),
      ]);

      const [intro] = await db
        .insert(messages)
        .values({
          conversationId: newChapter.id,
          sender: "DM",
          role: "assistant",
          content: introText,
        })
        .returning();

      await db.update(conversations).set({ lastMessageAt: intro.createdAt }).where(eq(conversations.id, newChapter.id));
      publish(newChapter.id, { type: "created", message: intro });
      notifyOtherPlayer({ actorUsername: req.user.username, message: formatNewChapter(story?.name, introText) });
    } catch (err) {
      // The chapter transition itself already succeeded (recap message is
      // real, approved content) — a failed scene-intro isn't worth undoing
      // that over, just logged so it's visible.
      console.error("Failed to generate scene-opening intro for new chapter:", err);
    }

    res.status(201).json({ id: newChapter.id, name: newChapter.name });
  } finally {
    pendingReplies.delete(conversationId);
  }
});

router.post("/:id/roll", async (req, res) => {
  // Roll validation, math and message format live in the combat game
  // module (combat/roll-message.js) so the combat roll route produces
  // identical messages.
  const rollResult = combatGame.buildRollMessage(req.body ?? {});
  if (rollResult.error) {
    return res.status(400).json({ error: rollResult.error });
  }
  const { content } = rollResult;

  const [conversation] = await db
    .select({
      characterNames: conversations.characterNames,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
      name: conversations.name,
      storyName: stories.name,
    })
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .where(eq(conversations.id, req.params.id));

  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;
  if (!(await assertNoActiveCombat(req.params.id, res))) return;

  const sender = resolveSender(conversation, req.user.username);
  const conversationName = conversation.storyId ? (conversation.storyName ?? conversation.name) : conversation.name;
  await insertUserMessage(req.params.id, sender, req.user.username, content, conversationName);

  res.status(202).json({ status: "sent" });
});

router.patch("/:id/messages/:messageId", async (req, res) => {
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }

  const result = await findModifiableMessage(req.params.id, req.params.messageId, req.user);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  const [updated] = await db
    .update(messages)
    .set({ content: content.trim(), edited: true })
    .where(eq(messages.id, req.params.messageId))
    .returning();

  publish(req.params.id, { type: "updated", message: updated });

  res.json(updated);
});

router.delete("/:id/messages/:messageId", async (req, res) => {
  const result = await findModifiableMessage(req.params.id, req.params.messageId, req.user, {
    allowAdminDeleteLatest: true,
  });
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  await db.delete(messages).where(eq(messages.id, req.params.messageId));

  const [latest] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, req.params.id))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  const [conversation] = await db
    .select({ createdAt: conversations.createdAt })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  await db
    .update(conversations)
    .set({ lastMessageAt: latest?.createdAt ?? conversation.createdAt })
    .where(eq(conversations.id, req.params.id));

  publish(req.params.id, { type: "deleted", message: { id: req.params.messageId } });

  res.status(204).end();
});

// Runs the Situation pass after narration is drafted, before it's
// saved/published (specs/campaign-situation.md §4.2) - deliberately blocks,
// so the very next turn already reads the rewritten Situation rather than
// lagging a turn behind. No-op if the story has no Blueprint. Failures are
// logged and swallowed, not thrown: the previous Situation simply stands for
// another turn (fail-open), and a pass problem never breaks the player's
// turn.
async function maybeUpdateSituation({ storyId, blueprint, situation, history, replyText }) {
  if (!storyId || !blueprint?.premise || !situation) return;

  try {
    // The latest exchange: every player message since the DM's previous
    // reply (players often roleplay back and forth, or ask OOC questions,
    // before prompting the DM), then the just-drafted reply (not yet
    // persisted). Everything older is the previous Situation's job.
    const lastReplyIndex = history.map((row) => row.role).lastIndexOf("assistant");
    const exchange = [...history.slice(lastReplyIndex + 1), { role: "assistant", sender: "DM", content: replyText }];

    const update = await runSituationPass({
      previousSituation: situation,
      premise: blueprint.premise,
      activeMilestone: getActiveMilestone(blueprint, situation),
      exchange,
    });
    const next = applySituationUpdate({ previous: situation, update, blueprint, milestoneReached: update.milestoneReached });
    await db.update(stories).set({ situation: next }).where(eq(stories.id, storyId));
    if (update.milestoneReached) {
      console.log(`[situation] milestone advanced: ${situation.activeMilestoneId} -> ${next.activeMilestoneId ?? "(arc complete)"}`);
    }
  } catch (err) {
    console.error("Situation pass failed (situation unchanged this turn):", err);
  }
}

// Runs alongside maybeUpdateSituation (Promise.all at both call sites) - the
// two passes are independent judgments over the same drafted response, so
// there's no reason to make one wait on the other. Checks the response in
// isolation against only the active milestone's own content. Detection
// only: a leak is logged for visibility, not auto-rewritten - see
// specs/campaign-situation.md §5.4.
async function maybeCheckLeak({ blueprint, situation, replyText }) {
  const activeMilestone = getActiveMilestone(blueprint, situation);
  if (!activeMilestone) return;

  try {
    await runLeakCheckPass({ replyText, activeBeat: activeMilestone });
  } catch (err) {
    console.error("Leak-check pass failed (skipped this turn):", err);
  }
}

// Both passes over one drafted DM reply, run together since they're
// independent judgments. Exported for the combats router, which runs them
// once over the combat outcome message (specs/combat-encounters.md §5.4) -
// the one exchange in which the Situation pass sees a fight.
export function runNarrativePasses({ conversation, history, replyText }) {
  return Promise.all([
    maybeUpdateSituation({
      storyId: conversation?.storyId,
      blueprint: conversation?.blueprint,
      situation: conversation?.situation,
      history,
      replyText,
    }),
    maybeCheckLeak({ blueprint: conversation?.blueprint, situation: conversation?.situation, replyText }),
  ]);
}

const RESPOND_SELECT = {
  characterNames: conversations.characterNames,
  characterDetails: conversations.characterDetails,
  characterDescriptions: conversations.characterDescriptions,
  characterGear: conversations.characterGear,
  characterHp: conversations.characterHp,
  storyId: conversations.storyId,
  createdAt: conversations.createdAt,
  name: conversations.name,
  storyName: stories.name,
  blueprint: stories.blueprint,
  situation: stories.situation,
};

async function loadRespondConversation(conversationId) {
  const [conversation] = await db
    .select(RESPOND_SELECT)
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .where(eq(conversations.id, conversationId));
  return conversation;
}

async function loadHistory(conversationId) {
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
}

// Persists a DM reply as the chapter's next message and closes out the
// round. Shared by the ordinary reply and the combat cut-in.
async function saveDmMessage(conversationId, content) {
  const [saved] = await db.insert(messages).values({ conversationId, sender: "DM", role: "assistant", content }).returning();
  await db
    .update(conversations)
    .set({
      lastMessageAt: saved.createdAt,
      // A reply closes out the round — both players' ready flags reset,
      // regardless of who was or wasn't marked. The "created" publish
      // below already triggers a refetch on every open client, so no
      // separate character-updated broadcast is needed for this reset.
      characterReady: Object.fromEntries(users.map((u) => [u.username, false])),
    })
    .where(eq(conversations.id, conversationId));
  publish(conversationId, { type: "created", message: saved });
  return saved;
}

router.post("/:id/respond", async (req, res) => {
  const conversationId = req.params.id;
  const conversation = await loadRespondConversation(conversationId);

  if (!(await assertActiveChapter(conversationId, conversation, res))) return;
  if (!(await assertNoActiveCombat(conversationId, res))) return;

  const [lastMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);

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
    const history = await loadHistory(conversationId);

    const { text: replyText, combatHandoff } = await generateReply(
      history,
      conversation?.characterNames ?? null,
      conversation?.characterDetails ?? null,
      conversation?.characterDescriptions ?? null,
      conversation?.characterGear ?? null,
      conversation?.characterHp ?? null,
      conversation?.blueprint ?? null,
      conversation?.situation ?? null,
      () => publish(conversationId, { type: "status", text: "DM is rolling..." }),
    );

    // The cut-in is a real narrative event (violence broke out here), so the
    // passes run over it like any other reply. If the DM emitted no text
    // with the handoff, there's nothing to record or post - the combat
    // simply starts.
    if (replyText) {
      await runNarrativePasses({ conversation, history, replyText });
      await saveDmMessage(conversationId, replyText);
      const conversationName = conversation?.storyId ? (conversation.storyName ?? conversation.name) : conversation?.name;
      notifyOtherPlayer({ actorUsername: req.user.username, message: formatDmReply(conversationName, replyText) });
    }

    if (combatHandoff) {
      await startCombat(conversationId, combatHandoff);
    }
  } catch (err) {
    console.error("Failed to generate DM reply:", err);
    publish(conversationId, { type: "failed" });
  } finally {
    pendingReplies.delete(conversationId);
  }
});

// Manual admin override (specs/combat-encounters.md §5.1): for the DM that
// narrated a fight without flagging it. A dedicated narrative-DM call
// produces the handoff from the scene as it stands, then combat mode
// starts exactly as if start_combat had been called on a normal turn.
router.post("/:id/combat/start", async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Only the admin can start a combat manually" });
  }
  const conversationId = req.params.id;
  const conversation = await loadRespondConversation(conversationId);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "Combat is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(conversationId, conversation, res))) return;
  if (!(await assertNoActiveCombat(conversationId, res))) return;
  const history = await loadHistory(conversationId);
  if (history.length === 0) {
    return res.status(400).json({ error: "There's no scene yet to start a fight in." });
  }
  if (pendingReplies.has(conversationId)) {
    return res.status(409).json({ error: "The DM is already replying — hang tight." });
  }
  pendingReplies.add(conversationId);
  publish(conversationId, { type: "generating" });

  try {
    const { text, combatHandoff } = await generateCombatHandoff(
      history,
      conversation.characterNames,
      conversation.characterDetails,
      conversation.characterDescriptions,
      conversation.characterGear,
      conversation.characterHp,
      conversation.blueprint,
      conversation.situation,
    );
    if (text) {
      await saveDmMessage(conversationId, text);
    }
    const combat = await startCombat(conversationId, combatHandoff);
    res.status(201).json({ combat: { id: combat.id, messages: [] } });
  } catch (err) {
    // On success the combat-started event brings the spinner down
    // client-side; on failure this does.
    console.error("Failed to start combat manually:", err);
    publish(conversationId, { type: "failed" });
    res.status(502).json({ error: "Failed to start the combat — try again." });
  } finally {
    pendingReplies.delete(conversationId);
  }
});

export default router;
