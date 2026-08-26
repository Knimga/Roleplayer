# Spec: MCP Server — Lore File Access

## Status
Implemented

## Summary
An MCP server exposes local `.txt` files within the repo to Claude, giving it access to large amounts of lore, rules, and world-building content organized by topic.

## Requirements
- [x] MCP server runs alongside the app (or as a sidecar service)
- [x] Server can read `.txt` files from a designated `mcp/lore/` directory
- [x] Files are organized by topic (e.g., `world.txt`, `factions.txt`, `rules.txt`)
- [x] Claude can query specific files or search across them via MCP tools
- [x] Adding or updating lore files does not require code changes

## File Organization (Planned)
```
mcp/lore/
├── world.txt         # Setting overview, city descriptions
├── factions.txt      # Gangs, corps, NPC groups
├── rules.txt         # Core game rules summary
├── npcs.txt          # Named NPCs and their details
└── ...               # Additional topic files as needed
```

## Decisions
- MCP server runtime: Node.js (matches the rest of the stack)
- **Real MCP protocol, in-process**: built with the official MCP SDK (`@modelcontextprotocol/sdk`), linked to the backend via an in-memory transport pair — no subprocess, no network hop, no publicly-reachable URL needed (which rules out Anthropic's remote MCP connector for a local/pre-Render setup like this one). `claude.js` acts as the MCP client: on each DM turn it lists the MCP server's tools, passes their schemas through to the Anthropic API's tool-use, and when Claude calls one, forwards that call to the MCP server and feeds the result back.
- **Tools, MVP scope**: `list_lore_files` (returns available topics/filenames) and `read_lore_file(filename)` (returns one file's full content). No full-text search tool yet — with a handful of topic files, Claude can just read what it needs after seeing the list. Add search later if the file count/size makes that impractical.
- **No chunking/indexing** — files are read and returned whole. Premature to optimize before there's real content to see if it's even a problem.
- **Deployment**: not local-only — the MCP server runs as part of the same backend process, so it travels with it (local now, Render later, per [tech.md](../../steering/tech.md)). `mcp/lore/*.txt` are ordinary repo files, deployed alongside the app code like everything else.
- **Lore content**: the user is providing the actual `.txt` files — this feature ships with the folder and server ready to read whatever's dropped in, not placeholder/invented lore.

## Open Questions
None currently.
