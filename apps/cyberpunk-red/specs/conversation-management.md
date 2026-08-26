# Spec: Conversation Management

## Status
Implemented

## Summary
A sidebar lists all conversations, sorted by most recent activity, similar to a standard LLM chat UI (e.g. Claude.ai). No conversation is selected on page load; sending a message with none selected creates a new one. Users can rename conversations. The originally-planned "main" RP conversation (pinned, visually distinct) is deferred — see Decisions.

## Requirements
- [x] Left side of the UI is a vertical sidebar listing all conversations by name
- [x] A "+ New Convo" control sits at the top of the sidebar, at all times
- [x] On page load, no conversation is selected by default
- [x] With no conversation selected, the chat area shows an empty/waiting state (no message history to load), matching the "start a new chat" feel of a normal LLM UI
- [x] With no conversation selected, the message input's placeholder text reads "+ New Convo" (dim/placeholder styling, not real content)
- [x] Sending the first message while no conversation is selected creates a new conversation, named by default with today's date, with that message as its first
- [x] Each sidebar conversation entry has an ellipsis (⋯) menu; left-clicking it opens a menu with "Rename" and "Delete Convo" options
- [x] "Delete Convo" is only visible to the admin user (flagged in config — see [access-codes.md](../auth/access-codes.md)); the server rejects a delete request from a non-admin session regardless of UI state
- [x] Users can rename a conversation via the "Rename" menu option
- [x] Sidebar conversations are sorted by most recent activity (last message sent), most recent first
- [x] Sidebar conversation entries show a subtle highlight on mouseover
- [x] Selecting a conversation from the sidebar loads its message history into the chat area
- [x] Both users see the same shared set of conversations
- [x] Each conversation has its own independent message history; Claude's context (what it sees when asked to respond) is scoped to that conversation only
- [x] No more than 50 conversations exist at once — attempting to create a new one at the cap is blocked, with a message telling the user to delete old conversations first

## Decisions
- The "main" pinned/visually-distinct conversation ([product.md](../../steering/product.md)) is deferred, not built in this pass. The "+ New Convo" control already reserves the top of the sidebar, so re-introducing "main" later (e.g. pinned in that same top area) doesn't require reworking this layout. The existing seeded "Main" conversation from the shared-conversation feature just becomes a normal list item — no special treatment.
  - Update: this deferral is resolved by [main-story.md](main-story.md), though not in the originally-envisioned shape (a single pinned conversation). Instead it's a conversation *type* — any number of "Main Story" conversations, each with locked-in character names, marked with a book icon rather than pinned to the top.
- A conversation is created at send-time — when the first message is actually submitted — not while the user is merely typing into the placeholder-text input.
- Which conversation is "currently open" is local, per-browser-session UI state, not synced between the two users. The *set* of conversations is shared (existing requirement), but each user can independently browse a different conversation than the other at the same time.
- Default conversation name is today's date; exact display format is a plan.md detail, not a spec-level decision.
- Conversation deletion is restricted to the admin user (see [access-codes.md](../auth/access-codes.md) for the config flag). Only one user is ever admin, so there's no "by creator" ambiguity to resolve. As with every other access-control decision in this project, the real enforcement is server-side (checking `req.user.isAdmin` on the delete route) — the menu option being hidden in the UI is a convenience, not the guard.
- Conversation cap is 50. Hitting it while creating a new conversation blocks the action and surfaces an inline error message (reusing the existing `role="alert"` notice pattern already used elsewhere in the chat UI, e.g. the "DM already replied" case) rather than introducing a separate modal component for this one case — telling the user to delete old conversations first. No auto-delete/auto-archive of old conversations.
- Rename interaction: an inline edit (the sidebar entry's name becomes an editable text field in place) rather than a separate modal — fewer moving parts, consistent with the minimalist Claude.ai-like look ([product.md](../../steering/product.md)).
- Both menu actions (Rename, Delete Convo) live behind the same ellipsis menu per conversation entry, opened on left-click.

## Open Questions
None currently.
