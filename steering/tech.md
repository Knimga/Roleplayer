# Tech

## Stack

- Frontend: React
- Backend: Node.js + Express
- MCP server: Node.js (runs alongside/in-process with each app's own backend — not shared between apps, not a subprocess)
- Monorepo: npm workspaces (`apps/*`, `packages/*`) — see [structure.md](structure.md)

## Monorepo & Shared Code

- `npm run dev:cyberpunk` / `npm run dev:laria5e` from the repo root run each app's client + server together. Cyberpunk Red's client/server run on ports 5174/3002 so both apps can be up side by side; Laria 5e keeps Vite/Express's defaults, 5173/3001.
- `packages/ui` and `packages/core`: shared, theme-agnostic React components and domain/API logic. No build step — package.json uses a raw-source exports map (`"./*": "./src/*"`), so apps import e.g. `@roleplayer/ui/ChatView.jsx` directly. Holds everything verified byte-identical between the two apps, or made so by taking the per-app difference as a prop: `ChatView`, `AvatarUpload`, `NewChapterModal`, `LoginScreen`, `SettingsModal`, `CharacterTextField`, `AnimatedGMReply`, `LeftPanel` (takes `header` and `NewStoryModal` as props — each app's own logo/wordmark and its own pre-bound `NewStoryModal` wrapper), `NewStoryModal` (takes `detailField`/`detailLabel`/`detailLabelPlural`/`detailOptions` — Role/ROLES vs Class/CLASSES), `NumberBarTracker` (already fully generic — a labeled current/max bar taking `saveFn`/`colorClass`/etc. as props, no per-app change needed; used by both apps' HpTracker and cyberpunk-red's SpTracker) (ui); `groupConversations`, `woundState`, `api/auth.js`, `api/settings.js`, `api/stories.js`, and the bulk of `api/conversations.js` (core).
- `packages/server-core`: shared server plumbing, same principle. Pure moves for code with zero per-app coupling — `requireAuth.js`, `broadcaster.js`, `users.js`, `authRouter.js`. Factory functions (`createX(...)`) for code that needs an app's own schema/db/config injected, since that part is game-specific — `db.js` (`createDb(schema)`), `settings.js` (`createSettingsLib(db, appSettings)`), `discordNotify.js` (`createDiscordNotifier({ users, getSettings, appLabel, appUrl })`), `storiesRouter.js` / `settingsRouter.js`, and `app.js` (the generic Express bootstrap — env var validation, CORS, body/cookie parsing, static serving — each app's own `index.js` is now just wiring).
- `packages/mcp-core`: empty placeholder. Checked directly — each app's `mcp/server.js` and `dice.js` are genuinely different (different tools, different dice math, different valid-sides sets), so there's little real shared surface here.
- Deliberately **not** shared, and shouldn't be: `schema.js` (game-specific data model), `routes/conversations.js` (character-field-shaped), `DiceRoller.jsx` / `RightPanel.jsx` / the Hp/Sp/Ac trackers (game-specific mechanics — `RightPanel` was evaluated but declined for now, since sharing it would need real parameterization: a different character-details field name, a different CSS id, different icons; `HpTracker.jsx` was evaluated too and also declined — cyberpunk-red renders an extra Wound State label line laria5e has no equivalent for), `Party.jsx` / `PartyMemberModal.jsx` / `MapModal.jsx`, `lib/claude.js` (per-app system prompt assembly and model choice), all of `mcp/`, and the DM system prompts.

## Handling Code Changes
When requested to make a code change, make sure it's absolutely clear whether the change should be something shared between apps, or app-specific. Confirm with the user if needed.

## Hosting

- Render (public deployment for Cyberpunk Red; Laria 5e not yet deployed), each app as a single Web Service — Express serves both the API and the built React frontend (`client/dist`) from the same origin, avoiding CORS/cross-site-cookie complexity entirely. See `specs/cyberpunk-red/render-hosting.md`.
- All required env vars are validated at server startup (`packages/server-core/src/app.js`'s env check) — missing one exits with a clear error rather than degrading silently (e.g. a missing `SESSION_SECRET` would otherwise produce forgeable session cookies instead of an obvious failure).

## Database

- Both apps share **one** Postgres instance (root `docker-compose.yml` locally), but each is confined to its own schema (`cyberpunk_red` / `laria5e`) via its own scoped login role — enforced at the database permission level, not naming convention. See `infra/postgres/init/01-schemas-and-roles.sql`.
- Each app's `lib/db.js` is a thin shim calling `packages/server-core`'s `createDb(schema)` with its own `schema.js`.
- Migrations run per-app (`npm run db:migrate` from that app's `server/`); each app's migration-tracking table lives inside its own schema, not a shared one.
- Cyberpunk Red's production database is still on the old pre-monorepo setup (unscoped role, `public` schema) — migrating it is a deliberate, not-yet-executed, separate step given it holds live campaign data. See `specs/cyberpunk-red/prod-schema-migration.md`.

## AI

- MCP server (`@modelcontextprotocol/sdk`, per app's own `mcp/server.js`) linked to that app's backend in-process via `InMemoryTransport` — no subprocess, no network hop, and no shared MCP process or data between the two apps. Each app's `lib/claude.js` is its own MCP client, feeding the tool list to the Anthropic API and running a tool-use loop when Claude calls one.
- Doc-serving tools are shape-identical across apps (flat `.md` files under `mcp/docs/`, `list_*`/`read_*` tools with a `path.basename`-based containment check) but not shared code — the tool names, descriptions, and data are game-specific: `list_lore_files`/`read_lore_file` for Cyberpunk Red, `list_docs`/`read_doc` for Laria 5e.
- `roll_dice` and its dice math (`mcp/dice.js`) are genuinely different per game, deliberately not shared: Cyberpunk Red rolls d6/d10 only with one skill-check shape; D&D 5e supports the full d4–d20 set and gives a lone d20 separate crit/fumble treatment, with everything else resolving as a plain sum.
- Model: both apps pick Sonnet in dev / Opus in prod automatically via `NODE_ENV` (Render sets `NODE_ENV=production`; local dev leaves it unset), overridable per app with its own `ANTHROPIC_MODEL` env var.
- Model instructions (narration style, tone, game rules, DM behavior, when to call `roll_dice`) are injected via system prompt — per app, see each app's `server/config/dm-system-prompt.txt`.
- Prompt caching (`cache_control: { type: "ephemeral" }`) on the system prompt, tool definitions, and everything but the newest turn of message history — cuts the cost of resending the whole transcript on every "Ask the DM" call. Pure cost/latency optimization, no effect on output. Same pattern in both apps; see `specs/*/prompt-caching.md`.

## Auth (shared — `packages/server-core`)

- Two hardcoded user slots per app, each with a personal access code and a fixed username, sourced from that app's own env vars (`USER_A_CODE`/`USER_A_USERNAME`/`USER_A_ADMIN`, `USER_B_*`, `SESSION_SECRET` — see each app's `server/.env.example`). The auth *code* is shared (`users.js`, `requireAuth.js`, `authRouter.js`); the actual codes/usernames are per-app config, never shared.
- One user slot per app is flagged `isAdmin`, exposed on the session (`req.user.isAdmin`) for gating admin-only actions — conversation deletion, starting a new chapter, the Settings modal.
- Session persists across page refresh via a signed session cookie. No user registration or account system.

## Conversations (shared architecture, per-app character data)

- Sidebar-listed conversations, sorted by most recent activity. Standalone (non-Story) conversation creation has been removed from the UI in both apps; on load, the app auto-selects the most recently active Story's latest chapter, or shows a "Start a new Story to begin" prompt if none exists yet.
- Cap of 50 conversations per app; hitting it blocks creating a new one until an old one is deleted (admin-only).
- Shared conversation state: both users see the same message history within a conversation; the *set* of conversations is shared, but which one is selected is local per-browser-session state, not synced live between users.
- Real-time push via Server-Sent Events (SSE): one `EventSource` per open conversation, carrying a typed envelope (`{ type, ...payload }`) — `created`/`updated`/`deleted` message events, `generating`/`failed` (DM-reply-in-flight state, no `message` payload), `typing` (carries `sender`/`senderUsername` instead), and `character-updated` all reuse the same connection. `packages/server-core/src/broadcaster.js` is the shared pub/sub.
- Claude never responds automatically — either user must explicitly ask for the DM's turn, and the request is rejected if the last message is already from Claude (no back-to-back DM turns) or if a reply is already in flight (an in-memory `pendingReplies` Set, checked-and-added synchronously before any `await` so there's no race window). The pending state is broadcast over SSE so *both* players see the spinner, not just whoever clicked it.
- A right-side dice-roller panel lets a player build and submit a roll, posting as an ordinary message via the same message-insertion path as typing. The dice math itself is per-app — see AI section above.
- A Story is a `stories` row with its own independently-editable name, made of an ordered, append-only sequence of **chapters** (ordinary `conversations` rows with `storyId` set — the sole source of truth for "is this a Story conversation"; both apps have dropped a separate `isMainStory`/`isStory` flag as redundant with it). Only the latest chapter of a story is ever mutable; an earlier chapter's messages, rolls, DM replies, and character-field edits are permanently read-only for everyone, including the admin. Starting a new chapter (admin-only) reviews an AI-generated summary of the outgoing chapter before creating the next one, which opens with an automatic in-character scene-opening reply. See `specs/*/story-chapters.md` for the data-model reasoning and two sharp gotchas hit building it (an Anthropic API "`messages` must end in a `user` turn" constraint, and a Drizzle timestamp-truncation race).
- Right panel character identity is locked at Story creation (name + game-specific fields — see product.md) and otherwise per-app in shape: avatar, physical description, Weapons & Gear, and HP are common to both; Cyberpunk Red adds SP, Laria 5e adds AC. All of these (unlike the locked fields) are optional and editable any time after creation. Description and Gear are actually fed to Claude's system prompt (via each app's own `buildPlayerRoster` in `lib/claude.js`), not just displayed.
- Users can edit or delete their own messages; the admin can edit/delete either player's. GM messages are never editable/deletable by anyone, and a message locks for everyone (including the admin) once any GM reply exists later in the conversation — enforced server-side on every request, not trusted from client state.

## Discord Notifications (shared — `packages/server-core`)

- Optional per-player Discord webhook URL + Discord user ID (env vars) for cross-timezone "check the app" pings. Fires whenever one player causes a new-message event; only the *other* player's webhook is called, and their user ID is @-mentioned, never the actor's own.
- Shared factory: `packages/server-core/src/discordNotify.js`'s `createDiscordNotifier({ users, getSettings, appLabel, appUrl })`. Each app's `lib/discordNotify.js` is a thin shim supplying its own `users`/`getSettings` plus an `appLabel` ("Cyberpunk Red" / "Laria 5e", prepended to every message so a player in both games' Discord can tell which app pinged them) and `appUrl`.
- Gated by a master on/off toggle in the in-app admin Settings modal (persisted in Postgres, not an env var) — **defaults off** for a fresh deploy in both apps. This only affects a *new* `app_settings` row; it doesn't retroactively change an existing one — see `specs/cyberpunk-red/prod-schema-migration.md`.

## Persistence

- Postgres (Render managed Postgres in prod; a single shared Docker container locally for dev — see Database above).
- Accessed via Drizzle ORM (typed queries + migrations), per app's own `schema.js`.
- Stores: conversations, messages, user/session state, app settings.
- Lore/docs `.md` files remain flat files in each app's own repo (read by that app's MCP server), not in the database.
