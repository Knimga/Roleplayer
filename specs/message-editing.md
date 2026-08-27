# Spec: Message Editing & Deletion

## Status
Implemented

## Summary
Users can edit or delete their own messages; the admin can edit or delete either player's messages. GM (assistant) messages can never be changed by anyone. A message becomes locked — no longer editable or deletable, by anyone, including the admin — as soon as the GM has replied to anything after it, to keep the conversation's history internally consistent with what the GM actually reacted to.

## Requirements
- [x] A user can edit or delete their own messages (any conversation, including Main Story)
- [x] The admin can edit or delete either player's messages
- [x] GM (assistant-role) messages can never be edited or deleted, by anyone
- [x] A message is locked (no edit, no delete) once any GM reply exists later in the conversation than that message — this applies to everyone, including the admin
- [x] Edits and deletes are reflected live for both users via SSE, not just a local optimistic update
- [x] Deleting/editing the most recent message correctly updates the sidebar's recency sort and the "Ask the DM" availability (both already derive from message state, not new logic)
- [x] An edited message is visibly marked as edited, so the other player can tell its content changed after the fact

## Decisions
- **Lock applies to everyone, including the admin.** Resolved via direct question — the alternative (admin override) risks leaving an existing GM reply referencing content that's since been changed or removed.
- **New `messages.author_username` column.** The existing `sender` column already holds a *display* name, which is the character name (not the real username) in a Main Story conversation — there's no reliable way to derive "did the current user actually write this" from `sender` alone once two characters could plausibly share a name. A dedicated column always stores the real authenticated username, independent of what's displayed, and is what ownership checks actually key on.
- **New `messages.edited` boolean**, defaulted false, set true on a successful edit. Drives the "edited" indicator in the UI. Deletes don't need an equivalent flag — the row is actually removed, not soft-deleted (matches how conversation deletion already works: real removal, no tombstone).
- **Locking check is server-side, evaluated at request time**: "does a message with `role = 'assistant'` exist in this conversation with a later `created_at`". This is re-checked on every edit/delete request rather than trusted from client state, which also correctly handles the race where a GM reply lands in the DB moments before an edit/delete request arrives — the request simply gets rejected as locked, same as if the lock had already been visible client-side.
- **SSE protocol gains an envelope.** Today `publish(conversationId, message)` sends a bare message object and the client always appends it. Edit/delete need the client to update-in-place or remove an existing message instead of appending, so published events become `{ type: "created" | "updated" | "deleted", message }` (delete only needs the id, but sending the full row keeps the shape uniform and simple).
- **UI**: small hover-revealed icon actions (edit / delete) on a message, shown only when the current user has permission for that specific message — hidden entirely otherwise (not shown-disabled), matching how "Delete Convo" is already hidden rather than disabled for non-admins. This leans on Claude.ai's own per-message hover actions, matching the "mimic the UI of Claude.ai" direction in [product.md](../steering/product.md), rather than the ellipsis-dropdown pattern used for conversations (that pattern fits a sidebar list item; a hover toolbar fits an individual chat message better).
- **Edit interaction**: inline, like conversation rename — the bubble's content becomes an editable textarea in place, Enter/blur-equivalent commits, Escape cancels. No separate modal.
- **Delete interaction**: `window.confirm()`, matching the existing "Delete Convo" pattern — no custom modal.
- **`last_message_at` is recomputed after a delete** if the deleted message was the conversation's most recent — falls back to the conversation's own `created_at` if that was its only message (a conversation can now end up with zero messages; this isn't specially prevented, it just behaves like any other conversation with no history yet).

## Open Questions
None currently.
