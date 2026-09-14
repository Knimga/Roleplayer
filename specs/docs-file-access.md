# Spec: MCP Server — Docs File Access

## Status
Implemented

## Summary
An MCP server exposes local `.md` files within each app's own `mcp/docs/` folder to Claude, giving it access to that game's lore, rules, and world-building content organized by topic. Each app runs its own MCP server instance over its own `mcp/docs/` folder — this is the same generic mechanism in both apps, just pointed at different content.

## Requirements
- [x] MCP server runs in-process alongside the app's backend (see Decisions)
- [x] Server can read `.md` files from that app's `mcp/docs/` directory
- [x] Files are flat, one per topic, directly inside `mcp/docs/` — no subfolders
- [x] Claude can list available files or read one in full via MCP tools
- [x] Adding or updating doc files does not require code changes

## File Organization
```
mcp/docs/
├── skills.md
├── factions.md
├── gear.md
└── ...          # one flat file per topic — no subfolders
```
Flat-file convention adopted for both apps; cyberpunk-red's docs were migrated from an earlier nested-subfolder, `.txt`-based layout (`mcp/lore/*.txt`) to match.

## Decisions
- MCP server runtime: Node.js (matches the rest of the stack)
- **Real MCP protocol, in-process**: built with the official MCP SDK (`@modelcontextprotocol/sdk`), linked to the backend via an in-memory transport pair — no subprocess, no network hop, no publicly-reachable URL needed (which rules out Anthropic's remote MCP connector for a local/pre-Render setup like this one). `claude.js` acts as the MCP client: on each DM turn it lists the MCP server's tools, passes their schemas through to the Anthropic API's tool-use, and when Claude calls one, forwards that call to the MCP server and feeds the result back.
- **Tools, MVP scope**: a list tool (returns every `.md` filename directly under `mcp/docs/`) and a read tool (returns one file's full content, given that filename). No full-text search tool yet — with a handful of topic files, Claude can just read what it needs after seeing the list. Add search later if the file count/size makes that impractical.
- **Known naming inconsistency, not yet unified**: cyberpunk-red's tools are named `list_lore_files`/`read_lore_file` (a holdover from before the folder/format standardization below); laria5e's are `list_docs`/`read_doc`. Both do the same thing over the same flat-file layout — this is a naming leftover, not a functional difference, and hasn't been reconciled.
- **Path resolution is containment-checked, not `basename`-stripped**: the read tool resolves the model-supplied filename with `path.join`/`path.resolve` against the docs directory and verifies the result still falls inside it, rather than assuming a bare filename — fails closed against a traversal attempt (e.g. `../../.env`) without depending on the model never sending one.
- **No chunking/indexing** — files are read and returned whole. Premature to optimize before there's real content to see if it's even a problem.
- **Deployment**: not local-only — the MCP server runs as part of the same backend process, so it travels with it (local now, Render later, per [tech.md](../steering/tech.md)). `mcp/docs/*.md` are ordinary repo files, deployed alongside the app code like everything else.
- **Content**: each app's actual `.md` files are provided by the user, one flat file per topic — this feature ships with the folder and server ready to read whatever's dropped in, not placeholder/invented content. Both apps' folders are now populated with real content (laria5e's initial `index.md` placeholder is gone — its per-doc "when to use it" hooks were folded into `laria-reference-files.md` directly, matching cyberpunk-red's always-loaded list rather than a separate on-demand-fetched index; see that file's git history for the prior approach).

## Open Questions
Whether to unify the two apps' tool names (`list_lore_files`/`read_lore_file` vs `list_docs`/`read_doc`) — functionally identical, purely a naming cleanup, not yet requested.
