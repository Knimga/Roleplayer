import "dotenv/config";
import { eq, isNull, isNotNull, and } from "drizzle-orm";
import { db } from "../lib/db.js";
import { conversations, stories } from "./schema.js";

// One-off: existing Story conversations predate the story/chapter concept
// and have no storyId. Each becomes the "Chapter 1" of a new story named
// after that conversation's current name — the same default a brand new
// Story would get today. Identified by characterNames being set (only Story
// conversations ever have it) rather than a dedicated flag — there's no
// isStory column anymore, it was dropped as redundant with storyId once
// standalone conversations stopped being creatable.
async function run() {
  const preExisting = await db
    .select()
    .from(conversations)
    .where(and(isNotNull(conversations.characterNames), isNull(conversations.storyId)));

  for (const conversation of preExisting) {
    const [story] = await db.insert(stories).values({ name: conversation.name }).returning();
    await db
      .update(conversations)
      .set({ storyId: story.id, name: "Chapter 1" })
      .where(eq(conversations.id, conversation.id));
    console.log(`"${conversation.name}" -> story "${story.name}" / "Chapter 1"`);
  }

  console.log(`Backfilled ${preExisting.length} Story conversation(s) into stories.`);
}

run().then(() => process.exit(0));
