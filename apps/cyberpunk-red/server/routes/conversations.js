import { Router } from "express";
import { eq, asc, desc, count, and, gt, ne } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations, messages, stories } from "../db/schema.js";
import { requireAuth } from "@roleplayer/server-core/requireAuth.js";
import { users } from "@roleplayer/server-core/users.js";
import { subscribe, publish } from "@roleplayer/server-core/broadcaster.js";
import { generateReply, generateChapterSummary } from "../lib/claude.js";
import { notifyOtherPlayer, formatPlayerMessage, formatDmReply, formatNewChapter } from "../lib/discordNotify.js";
import { rollSkillCheck, rollGeneric, formatModifier, formatDiceBreakdown } from "../../mcp/dice.js";

const router = Router();
const MAX_CONVERSATIONS = 50;

// Conversation ids currently generating a DM reply, or currently being
// wound down into a new chapter — closes the race where two requests
// arrive close together and both pass their "is this still valid?" check
// before either finishes. Checked and added synchronously, before any
// `await`, so there's no window for a second request to slip through.
// In-memory is fine here for the same reason it's fine in broadcaster.js:
// single server process, two users.
const pendingReplies = new Set();

const ROLES = [
  "Rockerboy",
  "Solo",
  "Netrunner",
  "Tech",
  "Medtech",
  "Media",
  "Exec",
  "Lawman",
  "Fixer",
  "Nomad",
];

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const AVATAR_DATA_URL_RE = new RegExp(`^data:(${ALLOWED_AVATAR_TYPES.join("|")});base64,(.+)$`);

