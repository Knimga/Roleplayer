# Structure

## Repo Layout

```
/
├── steering/                    # Stable product/tech/structure docs (this folder) — shared across both apps
├── specs/
│   ├── *.md                     # Shared feature specs (functionality backed by shared code)
│   ├── cyberpunk-red/           # Cyberpunk Red-only reference notes (game-specific rules/content)
│   └── laria5e/                 # Laria-only specs
├── ui-handoff/                  # Design mockups from an outside designer — styling/layout only (see below)
├── infra/
│   └── postgres/init/           # Local dev Postgres bootstrap (schemas + scoped roles)
├── docker-compose.yml           # Single shared local Postgres instance for both apps
├── package.json                 # Root npm workspace — dev:cyberpunk / dev:laria5e scripts
├── apps/
│   ├── cyberpunk-red/
│   │   ├── client/              # React frontend
│   │   ├── server/              # Node/Express backend (API + SSE)
│   │   ├── mcp/                 # MCP server + docs/*.md lore files
│   │   ├── steering/            # (none — moved to root steering/)
│   │   └── specs/               # (none — moved to root specs/, or specs/cyberpunk-red/ if app-specific)
│   └── laria5e/
│       └── ...                  # same shape as cyberpunk-red
└── packages/
    ├── ui/                      # Shared, theme-agnostic React components
    ├── core/                    # Shared domain/API logic (client-side)
    ├── server-core/             # Shared server plumbing (auth, db factory, app bootstrap, etc.)
    └── mcp-core/                # Empty placeholder — little genuine overlap found so far
```

## Vibe-Coded, Not Spec-Driven

- Neither app follows a spec.md/plan.md/tasks.md workflow day to day.
- Steering docs (`steering/product.md`, `steering/tech.md`, `steering/structure.md`) are the stable, high-level reference for the whole monorepo — keep them current as things change, in both apps.
- `specs/*.md` (root) holds feature specs for functionality genuinely shared between the two apps (backed by shared code in `packages/*`) — merged into one doc per feature rather than kept as separate per-app copies. `specs/cyberpunk-red/` holds the remainder: reference notes tied to Cyberpunk Red's own rules/content (e.g. its specific Role list, Stamina Points, the Night City map) with no laria5e equivalent. `specs/laria5e/` holds the Laria-only equivalents (first entry: `character-spells.md`, 2026-09-17); laria5e's earlier specs were merged into the shared root docs. All of these are historical reference only: not a gate on starting work, and not something that needs creating or updating for new feature work as a matter of course.
- `ui-handoff/` holds mockups (HTML) and readmes from an outside designer who doesn't know the app's data model or granular functionality. Use them for **styling and layout only** — colors, spacing, typography, arrangement. Treat everything else in them as placeholder: field names, values, labels, counts, and what a control appears to do are likely to be a bit off. The app is the source of truth for values and purpose. Where a mockup contradicts it (a field the data doesn't have, a status shown differently from how the app computes it, a behavior the app relies on that the mockup leaves out), keep the app's behavior and apply only the mockup's look — and ask the user whenever it's unclear which side a detail belongs to, rather than guessing.
- All internal spec cross-links were swept and verified to resolve to a real file as of the root/cyberpunk-red split above — this includes fixing a batch of dangling links left over from an earlier, unrelated pass that had flattened both apps' specs folders without updating each doc's nested-subfolder-style cross-links, plus a handful pointing at docs that no longer exist at all (`ready-status-placeholder.md`, `skill-checks-and-dice.md`, `plan-character-hp.md`/`plan-character-sp.md` — all early/superseded planning docs, references removed or redirected to their replacement spec). Keep links resolvable when moving or renaming a spec file going forward.

## Naming Conventions

- Files: `kebab-case.md`
- Shared packages: `@roleplayer/ui`, `@roleplayer/core`, `@roleplayer/server-core`, `@roleplayer/mcp-core` — imported via a raw-source exports map (e.g. `@roleplayer/ui/ChatView.jsx`), no build step.
