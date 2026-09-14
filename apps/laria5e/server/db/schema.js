import { pgTable, uuid, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

// A story is a persistent, independently-named container for an ordered,
// append-only sequence of chapters (conversations with a matching storyId).
// No chapter-position column — "Chapter N" is always derivable from
// ORDER BY createdAt among conversations sharing a storyId, since chapters
// can never be deleted, reordered, or branched.
export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  blueprint: jsonb("campaign_bible"), // { campaignInput, premise, milestones, openingSituation } - immutable once approved; null until a Blueprint exists (column name kept from the earlier "Campaign Bible" naming - see specs/campaign-situation.md)
  situation: jsonb("situation"), // { objective, nextMove, antagonist: { move, awareness }, facts, activeMilestoneId, revision } - the DM's mutable working memory, rewritten after every turn; null until a Blueprint exists
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isMain: boolean("is_main").notNull().default(false),
  storyId: uuid("story_id").references(() => stories.id), // set on every chapter, null otherwise — the sole source of truth for "is this a Story conversation" (a dedicated isStory flag was dropped as redundant: the two were never set independently)
  characterNames: jsonb("character_names"), // { "<username>": "<character name>" }
  characterDetails: jsonb("character_details"), // { "<username>": { "playerClass": "<Class>", "level": <1-20> } }
  avatarImages: jsonb("avatar_images"), // { "<username>": "<data URL>" }, mutable, unlike the fields above
  characterDescriptions: jsonb("character_descriptions"), // { "<username>": "<description, <=500 chars>" }, mutable
  characterGear: jsonb("character_gear"), // { "<username>": "<weapons & gear, <=500 chars>" }, mutable
  characterHp: jsonb("character_hp"), // { "<username>": { "current": <int>, "max": <int> } }, mutable; seeded to 0/0 at Story creation
  characterAc: jsonb("character_ac"), // { "<username>": <int> }, mutable; seeded to 16 at Story creation, edited in place
  characterReady: jsonb("character_ready"), // { "<username>": <bool> }, mutable; seeded false/false at Story/chapter creation (never carried over); reset false/false when the DM replies
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-row table for app-wide settings. A plain typed boolean column, not
// a generic key-value store — extend with more typed columns if/when a
// second real setting is needed, not preemptively.
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordNotificationsEnabled: boolean("discord_notifications_enabled").notNull().default(false),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  sender: text("sender").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  authorUsername: text("author_username"), // real username, nullable (null for assistant/DM rows)
  edited: boolean("edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Combat Encounters (specs/combat-encounters.md §4). A combat is a *mode of
// a chapter*, not a conversation: a `combats` row attached to the chapter it
// belongs to, with its own message table. Giving combat messages their own
// table (rather than a combatId column on `messages`) keeps every existing
// message rule - chapter lock, edit/delete lock-once-DM-replied, the cost
// aggregate, last-message checks - untouched; combat messages need none of
// them. At most one `active` combat per conversation (enforced in the
// routes, not the schema). The resolved row is kept (context + summary, a
// few KB) as the audit trail once its transcript is deleted.
export const combats = pgTable("combats", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  status: text("status").notNull().default("active"), // 'active' | 'resolved'
  context: jsonb("context").notNull(), // the start_combat handoff: { location, enemies: [{ name, description, motive?, notes?, statInputs, stats }], circumstances, objective, openingAction }
  summary: jsonb("summary"), // the end_combat outcome once resolved: { outcome, objectiveAchieved, narrative, partyStatus, enemyStatus, consequences }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const combatMessages = pgTable("combat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  combatId: uuid("combat_id")
    .notNull()
    .references(() => combats.id),
  sender: text("sender").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  authorUsername: text("author_username"), // real username, nullable (null for the combat DM's rows)
  edited: boolean("edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
