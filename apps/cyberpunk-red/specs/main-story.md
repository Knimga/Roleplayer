# Spec: Main Story

## Status
Implemented (UI-facing term later renamed to "Story" — frontend only, see Decisions)

## Summary
A "Main Story" (UI now calls this a **Story**; see Decisions) is a conversation variant that locks in each player's character name up front (distinct from their login username), labels all messages in that conversation by character name instead of username, and is visually marked in the sidebar with a book icon. This is effectively how the originally-deferred "main RP conversation" concept ([conversation-management.md](conversation-management.md) Decisions) comes back — not as a single pinned conversation, but as a conversation *type* you can create any number of, each tied to its own pair of character identities. It later grew into [story-chapters.md](story-chapters.md): a Story can span multiple locked, ordered chapters.

## Requirements
- [x] A "+ New Main Story" control sits in the sidebar, above the existing "+ New Convo" control
- [x] Clicking it prompts for each player's character name before anything is created — both fields required, cancelable without creating a conversation
- [x] Submitting creates the conversation immediately (unlike a regular new convo, which is only created once a first message is sent — see Decisions)
- [x] Character names have the first letter force-capitalized after submission
- [x] A character name is fixed once its Main Story is created — no way to edit it afterward, to keep the narrative's naming consistent
- [x] In a Main Story conversation, every message (from either player) is labeled with that player's character name, not their username
- [x] Main Story conversations appear in the same sidebar list as regular conversations (same sort-by-recent-activity order, same 50-conversation cap), marked with a soft yellow book icon in front of the name
- [x] Rename and Delete behave identically to regular conversations (rename affects the conversation's title only, never the locked character names; delete remains admin-only)

## Decisions
- **Character name storage**: a `character_names` JSON column on `conversations` (`{ "<username>": "<character name>" }`), populated once at creation and never updated. Reusing the existing per-user config keys (usernames) as the map's keys avoids a new table for what's always exactly two entries.
- **Message attribution**: when a message is posted in a Main Story conversation, the server resolves the poster's character name from `character_names[req.user.username]` and stores *that* in the message's existing `sender` column — the same column already used for username in regular conversations. This means `ChatView`'s message rendering needs no conversation-type branching at all; it already just renders `m.sender`.
- **What Claude sees**: since `sender` already holds the character name for Main Story messages, [claude.js](../../server/lib/claude.js)'s existing username-prefixing logic automatically prefixes with character names for these conversations with no changes needed there. The player-roster line it builds (currently "The two players are Evan and Nick") should say the character names instead for Main Story conversations — this does need a small change, passing the conversation's character names through to `generateReply` when present.
- **Name-gathering UI**: a small modal with two text fields (one per configured user), not the native `window.confirm()`/`prompt()` used elsewhere in this project — those only support a single field, and two names need to be gathered together before anything is created.
- **Creation timing**: unlike a regular new conversation (created lazily at first-message send, per [conversation-management.md](conversation-management.md)), a Main Story is created as soon as the name form is submitted — no message required yet. Submitting the form is already the deliberate "commit" gesture; requiring a first message on top of that would be redundant friction.
- **Default title**: the conversation's display name (the thing Rename edits) defaults to "`<Character A> & <Character B>`" instead of today's date — more meaningful for a Main Story than a bare date, given the character names are already being collected right there.
- **Shared cap and list**: Main Story conversations count against the same 50-conversation cap and live in the same list/sort order as regular conversations — no separate limit or section.
- **No cap on how many Main Stories can exist** — "+ New Main Story" can be clicked repeatedly, same as "+ New Convo"; nothing in the request restricts this to one at a time.
- **Icon**: a book emoji (📖) in front of the name — already reads as warm/yellow, no custom icon asset needed.
- **Who enters the names**: the creating user fills in both character names in the same modal (assumes the two players are coordinating live) — a single form, single submit, conversation created immediately. No separate per-player confirmation step.
- **UI-facing term renamed "Main Story" → "Story", frontend only.** All player-visible text changed: the sidebar button ("+ New Story"), the creation modal (`NewStoryModal.jsx`, renamed from `NewMainStoryModal.jsx`), its frontend function (`createStory`), CSS class (`.story-icon`). The backend, database, and API were deliberately left alone — the `is_main_story` column, `isMainStory` field on every conversation row/API response, the `POST /api/conversations/main-story` route, and this spec's own filename all still say "Main Story". Renaming those too would mean a column migration and a route change for zero user-visible benefit, since nobody but the developer ever sees those names. Anywhere the two names meet in code (e.g. `Sidebar.jsx` reading `c.isMainStory`), there's a comment noting the mismatch is intentional.

## Open Questions
None currently.
