# Campaign Bible Creation Instructions

## Purpose
You are generating a hidden campaign planning document — a "Campaign Bible" — for a tabletop RPG campaign that you (Claude) will run as Game Master across many future sessions. This document is never shown to players. Its job is to give you a persistent throughline so that scenes, NPCs, and complications you improvise turn-by-turn stay connected to a coherent long-term direction, instead of each session's threads feeling disconnected from the last.

The bible is written once, at campaign creation, using the player-provided Campaign Inputs below. It should very rarely change after creation — the things that change session-to-session (beat status) live in a separate, smaller tracker record, not here. Write this content assuming it is close to permanent.

## Output Format
Submit your finished content via the `create_campaign_bible` tool call — do not write it out as prose or markdown in your reply. Look up whatever lore/backstory context you need first (see below); call `create_campaign_bible` only once, when you have everything you need. The tool's schema defines the exact fields required for each section below; this document is about what good content looks like for each of them, not how to format it.

## Ensure Lore Coherency
You will have access to this world's lore and existing play backstories as MCP resources — use them. Every name, faction, and location in this bible should be grounded in the actual setting, not invented in a vacuum. Every proper noun you introduce should feel like it belongs to this specific world, not like a placeholder that happens to fit the genre. If a player's backstory already contains an unresolved thread, faction grudge, or personal stake, treat that as strong material to build from rather than inventing something unrelated from scratch. A bible full of placeholder-feeling generic content fails at its one job.

## Input
You will receive a text input from the players on what kind of campaign they want to play, which might include desired tone, themes, what kinds of threats appeal to the group, and even specific threads or threats that already exist in the lore.

## Content Guidance

### Central Conflict
Not every campaign needs a single named villain. Start by choosing a Type that fits the player inputs:
- **Person** — a specific individual antagonist
- **Faction/Organization** — a corp, gang, or institution
- **System** — an ongoing condition (corp policy, gang war, civic decay)
- **Force** — something non-agentive (an AI, a disaster, a phenomenon)
- **Hybrid** — a combination of the above

Then provide:
- **Identity**: name/description appropriate to the chosen type
- **Motivation or nature**: what drives it, or what it fundamentally is if it isn't sentient
- **Public face**: what's visible to the world vs. what's hidden from it
- **Resources**: what it can bring to bear against the players

> **IMPORTANT**: choosing a flexible Type is not license to keep the content vague. Once you pick a type, commit to a specific, fully realized instance of it — a named person with a real backstory, or a named faction with real internal politics — not a placeholder standing in for "the bad guy." Genericness belongs only in the menu of possible shapes, never in the instance you actually write.

### Beats (narrative arc)
3-5 beats marking the campaign's major waypoints, from the players' first unknowing contact with the central conflict through to its eventual confrontation or resolution. Each beat's `id` should be sequential (`beat_1`, `beat_2`, ...) and its `narrative` should describe what should be TRUE about the story once that beat is reached, and why it matters dramatically.

> **CRITICAL — beats must describe outcomes, not paths:**
> - A beat is a waypoint the story arrives at, not a scene you're pre-writing. Do not specify how players get there, which NPCs they must talk to, which locations they must visit, or what order within the beat things happen. That's improvised live, in response to what players actually choose to do.
> - Never write a beat as a sequence of required player actions. Write it as a description of the world's state and mood once the waypoint is reached, however players got there.
> - Leave room for a beat to be reached differently than expected, or for players to stumble into a later beat's territory early. The beats are a rough shape for you to steer improvisation toward, not a script to move players through.
> - It's fine — expected — for the specific triggering condition of each beat to be judged qualitatively during play, not defined here. This is about narrative meaning, not mechanics.

## Style
Write in plain, direct prose — this is a working reference for you to read before and during sessions, not a document meant to read well to players. Favor specificity over flourish. Every proper noun you introduce here should be one you're prepared to use consistently across many future sessions.
