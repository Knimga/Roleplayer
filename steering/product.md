# Product

## Vision

This monorepo hosts two shared web apps built on the same pattern: two players collaboratively roleplay with Claude as the Dungeon Master. Each app runs its own tabletop game system as the foundation:

- **Cyberpunk Red** (`apps/cyberpunk-red`) — the Cyberpunk Red tabletop system.
- **Laria 5e** (`apps/laria5e`) — the D&D 5e tabletop system.

## Users

- Exactly two users per app, always. No more, no less.
- Each user authenticates via a personal access code.
- Cyberpunk Red is hosted publicly on Render. Laria 5e is local-only so far — not yet deployed.

## Core Experience (shared)

- Users join the same conversation and interact with Claude together in real time.
- Claude acts as the DM: narrating the world, controlling NPCs, and driving the story.
- Every conversation belongs to a **Story**: starting one locks in each player's character name (plus game-specific details — see below) up front and labels messages by character rather than username. Standalone conversations outside a Story are no longer creatable in either app. Stories are sidebar-listed and sorted by recent activity, each made up of an ordered sequence of **Chapters** — a new chapter starts when the previous one grows large enough that context size begins affecting performance and cost.
- An MCP server (per app — not shared, see [tech.md](tech.md)) gives Claude access to local `.md` lore/rules files under each app's own `mcp/docs/`.
- Model instructions define Claude's narration style, tone, and basic game rules — per app, since these encode each game's actual rules.

### Per-app character details locked at Story creation

- **Cyberpunk Red**: character name, Role (one of ten fixed roles), and Level (1-20).
- **Laria 5e**: character name, Class, and Level (1-20).

## MVP Scope

- Two-user shared chat with Claude as DM
- Access code authentication
- Story/Chapter conversation structure with locked-in character identity
- MCP-powered lore/rules file access
- Model instruction configuration

## Look & Feel

Each app keeps its own distinct visual identity — this is deliberate, not an inconsistency to fix. Shared UI components (`packages/ui`) carry no styling of their own; each app's own `client/src/App.css` supplies different theme values for the same class/id hooks, so a shared component renders correctly differently in each app.

### Cyberpunk Red

- Dark theme, gray-dominant
- Minimalistic
- Mimics the UI of Claude.ai

### Laria 5e

- Candlelit tavern ledger. Dark brown ground, parchment-cream text, ember-orange accents — lit from within rather than backlit like a screen.
- Restrained glow, not neon. Color arrives as low-opacity washes and soft halos on the few things that matter (ready state, active tile, crit), never as fill.
- Bookish typography. Cinzel carves the chrome — small caps, wide tracking, engraved-inscription feel; Spectral carries narration like printed prose.
- Hairline architecture. Everything is separated by 1px rules and 2–3px radii; almost no cards or shadows, so it reads as ruled pages rather than stacked panels.
- Three vibrancies against the brown. Ember (action), verdigris teal (presence and readiness), gold (crit) — plus a plum bloom in the ambient light to keep the browns from going flat.
- Narration-first hierarchy. The DM's text is unboxed and full-width; only the player's own words get a bubble, so the story is the page and the UI is the margin.

### Shared

- GM replies reveal word-by-word with a fade-in as they arrive live, not replayed when reloading history — `packages/ui/src/ChatView.jsx` + `packages/ui/src/AnimatedGMReply.jsx`.

## UI Layout (shared)

- Left vertical panel: conversation list and conversation management
- Central area: selected conversation and messages; main interaction
- Right vertical panel: user in-game tools and character-specific displays; column of components separated by h-rules. Some info here is passed to the LLM as part of player prompts.

## Post-MVP (Cyberpunk Red roadmap)

- Deeper Cyberpunk Red game system integration — more rules mechanics beyond the current skill checks, combat, and dice roller (all of which now exist)
- Character builder: users create and save characters independent of Story creation
- New game flow: select which saved character to use at a new Story's start
