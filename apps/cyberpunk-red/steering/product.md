# Product

## Vision
A shared web app for two players to collaboratively roleplay with Claude as the Dungeon Master, using the Cyberpunk Red tabletop game system as the foundation.

## Users
- Exactly two users, always. No more, no less.
- Each user authenticates via a personal access code.
- Hosted publicly on Render.

## Core Experience
- Users join the same conversation and interact with Claude together in real time.
- Claude acts as the DM: narrating the world, controlling NPCs, and driving the story.
- Users can hold multiple conversations, sidebar-listed and sorted by recent activity — see [conversation-management.md](../specs/conversation-management.md). A "Story" conversation type locks in each player's character name up front and labels messages by character rather than username — see [main-story.md](../specs/main-story.md). (The UI term is "Story"; the code, API, and database still say "Main Story"/`isMainStory` — an intentional, frontend-only rename, not fixed everywhere on purpose. See that spec's Decisions.)
- An MCP server provides Claude with access to local `.txt` lore/rules files within the repo.
- Model instructions define Claude's narration style, tone, and basic game rules.

## MVP Scope
- Two-user shared chat with Claude as DM
- Access code authentication
- Multiple conversations, sidebar-listed, including "Story" conversations with locked-in character names
- MCP-powered lore file access
- Model instruction configuration

## Look & Feel
- Dark theme, gray-dominant
- Minimalistic
- Mimic the UI of Claude.ai
- GM replies reveal word-by-word with a fade-in as they arrive live (not replayed when reloading history) — `client/src/AnimatedGMReply.jsx`

## UI Layout
- Left vertical panel: conversation list and conversation management
- Central area: selected conversation and messages; main interation
- Right vertical panel: user in-game tools and character-specific displays; column of components separated by h-rules. Some info here is passed to the LLM as part of player prompts.

## Post-MVP (Long-Term Goals)
- Full Cyberpunk Red game system integration
- Character builder: users create and save characters
- New game flow: select which character to use at session start
- LLM-prompted skill checks at contextually appropriate moments
- In-app dice roller for skill checks and combat