const MAX_TEXT_FIELD_LENGTH = 500;

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
async function findModifiableMessage(conversationId, messageId, user) {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));

  if (!row) {
    return { status: 404, error: "Message not found" };
  }
  if (row.role !== "user") {
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

// Server-side source of truth for what a roll type needs and looks like —
// the frontend's disabled ROLL button is a convenience, this is the guard.
const ROLL_TYPES = {
  SKILL_CHECK: { label: "SKILL CHECK", sides: 10, requiresFreeText: true },
  SKILL_CHECK_OPPOSING: { label: "SKILL CHECK (OPPOSING)", sides: 10, requiresFreeText: true },
  ATTACK_MELEE: { label: "ATTACK ROLL (MELEE)", sides: 10, requiresFreeText: true },
  ATTACK_RANGED: { label: "ATTACK ROLL (RANGED)", sides: 10, requiresFreeText: true },
  DAMAGE: { label: "DAMAGE ROLL", sides: 6, requiresFreeText: true, requiresNumDice: true },
  DEFENSE_MELEE: { label: "DEFENSE ROLL (MELEE)", sides: 10, requiresFreeText: false },
};

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
      characterSp: conversations.characterSp,
      characterReady: conversations.characterReady,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .orderBy(desc(conversations.lastMessageAt));
  res.json(rows);
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
    return !ROLES.includes(details.role) || !Number.isInteger(level) || level < 1 || level > 20;
  });
  if (invalidDetails) {
    return res.status(400).json({ error: "A valid role and level (1-20) are required for each player" });
  }

  if (!(await assertUnderConversationCap(res))) return;

  const capitalized = Object.fromEntries(
    users.map((u) => [u.username, capitalize(String(characterNames[u.username]))]),
  );
  const storyName = users.map((u) => capitalized[u.username]).join(" & ");
  const details = Object.fromEntries(
    users.map((u) => [u.username, { role: characterDetails[u.username].role, level: Number(characterDetails[u.username].level) }]),
  );

  const [story] = await db.insert(stories).values({ name: storyName }).returning();

  const characterHp = Object.fromEntries(users.map((u) => [u.username, { current: 0, max: 0 }]));
  const characterSp = Object.fromEntries(users.map((u) => [u.username, { current: 0, max: 0 }]));
  const characterReady = Object.fromEntries(users.map((u) => [u.username, false]));

  const [conversation] = await db
    .insert(conversations)
    .values({
      name: "Chapter 1",
      storyId: story.id,
      characterNames: capitalized,
      characterDetails: details,
      characterHp,
      characterSp,
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

router.patch("/:id/sp", async (req, res) => {
  const { current, max } = req.body ?? {};
  if (current === undefined && max === undefined) {
    return res.status(400).json({ error: "current and/or max is required" });
  }

  const [conversation] = await db
    .select({
      characterSp: conversations.characterSp,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!conversation.storyId) {
    return res.status(400).json({ error: "SP is only supported for Story conversations" });
  }
  if (!(await assertActiveChapter(req.params.id, conversation, res))) return;

  const existing = conversation.characterSp?.[req.user.username] ?? { current: 0, max: 0 };
  const merged = {
    current: current !== undefined ? Number(current) : existing.current,
    max: max !== undefined ? Number(max) : existing.max,
  };

  if (!Number.isInteger(merged.max) || merged.max < 1) {
    return res.status(400).json({ error: "Max SP must be a whole number of 1 or more" });
  }
  if (!Number.isInteger(merged.current) || merged.current > merged.max) {
    return res.status(400).json({ error: "Current SP must be a whole number no greater than Max SP" });
  }

  const characterSp = { ...(conversation.characterSp ?? {}), [req.user.username]: merged };

  await db.update(conversations).set({ characterSp }).where(eq(conversations.id, req.params.id));

  res.json({ characterSp });
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
      campaignBible: stories.campaignBible,
      beatsTracker: stories.beatsTracker,
      villainPlanTracker: stories.villainPlanTracker,
    })
    .from(stories)
    .where(eq(stories.id, conversation.storyId));
  if (!(await assertActiveChapter(conversationId, conversation, res))) return;
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
        characterSp: conversation.characterSp,
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
      const introText = await generateReply(
        [recap, kickoff],
        conversation.characterNames,
        conversation.characterDetails,
        conversation.characterDescriptions,
        conversation.characterGear,
        undefined,
        story?.campaignBible ?? null,
        story?.beatsTracker ?? null,
        story?.villainPlanTracker ?? null,
      );

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
  const { rollType, modifier, freeText, numDice } = req.body ?? {};

  const rollDef = ROLL_TYPES[rollType];
  if (!rollDef) {
    return res.status(400).json({ error: "Invalid roll type" });
  }
  if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
    return res.status(400).json({ error: "A modifier is required" });
  }
  if (rollDef.requiresFreeText && (typeof freeText !== "string" || !freeText.trim())) {
    return res.status(400).json({ error: "This roll requires a weapon/skill description" });
  }
  if (rollDef.requiresNumDice && (typeof numDice !== "number" || !Number.isInteger(numDice) || numDice < 1)) {
    return res.status(400).json({ error: "Number of d6 is required for a damage roll" });
  }

  const effectiveNumDice = rollDef.requiresNumDice ? numDice : 1;
  const isSkillCheckShape = effectiveNumDice === 1 && rollDef.sides === 10;
  const { rolls, diceTotal, critResult } = isSkillCheckShape
    ? rollSkillCheck()
    : rollGeneric(effectiveNumDice, rollDef.sides);
  const total = diceTotal + modifier;

  const critSuffix = critResult === "success" ? " CRITICAL SUCCESS!" : critResult === "failure" ? " CRITICAL FAILURE!" : "";
  const freeTextPart = rollDef.requiresFreeText ? ` (${freeText.trim()})` : "";
  const breakdown = formatDiceBreakdown(rolls, rollDef.sides, critResult);
  const content = `${rollDef.label}${freeTextPart} - ROLLED ${total}!${critSuffix} (${breakdown}${formatModifier(modifier)})`;

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
  const result = await findModifiableMessage(req.params.id, req.params.messageId, req.user);
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

router.post("/:id/respond", async (req, res) => {
  const conversationId = req.params.id;

  const [conversation] = await db
    .select({
      characterNames: conversations.characterNames,
      characterDetails: conversations.characterDetails,
      characterDescriptions: conversations.characterDescriptions,
      characterGear: conversations.characterGear,
      characterHp: conversations.characterHp,
      storyId: conversations.storyId,
      createdAt: conversations.createdAt,
      name: conversations.name,
      storyName: stories.name,
      campaignBible: stories.campaignBible,
      beatsTracker: stories.beatsTracker,
      villainPlanTracker: stories.villainPlanTracker,
    })
    .from(conversations)
    .leftJoin(stories, eq(conversations.storyId, stories.id))
    .where(eq(conversations.id, conversationId));

  if (!(await assertActiveChapter(conversationId, conversation, res))) return;

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
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    const replyText = await generateReply(
      history,
      conversation?.characterNames ?? null,
      conversation?.characterDetails ?? null,
      conversation?.characterDescriptions ?? null,
      conversation?.characterGear ?? null,
      conversation?.characterHp ?? null,
      conversation?.campaignBible ?? null,
      conversation?.beatsTracker ?? null,
      conversation?.villainPlanTracker ?? null,
    );

    const [saved] = await db
      .insert(messages)
      .values({
        conversationId,
        sender: "DM",
        role: "assistant",
        content: replyText,
      })
      .returning();

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
    const conversationName = conversation?.storyId ? (conversation.storyName ?? conversation.name) : conversation?.name;
    notifyOtherPlayer({ actorUsername: req.user.username, message: formatDmReply(conversationName, replyText) });
  } catch (err) {
    console.error("Failed to generate DM reply:", err);
    publish(conversationId, { type: "failed" });
  } finally {
    pendingReplies.delete(conversationId);
  }
});

export default router;
