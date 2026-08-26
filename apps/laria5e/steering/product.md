# Product

## Vision
A shared web app for two players to collaboratively roleplay with Claude as the Dungeon Master, using the DnD 5e tabletop game system as the foundation.

## Users
- Exactly two users, always. No more, no less.
- Each user authenticates via a personal access code.
- Hosted publicly on Render.

## Core Experience
- Users join the same conversation and interact with Claude together in real time.
- Claude acts as the DM: narrating the world, controlling NPCs, and driving the story.
- Every conversation belongs to a Story: starting one locks in each player's character name, class, and level up front and labels messages by character rather than username. Standalone conversations outside a Story are no longer creatable. Stories are sidebar-listed and sorted by recent activity, each made up of an ordered sequence of Chapters.
- Stories contain Chapters. New Chapters are created when the previous one becomes too large and context size begins affecting performance and cost.
- An MCP server provides Claude with access to local lore/rules files within the repo.
- Model instructions define Claude's narration style, tone, and basic game rules.

## Look & Feel
- Candlelit tavern ledger. Dark brown ground, parchment-cream text, ember-orange accents — lit from within rather than backlit like a screen.
- Restrained glow, not neon. Color arrives as low-opacity washes and soft halos on the few things that matter (ready state, active tile, crit), never as fill.
- Bookish typography. Cinzel carves the chrome — small caps, wide tracking, engraved-inscription feel; Spectral carries narration like printed prose.
- Hairline architecture. Everything is separated by 1px rules and 2–3px radii; almost no cards or shadows, so it reads as ruled pages rather than stacked panels.
- Three vibrancies against the brown. Ember (action), verdigris teal (presence and readiness), gold (crit) — plus a plum bloom in the ambient light to keep the browns from going flat.
- Narration-first hierarchy. The DM's text is unboxed and full-width; only the player's own words get a bubble, so the story is the page and the UI is the margin.
- GM replies reveal word-by-word with a fade-in as they arrive live (not replayed when reloading history) — `client/src/AnimatedGMReply.jsx`

## UI Layout
- Left vertical panel: conversation list and conversation management
- Central area: selected conversation and messages; main interation
- Right vertical panel: user in-game tools and character-specific displays; column of components separated by h-rules. Some info here is passed to the LLM as part of player prompts.
