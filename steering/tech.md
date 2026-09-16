# Tech

## Stack

- Frontend: React
- Backend: Node.js + Express
- MCP server: Node.js (runs alongside/in-process with each app's own backend — not shared between apps, not a subprocess)
- Monorepo: npm workspaces (`apps/*`, `packages/*`) — see [structure.md](structure.md)

## Monorepo & Shared Code

- `npm run dev:cyberpunk` / `npm run dev:laria5e` from the repo root run each app's client + server together. Cyberpunk Red's client/server run on ports 5174/3002 so both apps can be up side by side; Laria 5e keeps Vite/Express's defaults, 5173/3001.
- `packages/ui` and `packages/core`: shared, theme-agnostic React components and domain/API logic — no build step, a raw-source exports map (`@roleplayer/ui/ChatView.jsx` imports the file directly). Holds anything byte-identical between the two apps, or made so by taking the per-app difference as a prop (e.g. `NewStoryModal`'s `detailField`/`detailOptions`: Role vs Class). See `packages/ui/src/` and `packages/core/src/` for the current contents — grows too often to enumerate here. `App.jsx` itself is the one deliberate exception: session/list logic is shared via `useAppSession`, but the JSX composition (header, `NewStoryModal` wrapper, `RightPanel`'s props) is exactly where the two apps diverge, so sharing the whole file was evaluated and declined.
- `packages/server-core`: shared server plumbing, same principle. Pure moves for zero-per-app-coupling code (`requireAuth.js`, `broadcaster.js`, `users.js`, `authRouter.js`, `dmSystemPromptCore.js`, `pendingReplies.js` — one in-flight-reply guard shared by each app's `/respond` and the combat router, keyed by conversation id so a chapter's narrative and combat turns can't overlap). Factory functions (`createX(...)`) where an app's schema/db/config gets injected — `db.js`, `settings.js`, `discordNotify.js`, the routers, `chapterSummary.js`, `blueprint.js`/`situationPass.js` (Blueprint/Situation, see `specs/campaign-situation.md`), the `combat/` folder (the game-agnostic combat engine — its `README.md` maps the whole handoff flow and the per-game module contract; see `specs/combat-encounters.md`), `app.js` (Express bootstrap; each app's `index.js` is just wiring). The `/summarize`/`/new-chapter` routes stay per-app despite their generators living here, since they still call the per-app `generateReply`. See `packages/server-core/src/` for the current contents.
- `packages/mcp-core`: empty placeholder. Checked directly — each app's `mcp/server.js` and `dice.js` are genuinely different (different tools, different dice math, different valid-sides sets), so there's little real shared surface here.
- Deliberately **not** shared, and shouldn't be: `schema.js`, `routes/conversations.js` (character-field-shaped), `DiceRoller.jsx`/`RightPanel.jsx`/the Hp/Sp/Ac trackers (game-specific mechanics — evaluated and declined: different field names, CSS ids, icons, and cyberpunk-red's HP tracker renders a Wound State line laria5e has no equivalent for), `MapModal.jsx`, `lib/claude.js` (per-app prompt assembly and model choice), the `server/combat/` folder (the game's combat module: what an enemy is, its stat tables and lookups, its dice, its mechanics prompt — everything Cyberpunk- or Laria-specific about a fight in one place, consumed by the shared engine through one exported object), all of `mcp/`, and every DM/combat system prompt.

## Handling Code Changes

When requested to make a code change, make sure it's absolutely clear whether the change should be something shared between apps, or app-specific. Confirm with the user if needed. When developing for a single app, always be on the lookout for things you can recommend to be shared (don't automatically execute on sharing them, just make recommendations).

## Hosting

- Render — both Cyberpunk Red and Laria 5e are deployed, each as its own single Web Service — Express serves both the API and the built React frontend (`client/dist`) from the same origin, avoiding CORS/cross-site-cookie complexity entirely. See `specs/render-hosting.md`. Build command (`npm ci --include=dev && npm run build --workspace=apps/<app>/client`) needs `--include=dev` explicitly — Render sets `NODE_ENV=production` for the build step, which makes plain `npm ci` skip `devDependencies` (where `vite` lives), so a bare `npm ci` fails the build with `vite: not found`.
- All required env vars are validated at server startup (`packages/server-core/src/app.js`'s env check) — missing one exits with a clear error rather than degrading silently (e.g. a missing `SESSION_SECRET` would otherwise produce forgeable session cookies instead of an obvious failure).

## Database

- Both apps share **one** Postgres instance, but each is confined to its own schema (`cyberpunk_red` / `laria5e`) via its own scoped login role. **Locally** (root `docker-compose.yml`) this is enforced at the database permission level — see `infra/postgres/init/01-schemas-and-roles.sql`. **In production (Render), it is not** — see the callout below.
- Each app's `lib/db.js` is a thin shim calling `packages/server-core`'s `createDb(schema)` with its own `schema.js`.
- Migrations run per-app (`npm run db:migrate` from that app's `server/`); each app's migration-tracking table lives inside its own schema, not a shared one.
- Cyberpunk Red's live production data was migrated from the old pre-monorepo setup (unscoped role, `public` schema) into its own `cyberpunk_red` schema, and Laria 5e's schema was created and migrated fresh — both done; see `specs/cyberpunk-red/prod-schema-migration.md` for the executed plan and the gotchas hit doing it live.

### ⚠️ Open gap: prod DB roles aren't actually schema-isolated

Render's managed Postgres has no dashboard option to create a properly scoped, low-privilege login role — "add a database user" just creates another full-access login, made a member of the database's owner role (auto `SET ROLE` on connect) but **without `ADMIN OPTION`** on that membership, which we'd need to revoke it or alter its attributes (e.g. `search_path`) ourselves. Consequences:

- Both `cyberpunkred_postgres_db_user` and `laria5e_postgres_db_user` currently have full read/write access to **both** schemas at the Postgres permission level, not just their own.
- Each app's prod `DATABASE_URL` sets `search_path` via `options=-c search_path=<schema>` on the connection string instead (`ALTER ROLE ... SET search_path` hit the same wall) — that only changes what an *unqualified* query resolves to by default. It is **not** an access boundary: a schema-qualified query, or a session's own `SET search_path`, would still reach the other app's data.
- **The only real protection is application-code discipline** — neither app's queries ever reference the other's schema — not anything the database enforces, unlike local dev.
- **Fixing this needs a Render support request** (grant `ADMIN OPTION` on the membership, or provision genuinely scoped roles) — not yet done. Revisit before this gap matters more, e.g. before either app's backend code sees less-trusted hands.

## AI

- MCP server (`@modelcontextprotocol/sdk`, per app's own `mcp/server.js`) linked to that app's backend in-process via `InMemoryTransport` — no subprocess, no network hop, and no shared MCP process or data between the two apps. Each app's `lib/claude.js` is its own MCP client, feeding the tool list to the Anthropic API and running a tool-use loop when Claude calls one.
- Doc-serving tools are shape-identical across apps (flat `.md` files under `mcp/docs/`, `list_*`/`read_*` tools with a `path.basename`-based containment check) but not shared code — the tool names, descriptions, and data are game-specific: `list_lore_files`/`read_lore_file` for Cyberpunk Red, `list_docs`/`read_doc` for Laria 5e.
- `roll_dice` and its dice math (`mcp/dice.js`) are genuinely different per game, deliberately not shared: Cyberpunk Red rolls d6/d10 only with one skill-check shape; D&D 5e supports the full d4–d20 set and gives a lone d20 separate crit/fumble treatment, with everything else resolving as a plain sum.
- Model: both apps pick Sonnet in dev / Opus in prod automatically via `NODE_ENV` (Render sets `NODE_ENV=production`; local dev leaves it unset), overridable per app with its own `ANTHROPIC_MODEL` env var.
- Narrative-mode instructions are assembled at request time, tone-first: each app's own `<app>-system-prompt.md` (opening line + Narration & Tone), then the shared `dm-system-prompt-core.md`, then each app's own `<app>-reference-files.md` (lore doc list). On top of that, two more cached tiers carry the DM's actual campaign state — a static Blueprint (premise + milestone arc) and a per-turn-rewritten Situation (objective, antagonist, established facts) — replacing the older idea that "which beat is active" was the only memory the DM needed. See `specs/campaign-situation.md`.
- Combat runs as a separate mode with its own DM: a `combats` record (handoff + growing enemy stat blocks) backs a short-lived transcript, isolated from the narrative prompt/tools/window entirely — its own always-loaded system prompt (shared `combat-dm-core.md` + each app's `combat/system-prompt.md`), its own tool set (`roll_dice`, `end_combat`, per-app ad hoc stat lookups), no Blueprint/Situation/window. See `specs/combat-encounters.md`.
- Prompt caching (`cache_control: { type: "ephemeral" }`) on system-prompt tiers, tool definitions, and everything but the newest turn of message history — cuts the cost of resending the whole transcript on every DM call. Pure cost/latency optimization, no effect on output; see `specs/prompt-caching.md`.

## Auth (shared — `packages/server-core`)

- Two hardcoded user slots per app, each with a personal access code and a fixed username, sourced from that app's own env vars (`USER_A_CODE`/`USER_A_USERNAME`/`USER_A_ADMIN`, `USER_B_*`, `SESSION_SECRET` — see each app's `server/.env.example`). The auth *code* is shared (`users.js`, `requireAuth.js`, `authRouter.js`); the actual codes/usernames are per-app config, never shared.
- One user slot per app is flagged `isAdmin`, exposed on the session (`req.user.isAdmin`) for gating admin-only actions — conversation deletion, starting a new chapter, the Settings modal.
- Session persists across page refresh via a signed session cookie. No user registration or account system.

## Conversations (shared architecture, per-app character data)

- Sidebar-listed conversations, sorted by most recent activity. Standalone (non-Story) conversation creation has been removed from the UI in both apps; on load, the app auto-selects the most recently active Story's latest chapter, or shows a "Start a new Story to begin" prompt if none exists yet.
- Cap of 50 conversations per app; hitting it blocks creating a new one until an old one is deleted (admin-only).
- Shared conversation state: both users see the same message history within a conversation; the *set* of conversations is shared, but which one is selected is local per-browser-session state, not synced live between users.
- Real-time push via Server-Sent Events (SSE): one `EventSource` per open conversation, carrying a typed envelope (`{ type, ...payload }`) on the same connection — narrative message events (`created`/`updated`/`deleted`), reply-in-flight state (`generating`/`failed`/`status`), `typing`, `character-updated`, and combat-mode's own set (`combat-started`/`combat-message`/`combat-message-updated`/`combat-message-deleted`/`combat-ended`). `packages/server-core/src/broadcaster.js` is the shared pub/sub.
- Claude never responds automatically — either user must explicitly ask for the DM's turn, rejected if the last message is already from Claude (no back-to-back DM turns) or if a reply is already in flight (the shared `pendingReplies` Set, checked-and-added synchronously before any `await`, so there's no race window — also what keeps a chapter's narrative and combat turns from overlapping). The pending state is broadcast over SSE so *both* players see the spinner.
- A right-side dice-roller panel lets a player build and submit a roll, posting as an ordinary message via the same message-insertion path as typing. The dice math itself is per-app — see AI section above.
- A Story is a `stories` row with its own independently-editable name, made of an ordered, append-only sequence of **chapters** (ordinary `conversations` rows with `storyId` set — the sole source of truth for "is this a Story conversation"; both apps have dropped a separate `isMainStory`/`isStory` flag as redundant with it). Only the latest chapter of a story is ever mutable; an earlier chapter's messages, rolls, DM replies, and character-field edits are permanently read-only for everyone, including the admin. Starting a new chapter (admin-only) reviews an AI-generated summary of the outgoing chapter before creating the next one, which opens with an automatic in-character scene-opening reply. See `specs/story-chapters.md` for the data-model reasoning and two sharp gotchas hit building it (an Anthropic API "`messages` must end in a `user` turn" constraint, and a Drizzle timestamp-truncation race).
- Right panel character identity is locked at Story creation (name + game-specific fields — see product.md) and otherwise per-app in shape: avatar, physical description, Weapons & Gear, and HP are common to both; Cyberpunk Red adds SP, Laria 5e adds AC. All of these (unlike the locked fields) are optional and editable any time after creation. Description and Gear are actually fed to Claude's system prompt (via each app's own `buildPlayerRoster` in `lib/claude.js`), not just displayed.
- Users can edit or delete their own messages; the admin can edit/delete either player's and the DM's. A message locks for everyone (including the admin) once any DM reply exists later in the conversation — so the admin can only touch the DM's latest reply — enforced server-side on every request, not trusted from client state. Edited DM messages carry `edited: true` but show no "(edited)" label.

## Discord Notifications (shared — `packages/server-core`)

- Optional per-player Discord webhook URL + Discord user ID (env vars) for cross-timezone "check the app" pings. Fires whenever one player causes a new-message event; only the *other* player's webhook is called, and their user ID is @-mentioned, never the actor's own.
- Shared factory: `packages/server-core/src/discordNotify.js`'s `createDiscordNotifier({ users, getSettings, appLabel, appUrl })`. Each app's `lib/discordNotify.js` is a thin shim supplying its own `users`/`getSettings` plus an `appLabel` ("Cyberpunk Red" / "Laria 5e", prepended to every message so a player in both games' Discord can tell which app pinged them) and `appUrl`.
- Gated by a master on/off toggle in the in-app admin Settings modal (persisted in Postgres, not an env var) — **defaults off** for a fresh deploy in both apps. This only affects a *new* `app_settings` row; it doesn't retroactively change an existing one — see `specs/cyberpunk-red/prod-schema-migration.md`.

## Persistence

- Postgres (Render managed Postgres in prod; a single shared Docker container locally for dev — see Database above).
- Accessed via Drizzle ORM (typed queries + migrations), per app's own `schema.js`.
- Stores: conversations, messages, user/session state, app settings.
- Lore/docs `.md` files remain flat files in each app's own repo (read by that app's MCP server), not in the database.
