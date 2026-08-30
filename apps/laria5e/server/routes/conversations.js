import { Router } from "express";
import { eq, asc, desc, count, and, gt, ne } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations, messages, stories } from "../db/schema.js";
import { requireAuth } from "@roleplayer/server-core/requireAuth.js";
import { users } from "@roleplayer/server-core/users.js";
import { subscribe, publish } from "@roleplayer/server-core/broadcaster.js";
import { generateReply, generateChapterSummary } from "../lib/claude.js";
import { notifyOtherPlayer, formatPlayerMessage, formatDmReply, formatNewChapter } from "../lib/discordNotify.js";
import { rollD20Check, rollDamage, formatModifier } from "../../mcp/dice.js";

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

// Mirrors client/src/DiceRoller.jsx's SKILLS — kept in sync manually, same
// as CLASSES above. Server-side re-check regardless of what the client
// claims, per this project's established server-side-enforcement pattern.
const SKILLS = [
  "Athletics",
  "Acrobatics",
  "Sleight of Hand",
  "Stealth",
  "Arcana",
  "History",
  "Investigation",
  "Nature",
  "Religion",
  "Animal Handling",
  "Insight",
  "Medicine",
  "Perception",
  "Survival",
  "Deception",
  "Intimidation",
  "Performance",
  "Persuasion",
];
// Mirrors client/src/DiceRoller.jsx's ABILITIES — same sync-manually pattern.
const ABILITIES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const ADVANTAGE_STATES = ["adv", "flat", "dis"];
const DAMAGE_DIE_SIDES = [4, 6, 8, 10, 12, 20];
const MAX_ROLL_DESCRIPTION_LENGTH = 80;

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

// Skill/Attack rolls: 1d20 flat, or 2d20 (advantage/disadvantage) keeping
// the higher/lower — crit (nat 20) and fumble (nat 1) read off the kept die
// only, called out in the text but with no effect on the numeric total. The
// breakdown always shows just the kept die; which die that was (and why)
// is conveyed by the "(Advantage)"/"(Disadvantage)" suffix on the label
// instead of by also listing the discarded roll.
function formatSkillAttackMessage({ label, kept, advantage, modifier, isCrit, isFumble }) {
  const advSuffix = advantage === "adv" ? " (Advantage)" : advantage === "dis" ? " (Disadvantage)" : "";
  const critNote = isCrit ? " - Critical Success!" : isFumble ? " - Critical Failure!" : "";
  return `${label}${advSuffix} - Rolled ${kept + modifier}! (d20 [${kept}]${formatModifier(modifier)})${critNote}`;
}

// Damage and Misc rolls share this shape: one or more dice rows (e.g. 2d6 +
// 1d8), each independently doubled when Crit is on (rolls.length per row
// already reflects that; Misc rolls never pass crit: true, since there's no
// crit concept for an arbitrary roll) — the modifier is still added only
// once across the whole roll, however many rows there are. `label` is the
// fixed word "Damage" for a Damage Roll, or the player's own free-text
// description for a Misc Roll.
function formatDiceRowsMessage({ label, rowResults, modifier, crit }) {
  const critPrefix = crit ? "CRIT · " : "";
  const rowsText = rowResults.map((r) => `${r.rolls.length}d${r.sides} [${r.rolls.join(", ")}]`).join(" + ");
  const total = rowResults.flatMap((r) => r.rolls).reduce((a, b) => a + b, 0) + modifier;
  return `${label} — Rolled ${total}! (${critPrefix}${rowsText}${formatModifier(modifier)})`;
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
  const { rollType, skill, ability, advantage, diceRows, crit, description, modifier } = req.body ?? {};

  if (!["skill", "attack", "save", "damage", "misc"].includes(rollType)) {
    return res.status(400).json({ error: "Invalid roll type" });
  }
  const mod = Number.isInteger(modifier) ? modifier : 0;

  let content;
  if (rollType === "damage" || rollType === "misc") {
    const isMisc = rollType === "misc";
    let label = "Damage";
    if (isMisc) {
      const trimmedDescription = typeof description === "string" ? description.trim() : "";
      if (!trimmedDescription) {
        return res.status(400).json({ error: "A roll type description is required" });
      }
      if (trimmedDescription.length > MAX_ROLL_DESCRIPTION_LENGTH) {
        return res
          .status(400)
          .json({ error: `Roll type description must be ${MAX_ROLL_DESCRIPTION_LENGTH} characters or fewer` });
      }
      label = trimmedDescription;
    }
    if (!Array.isArray(diceRows) || diceRows.length === 0) {
      return res.status(400).json({ error: "At least one dice row is required" });
    }
    const parsedRows = [];
    for (const row of diceRows) {
      const sides = Number(row?.dieType);
      const count = Number(row?.count);
      if (!DAMAGE_DIE_SIDES.includes(sides)) {
        return res.status(400).json({ error: "A valid die type is required for every dice row" });
      }
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        return res.status(400).json({ error: "Dice count must be a whole number from 1 to 20 for every dice row" });
      }
      parsedRows.push({ count, sides });
    }
    // Misc rolls never crit — there's no crit concept for an arbitrary
    // player-described roll, so isCrit is forced false regardless of
    // whatever the request body claims for a non-damage roll type.
    const isCrit = !isMisc && crit === true;
    const rowResults = parsedRows.map(({ count, sides }) => ({ ...rollDamage(count, sides, isCrit), sides }));
    content = formatDiceRowsMessage({ label, rowResults, modifier: mod, crit: isCrit });
  } else {
    const isSkill = rollType === "skill";
    const isSave = rollType === "save";
    if (isSkill && !SKILLS.includes(skill)) {
      return res.status(400).json({ error: "A valid skill is required" });
    }
    if (isSave && !ABILITIES.includes(ability)) {
      return res.status(400).json({ error: "A valid ability is required" });
    }
    const label = isSkill ? skill : isSave ? `${ability} Save` : "Attack";
    const adv = ADVANTAGE_STATES.includes(advantage) ? advantage : "flat";
    const { kept, isCrit, isFumble } = rollD20Check(adv);
    content = formatSkillAttackMessage({ label, kept, advantage: adv, modifier: mod, isCrit, isFumble });
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
