# Spec: Shared Conversation

## Status
Implemented

## Summary
Both users participate in the same conversation with Claude. Messages sent by either user are visible to both in real time.

## Requirements
- [x] Both users see the same message history
- [x] Messages are attributed to their sender by username (not "User A"/"User B"), or to Claude/DM
- [x] New messages appear for both users without requiring a page refresh
- [x] Claude's responses are generated in response to the full shared context
- [x] Message order is consistent for both users
- [x] Claude does not respond automatically after a user message — either user must explicitly request the DM's reply
- [x] Requesting a DM reply when the last message in the conversation is already from Claude is rejected — a user message must come first
- [x] If both users request the DM's reply at nearly the same time, only the first request is honored — the second is rejected rather than producing two DM replies in a row
- [x] Both users see the "awaiting reply" spinner while a DM reply is generating, not just whoever clicked "Ask the DM"

## Decisions
- Real-time transport: Server-Sent Events (SSE). Server pushes new messages to connected clients; clients send messages via HTTP POST
- Conversation history persists in Postgres, accessed via Drizzle ORM. Local dev Postgres runs in Docker
- Turn structure: Claude never replies automatically. Either user can explicitly ask for the DM's turn; the server rejects that request if the last message in the conversation is already from Claude, preventing back-to-back DM turns with no user message in between
- **Concurrent "Ask the DM" race**: found via real play-testing — two users clicking "Ask the DM" close together could both pass the "last message isn't already Claude's" check before either reply was inserted, producing two DM replies in a row. Fixed with an in-memory `Set` of conversation ids currently generating a reply (`pendingReplies` in `server/routes/conversations.js`), checked and added synchronously before any `await` in the route handler — same in-memory, single-process assumption `server/lib/broadcaster.js` already makes (two users, no horizontal scaling, no Redis needed). The second request is rejected with a 409 the instant it arrives, without waiting on anything async, so there's no window for both to slip through.
- **Shared spinner**: the SSE envelope (`{ type, message }`, see [message-editing.md](../chat/message-editing.md)) gains two more types with no `message` payload — `"generating"` (published the moment a reply request is accepted, before calling Claude) and `"failed"` (published if generation throws, so a real failure doesn't leave both players' spinners stuck forever). Both clients set `awaitingReply` from `"generating"`; the existing `"created"` handling for an assistant message already clears it for whoever sees the reply arrive, so `"failed"` is the only new clear-path needed.
- **This same envelope has since grown two more type-only-no-`message` variants**: `"character-updated"` (see [party-panel.md](../right-panel/party-panel.md)) and `"typing"` (which carries `sender`/`senderUsername` instead of `message` — see [typing-indicator.md](typing-indicator.md)). All of them share the same shape: one `EventSource` per open conversation, no new connections per feature.
- Claude model: `claude-opus-5` via the Anthropic API (originally `claude-sonnet-5`, switched later for narration quality)
- Offline user handling: messages always persist to Postgres regardless of SSE connection state. A reconnecting/loading client fetches full history over a regular GET endpoint, then subscribes to SSE for anything new — nothing is lost, there's no real "queueing" needed
- Anthropic API key is stored in a local `.env` file (gitignored), never committed — this applies regardless of the temporary repo-committed access codes, since leaking an API key is a real cost/abuse risk even pre-deployment
- No full DM system prompt yet (that's [dm-system-prompt.md](../model-instructions/dm-system-prompt.md), not yet planned) — this feature ships with a minimal placeholder system prompt, swapped out when that spec is implemented
