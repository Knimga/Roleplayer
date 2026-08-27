# Structure

## Repo Layout

```
/
├── steering/                    # Stable product/tech/structure docs (this folder) — shared across both apps
├── specs/
│   ├── cyberpunk-red/           # Cyberpunk Red's per-feature reference notes
│   └── laria5e/                 # Laria 5e's per-feature reference notes
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
│   │   └── specs/               # (none — moved to root specs/cyberpunk-red/)
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
- `specs/cyberpunk-red/` and `specs/laria5e/` hold per-feature reference notes — useful "why" context (decisions, tradeoffs, bugs found while building) worth checking when relevant, but historical reference only: not a gate on starting work, and not something that needs creating or updating for new feature work as a matter of course.
- Content isn't merged between the two apps' specs folders even where a filename matches on both sides (e.g. `story-chapters.md`, `prompt-caching.md`) — each records that app's own implementation, which usually differs in some real detail even when the shape is similar.

## Naming Conventions

- Files: `kebab-case.md`
- Shared packages: `@roleplayer/ui`, `@roleplayer/core`, `@roleplayer/server-core`, `@roleplayer/mcp-core` — imported via a raw-source exports map (e.g. `@roleplayer/ui/ChatView.jsx`), no build step.
