# Spec: Character Role & Level

## Status
Implemented (status corrected 2026-09-13 - this spec sat at "Planned" with
every box unchecked long after the feature actually shipped)

## Summary
Extends [Main Story](../main-story.md) character creation: alongside a character name, each player also picks a Role (one of the ten Cyberpunk Red roles) and a Level (1-20). This is locked in at creation, same as the character name, and displayed beneath the character name header in the right panel as small gray italic text, e.g. "Level 4 Solo".

## Requirements
- [x] The "New Main Story" form requires, per player: character name (existing), Role (picked from a fixed list of 10), Level (a number 1-20)
- [x] Role choices: Rockerboy, Solo, Netrunner, Tech, Medtech, Media, Exec, Lawman, Fixer, Nomad
- [x] Level must be an integer from 1 to 20 inclusive; the form cannot submit without a valid value for both fields, for both players
- [x] Role and Level are locked once the Main Story is created — no way to edit afterward, same rule as the character name
- [x] In a Main Story conversation's right panel, beneath the character name header (and its existing `<hr>`), the current user's Role and Level render as small gray italic text in the format "Level {level} {role}" (`RightPanel.jsx`'s `#character-role-level`)
- [x] This line is absent for non-Main-Story conversations, same as the character name header itself
- [x] Existing Main Story conversations (created before this feature) are backfilled with placeholder Role/Level values so no conversation is left with null data

## Decisions
- **Storage**: a new `character_details` jsonb column on `conversations`, shaped `{ "<username>": { "role": "<Role>", "level": <1-20> } }` — mirrors `character_names`'s per-username map shape and lifecycle (populated once at creation, never updated), kept as a separate column rather than folded into `character_names` so the existing name-only read paths (message attribution, roster building for Claude, sidebar) don't need to change at all.
- **Validation is server-side and authoritative**: `POST /api/conversations/main-story` 400s if either player's role isn't one of the 10 fixed values, or level isn't an integer in 1-20 — re-checked at request time regardless of what the form sent, matching this project's existing server-side-enforcement pattern for the name fields.
- **Display format**: "Level {level} {role}", e.g. "Level 1 Tech" or "Level 4 Solo" — exact wording from the request, not composed from separate labeled fields.
- **Backfill**: the two existing Main Story conversations get arbitrary but valid Role/Level values via a one-off SQL update, since there's no real game history to derive correct values from and the requirement is just "no nulls," not "correct" data.

## Open Questions
None currently.
