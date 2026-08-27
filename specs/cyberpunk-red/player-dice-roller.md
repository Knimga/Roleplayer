# Spec: Player Dice Roller

## Status
Implemented

## Summary
A dice-roller panel on the right side of the app (mirroring the conversation sidebar on the left) lets a player build and submit a roll — skill check, attack, damage, or defense — which posts the result into the current conversation as an ordinary player message. This is the player-facing counterpart to [npc-dice-roll.md](npc-dice-roll.md), which the DM uses for NPC/enemy rolls.

## Requirements
- [x] A new vertical panel on the right side of the layout, mirroring the left sidebar's dimensions (width, height, border treatment)
- [x] The dice roller sits at the top of this panel
- [x] Player selects a roll type: Skill Check, Skill Check (Opposing), Attack Roll (Melee), Attack Roll (Ranged), Damage Roll, Defense Roll (Melee)
- [x] Every roll type uses 1d10 except Damage Roll, which uses d6
- [x] Damage Roll additionally requires the player to specify how many d6 to roll
- [x] Player must enter a single modifier (integer) — required for every roll type, and the field can't be left blank even for a modifier of 0
- [x] Player must enter free text describing the weapon or skill used — required for every roll type *except* Defense Roll (Melee); no validation beyond "not empty"
- [x] The ROLL button stays disabled until every field required for the currently-selected roll type is filled in
- [x] Rolling requires an active (selected) conversation — there's nowhere to post the result otherwise
- [x] Pressing ROLL performs the roll and immediately posts a formatted result as a new message from that player in the current conversation — no separate preview/confirm step
- [x] The roll message is an ordinary player message — same attribution rules as typing one (username, or character name in a Main Story conversation), same effect on conversation activity/DM availability, nothing schema-special about it
- [x] After rolling, the form resets — roll type, modifier, free text, and d6 count all clear, and ROLL is disabled again until refilled

## Message Format
`{ROLL TYPE LABEL} ({FREE TEXT}) - ROLLED {total}!{ " CRITICAL!" | " CRITICAL FAILURE!" | "" } ({dice breakdown} + {modifier})`, e.g.:
- `SKILL CHECK (Perception) - ROLLED 15! (1d10 (8) + 7)`
- `ATTACK ROLL (MELEE) (Katana) - ROLLED 21! CRITICAL! (1d10 (10) + 1d10 (6) + 5)`
- `DEFENSE ROLL (MELEE) - ROLLED 12! (1d10 (5) + 7)` — no free-text parenthetical, since that field doesn't apply to this roll type

## Decisions
- **Rolling happens server-side**, reusing the exact same dice/crit math already built for [npc-dice-roll.md](npc-dice-roll.md)'s `roll_dice` MCP tool (extracted into a shared module both the MCP tool and this feature's endpoint call) — not reimplemented client-side. This keeps the two rollers mechanically identical and avoids duplicating the crit-exploding logic.
- **Crit logic applies to every roll type except Damage Roll**, as a direct consequence of reusing the shared dice logic: every other roll type is a single d10 (`numDice: 1, sides: 10`), which is exactly the shape the shared logic already treats as crit-eligible. Damage Roll is `Nd6`, which never crits — consistent with the NPC tool's existing rule.
- **Crit failure label is inferred** as `"CRITICAL FAILURE!"` by symmetry with the given `"CRITICAL!"` success example — not explicitly specified in the request, flagging in case a different wording is wanted.
- **One atomic action, not roll-then-send**: the same request that performs the roll also inserts the message (mirroring how creating a Main Story or a new regular conversation both bundle "do the thing" and "post about it" into one call) — there's no intermediate state where a roll has happened but hasn't been posted yet.
- **Roll type mechanics, not just labels**: "Skill Check" and "Skill Check (Opposing)" are mechanically identical (1d10 + modifier, crit-eligible) — the distinction is purely which label lands in the message, for narrative clarity about what the roll was for.

## Open Questions
None currently.
