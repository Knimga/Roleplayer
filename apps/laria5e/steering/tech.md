# Tech

## Stack
- Frontend: React
- Backend: Node.js + Express
- MCP server: Node.js (runs alongside/in-process with the backend)

## Hosting
- Render (public deployment), as a single Web Service — Express serves both the API and the built React frontend (`client/dist`) from the same origin, avoiding CORS/cross-site-cookie complexity entirely. See [render-hosting.md](../specs/render-hosting.md).
- All required env vars are validated at server startup — missing one exits with a clear error rather than degrading silently (e.g. a missing `SESSION_SECRET` would otherwise produce forgeable session cookies instead of an obvious failure). Follow this pattern for any new required config.

## AI
- Model: `claude-sonnet-5` in dev, `claude-opus-5` in prod, picked automatically by `NODE_ENV` in `server/lib/claude.js`; overridable with `ANTHROPIC_MODEL`.
- Real MCP server (`@modelcontextprotocol/sdk`, `mcp/server.js`) exposing `list_docs`/`read_doc` (recursive, topic-subfoldered `.md` files under `mcp/docs/`) and `roll_dice` (NPC/enemy rolls only — players roll their own) — linked to the backend in-process via `InMemoryTransport`, not a subprocess or network hop. `server/lib/claude.js` is the MCP client. See [docs-file-access.md](../specs/docs-file-access.md).
- Model instructions (narration style, game rules, DM behavior) injected via system prompt.
- Prompt caching (`cache_control`) on the system prompt, tool definitions, and all but the newest turn of history, to cut the cost of resending the whole transcript every turn. See [prompt-caching.md](../specs/prompt-caching.md) for breakpoint placement.

## Auth
- Two hardcoded user slots, each with a personal access code and a fixed username, sourced from env vars (`USER_A_CODE`/`USER_A_USERNAME`/`USER_A_ADMIN`, `USER_B_*`, `SESSION_SECRET`) — see `server/.env.example`.
- One slot is flagged `isAdmin`, exposed on the session for gating admin-only actions (conversation deletion, starting a new chapter, settings).
- Session persists across refresh via a signed cookie. No registration/account system.

## Conversations
- Every conversation is a Story chapter — standalone conversation creation was removed from the UI (the underlying route/API still exist but are unused). On page load the app auto-selects the most recently active story's latest chapter; if no story exists yet, the composer is replaced with a prompt to start one.
- Cap of 50 conversations; hitting it blocks creating a new one until an old one is deleted (admin-only).
- Shared vs. local state: message history and the *set* of conversations are shared between both users; which one is currently selected is local per-browser-session state, not synced live.
- Real-time push via Server-Sent Events (SSE): one `EventSource` per open conversation, carrying a typed envelope (`{ type, ...payload }`) — new message, edit, delete, generating/failed, typing, and character-field-updated all reuse this same connection rather than opening a new one per feature. Clients send via regular HTTP POST.
- Claude never replies automatically — either user must explicitly ask, and a request is rejected if the last message is already from Claude (no back-to-back DM turns) or if a reply is already in flight. See [shared-conversation.md](../specs/shared-conversation.md) for the concurrency details.
- A story is a `stories` row with its own name, made of an ordered, append-only sequence of **chapters** (ordinary `conversations` rows with `storyId` set). Only the latest chapter of a story is mutable — everything about an earlier one (messages, rolls, DM replies, character-field edits) is permanently read-only for everyone, including the admin. Starting a new chapter (admin-only) reviews an AI-generated summary of the outgoing chapter before creating the next one. See [story-chapters.md](../specs/story-chapters.md) for the data-model reasoning and a couple of sharp Anthropic-API/Postgres gotchas hit building it.
- Right panel character identity: Story creation locks in a name, Class, and Level per player (`character_details` jsonb, `{ playerClass, level }`); avatar, physical description, Weapons & Gear, HP, and AC are all optional/mutable and editable any time, unlike the locked fields — AC defaults to 16 and is edited via a plain always-focusable input (`character_ac` jsonb, `{ username: number }`), not the click-to-edit-number pattern HP uses. Description and Gear are actually fed to Claude's system prompt, not just displayed — they inform how NPCs react and what's visibly carried. See [character-avatar.md](../specs/character-avatar.md) for avatar storage.
- Users can edit/delete their own messages; the admin can edit/delete either player's. GM messages are never editable by anyone, and any message locks once a later GM reply exists in the conversation (enforced server-side, not trusted from client state).
- The right-side dice roller posts a roll as an ordinary message, sharing its dice/crit math with the NPC `roll_dice` MCP tool (`mcp/dice.js`).

## Persistence
- Postgres (Render managed in prod; Docker locally), accessed via Drizzle ORM (typed queries + migrations).
- Stores conversations, messages, and user/session state. `mcp/docs/**/*.md` stay as ordinary repo files, not in the database.
