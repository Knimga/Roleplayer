# Structure

## Repo Layout

```
/
├── steering/                    # Stable product/tech/structure docs (this folder) — shared across both apps
├── specs/
│   ├── *.md                     # Shared feature specs (functionality backed by shared code)
│   └── cyberpunk-red/           # Cyberpunk Red-only reference notes (game-specific rules/content)
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
- `specs/*.md` (root) holds feature specs for functionality genuinely shared between the two apps (backed by shared code in `packages/*`) — merged into one doc per feature rather than kept as separate per-app copies. `specs/cyberpunk-red/` holds the remainder: reference notes tied to Cyberpunk Red's own rules/content (e.g. its specific Role list, Stamina Points, the Night City map) with no laria5e equivalent. There's no `specs/laria5e/` folder — laria5e's few prior specs were either merged into the shared root docs or (in the case of its DB migration doc — n/a here) don't exist yet. All of these are historical reference only: not a gate on starting work, and not something that needs creating or updating for new feature work as a matter of course.
- A pre-existing pass flattened both apps' specs folders without updating each doc's internal cross-links, which still assume an older nested-subfolder layout (`../conversations/foo.md`, `../ui/bar.md`, etc.) — links directly touched by the root/cyberpunk-red split above were fixed as part of that split, but this isn't a guarantee every remaining internal link across every spec resolves correctly.

## Naming Conventions

- Files: `kebab-case.md`
- Shared packages: `@roleplayer/ui`, `@roleplayer/core`, `@roleplayer/server-core`, `@roleplayer/mcp-core` — imported via a raw-source exports map (e.g. `@roleplayer/ui/ChatView.jsx`), no build step.
