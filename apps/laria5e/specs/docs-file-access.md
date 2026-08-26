# Spec: MCP Server — Docs File Access

## Status
Implemented

## Summary
An MCP server exposes local `.md` files within the repo to Claude, giving it access to large amounts of lore, rules, and world-building content organized by topic, subdivided into topic-specific subfolders.

## Requirements
- [x] MCP server runs alongside the app (or as a sidecar service)
- [x] Server can recursively read `.md` files from a designated `mcp/docs/` directory, including subfolders
- [x] Files are organized by topic, one subfolder per topic area (e.g., `world/`, `rules/`)
- [x] Claude can query specific files or search across them via MCP tools
- [x] Adding or updating doc files does not require code changes

## File Organization
```
mcp/docs/
├── world/            # Setting overview, city/region descriptions
│   └── ...
├── rules/             # Core game rules, broken out by topic
│   └── ...
└── ...                # Additional topic subfolders as needed
```
Currently empty — the folder and server are ready to read whatever's dropped in, subfolders included.

## Decisions
- MCP server runtime: Node.js (matches the rest of the stack)
- **Real MCP protocol, in-process**: built with the official MCP SDK (`@modelcontextprotocol/sdk`), linked to the backend via an in-memory transport pair — no subprocess, no network hop, no publicly-reachable URL needed (which rules out Anthropic's remote MCP connector for a local/pre-Render setup like this one). `claude.js` acts as the MCP client: on each DM turn it lists the MCP server's tools, passes their schemas through to the Anthropic API's tool-use, and when Claude calls one, forwards that call to the MCP server and feeds the result back.
- **Tools, MVP scope**: `list_docs` (recursively returns every `.md` file under `mcp/docs/`, as paths relative to that folder, e.g. `"rules/combat.md"`) and `read_doc(filename)` (returns one file's full content, given that relative path). No full-text search tool yet — with a handful of topic files, Claude can just read what it needs after seeing the list. Add search later if the file count/size makes that impractical.
- **Subfolder-safe path resolution**: `read_doc` resolves the model-supplied relative path with `path.resolve(DOCS_DIR, ...)` and checks the result still falls inside `DOCS_DIR`, rather than `path.basename()`-stripping it (which would silently collapse any subfolder path down to just the filename, breaking topic subfolders entirely). `path.resolve` collapses `..` segments before that containment check runs, so a traversal attempt still fails closed.
- **No chunking/indexing** — files are read and returned whole. Premature to optimize before there's real content to see if it's even a problem.
- **Deployment**: not local-only — the MCP server runs as part of the same backend process, so it travels with it (local now, Render later, per [tech.md](../steering/tech.md)). `mcp/docs/**/*.md` are ordinary repo files, deployed alongside the app code like everything else.
- **Content**: the user provides the actual `.md` files, organized into topic subfolders as they see fit — this feature ships with the folder and server ready to read whatever's dropped in, not placeholder/invented content.

## Open Questions
None currently.
