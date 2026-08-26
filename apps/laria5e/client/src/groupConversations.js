// Groups the flat conversation list into story sections (storyId set) and
// standalone conversations (storyId null), then sorts both kinds together
// by "recent activity" — a story's effective timestamp is its active
// (latest) chapter's lastMessageAt, since only that chapter can ever change.
export function groupConversations(conversations) {
  const storiesById = new Map();
  const standalone = [];

  for (const c of conversations) {
    if (!c.storyId) {
      standalone.push(c);
      continue;
    }
    if (!storiesById.has(c.storyId)) {
      storiesById.set(c.storyId, { storyId: c.storyId, storyName: c.storyName, chapters: [] });
    }
    storiesById.get(c.storyId).chapters.push(c);
  }

  const storyItems = Array.from(storiesById.values()).map((story) => {
    const chapters = [...story.chapters].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const lastMessageAt = chapters.reduce(
      (max, c) => (new Date(c.lastMessageAt) > max ? new Date(c.lastMessageAt) : max),
      new Date(0),
    );
    return { type: "story", storyId: story.storyId, storyName: story.storyName, chapters, lastMessageAt };
  });

  const standaloneItems = standalone.map((c) => ({ type: "conversation", conversation: c, lastMessageAt: new Date(c.lastMessageAt) }));

  return [...storyItems, ...standaloneItems].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}
