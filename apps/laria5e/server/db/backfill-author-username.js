import "dotenv/config";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations, messages } from "./schema.js";
import { users } from "@roleplayer/server-core/users.js";

// One-off: `author_username` starts NULL on every pre-existing `role:
// "user"` row. Non-Story conversations already have the real username
// in `sender`, so those backfill directly. Story conversations display
// the character name in `sender` instead, so backfilling those requires
// reverse-looking-up which username maps to that character name via the
// conversation's own `characterNames` JSON.
async function run() {
  const allConversations = await db.select().from(conversations);

  let updated = 0;
  for (const conversation of allConversations) {
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "user"), isNull(messages.authorUsername)));

    for (const row of rows) {
      let authorUsername = row.sender;
      if (conversation.isStory && conversation.characterNames) {
        const match = Object.entries(conversation.characterNames).find(([, name]) => name === row.sender);
        authorUsername = match?.[0] ?? null;
      }
      if (!authorUsername || !users.some((u) => u.username === authorUsername)) {
        console.warn(`Could not resolve author for message ${row.id} (sender "${row.sender}") — left NULL`);
        continue;
      }
      await db.update(messages).set({ authorUsername }).where(eq(messages.id, row.id));
      updated++;
    }
  }

  console.log(`Backfilled author_username on ${updated} message(s).`);
}

run().then(() => process.exit(0));
