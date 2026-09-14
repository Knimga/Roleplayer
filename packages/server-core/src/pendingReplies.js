// Conversation ids currently generating a DM reply, being wound down into a
// new chapter, or running a combat turn. Closes the race where two requests
// arrive close together and both pass their "is this still valid?" check
// before either finishes. Checked and added synchronously, before any
// `await`, so there's no window for a second request to slip through.
//
// Lives here rather than in either router so the narrative routes and the
// combat routes share one set keyed by the *conversation* id - a combat turn
// and a narrative turn on the same chapter can never generate concurrently
// (specs/combat-encounters.md §5.3). In-memory is fine for the same reason
// it's fine in broadcaster.js: single server process, two users.
export const pendingReplies = new Set();
