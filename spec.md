# Monorepo Restructure Spec — Cyberpunk RED + D&D 5e Apps

## Goal

Combine two existing, currently-separate repos (`cyberpunk-red` and a disconnected `dnd5e` clone of it) into a single monorepo. Extract genuinely shared code into common packages so a feature only needs to be implemented once to appear in both apps, while keeping each app's game-specific logic, data, and visual styling fully intact and independently deployable.

This is a **restructure, not a rewrite**. No app behavior should change as a result of this work — if something looks or behaves differently afterward in either app, that's a regression to fix, not an intended outcome.

## Starting Point

- Create a new, empty repo.
- Pull in the existing `cyberpunk-red` repo's code (`client/`, `server/`, `mcp/`, plus any root-level config, steering files, and spec files) into the new repo.
- Pull in the existing `Laria5e` clone's code the same way.
- Both apps are sibling folders inside your parent folder:
  - "Cyberpunk Red RP"
  - "Laria-5e-RP"
- Both apps currently share a UI *layout* but differ in:
  - Theming: colors, fonts, some icons, header text, general look/feel
  - Right-panel character tooling (game-specific — 5e stats/skills differ substantially from RED)
  - Dice roller (completely different implementation per game)

## Non-Negotiable Constraints

1. **Data segregation.** Both apps connect to the same Postgres instance, but their data must be fully segregated — separate schemas (not just prefixed tables in one shared schema), with each app authenticating as its own Postgres role scoped to only its own schema. A bug in one app must not be able to read or write the other app's data, enforced at the database permission level, not just by naming convention.

2. **Separate resources per app.**
   - Separate MCP servers/resources per app (no shared MCP process or shared RAG index between games).
   - Separate environment variables per app (each app's client, server, and MCP process gets its own env vars — no shared `.env` assumptions).

3. **Preserve functionality differences exactly.** The dice roller and the right-panel character tooling are game-specific by design and must not be merged or genericized in a way that changes their behavior. Shared code should only cover what is genuinely identical between the two games.

4. **Preserve UI styling exactly, per app.** After restructuring, each app's visual output — colors, fonts, icons, header text, layout — must look and behave exactly as it did before the restructure. (The two apps are *not* meant to end up looking like each other — each keeps its own distinct theme. "No visual regression" means each app matches its own pre-restructure appearance.)

5. **Existing spec files are preserved.** Any spec/steering files that already exist in either app's repo must carry over into the new structure, not be deleted or silently merged away.

## Target Structure

Monorepo using npm workspaces, roughly:

```
/apps
  /cyberpunk-red
    /client   (React)
    /server   (Node)
    /mcp
  /dnd5e
    /client   (React)
    /server   (Node)
    /mcp
/packages
  /ui           (shared, theme-agnostic React components)
  /core         (shared domain/state logic, e.g. common Zustand slices)
  /server-core  (shared server plumbing — DB connection factory, auth middleware)
  /mcp-core     (shared MCP plumbing, e.g. common RAG pipeline code — NOT shared indices/data)
```

Shared packages hold logic only — no game-specific data, theming values, or per-app secrets. Each app supplies its own theme tokens, env vars, schema name, and MCP data source into the shared plumbing.

## Developer Workflow

- Running either app locally in dev mode must be a single simple npm command that clearly identifies which app is being run, e.g.:
  - `npm run dev:cyberpunk` → runs cyberpunk-red client + server (+ mcp if needed) in dev mode
  - `npm run dev:dnd5e` → runs dnd5e client + server (+ mcp if needed) in dev mode
- These are root-level scripts (in the root `package.json`) that internally call `npm run dev --workspace=apps/cyberpunk-red/client` (and so on for server/mcp), so nobody needs to remember or type per-workspace flags day-to-day.

## Future Deployment Plan (Render)

- Render will pull this single repo for each deployed service.
- Each Render service (per app, per process — client/server/mcp) is configured with its own build and start command that targets only that app's package, e.g. `npm run build --workspace=apps/cyberpunk-red/client` / `npm run start --workspace=apps/cyberpunk-red/client`.
- Each Render service has its own independent environment variable configuration, set in the Render dashboard per service.
- Not building the Render config itself yet — just structuring the repo so this is straightforward when we get there.
- The Cyberpunk app is live on Render now, with a production database (Postgres on Render) and an active roleplay campaign occurring. The Laria 5e is NOT deployed. Eventual prod deployment of this monorepo app will need to preserve the prod Cyberpunk data so it's not lost.

## Working Style

- This is a vibe-coding project — Claude Code should use judgment and move at a reasonable pace rather than requiring sign-off on every micro-decision.
- Each app's existing steering files are the high-level guidance for how that app's code should be approached and should continue to be followed after the move.
- Prefer incremental, verifiable steps over one large sweeping change: get both apps running unmodified inside the new structure first, then extract shared code piece by piece, confirming both apps still work after each extraction.
