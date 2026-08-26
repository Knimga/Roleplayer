# Structure

## Repo Layout
```
/
├── steering/               # Stable product/tech/structure docs — read regularly (this folder)
├── specs/                  # Handful of standalone reference notes on non-obvious gotchas (API quirks, deployment traps, race conditions) — not a workflow folder
├── client/                 # React frontend
├── server/                 # Node/Express backend (API + SSE)
└── mcp/                    # Node-based MCP server + lore .md files
    └── docs/               # Topic-specific .md files with subfolder structure (world, rules, factions, etc.)
```

## Vibe-Coded, Not Spec-Driven
- This project does not follow a spec.md/plan.md/tasks.md workflow
- Steering docs (`product.md`, `tech.md`, `structure.md`) are the stable, high-level reference — keep them current as the app changes
- `specs/` holds only a small set of reference docs worth preserving from the project this was forked from; add to it sparingly, only for genuinely non-obvious gotchas, not as a matter of course

## Naming Conventions
- Files: `kebab-case.md`
