# Spec: Character Builder (Post-MVP)

## Status
Future / Not Scoped

## Summary
Each user can build and save a Cyberpunk Red character. Characters are selected at the start of a new game session.

## High-Level Requirements
- [ ] Each user has a character creation flow following Cyberpunk Red rules
- [ ] Characters are saved and persist between sessions
- [ ] At game start, users select which saved character to play
- [ ] Character data is passed to Claude as context for the session

## Cyberpunk Red Character Components (TBD)
- Role (Rockerboy, Solo, Netrunner, Tech, Medtech, Media, Exec, Lawman, Fixer, Nomad)
- Stats (INT, REF, DEX, TECH, COOL, WILL, LUCK, MOVE, BODY, EMP)
- Skills
- Gear / Cyberware
- Backstory / Lifepath

## Open Questions
- How strict is the character builder? (full rules vs. simplified)
- Do both users share one "party," or do they each have fully independent characters?
- Where are characters stored? (DB, local file, browser storage)
