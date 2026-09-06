# Saving Throws

Purpose: consulted when an effect (trap, spell, hazard, poison, etc.) forces a resistance roll. Trigger condition differs from skill checks: saves are DM/effect-initiated, not declared by the player as an action. Do not use `check-triggers.md` logic for these — a save fires because something is *happening to* the character, not because they chose an action.

## Instructions

1. Determine who rolls (see below).
2. Determine which save type is required (see below).
3. If an NPC is rolling, roll the save yourself. If a player needs to roll, request it from them.

## Who Rolls

A saving throw can apply to a player, an NPC, or both at once (an area effect catching several creatures) — resolve each affected creature independently, by whichever of these applies to it:

- **NPC/enemy**: roll it yourself using the dice tool rather than inventing a result. Do not request it or wait on anyone.
- **Player**: request the roll clearly and wait for their result. Never roll on their behalf.

## Save Table

Classic three-save system, not the six-ability version — every effect resolves against one of these three.

| Save | Resists... | Typical sources |
|---|---|---|
| Fortitude | Bodily strain and raw physical force | Poison, disease, forced endurance, shove effects, grapples, being pinned, forced movement, being crushed/moved by force |
| Reflex | Area effects you can dodge | Explosions, collapsing terrain, swinging/sweeping traps, breath weapons |
| Will | Attacks on the mind, willpower, or sense of self | Illusions, psychic assaults, charm, fear, forced deception of the senses, possession, soul-trapping, banishment effects |

## DC Source

The DC is set by whatever is causing the effect (a spell's save DC, a trap's fixed DC, a poison's listed DC) — not chosen freely at time of resolution. If no DC is defined for a homebrewed hazard, default to the Medium band (15) from `check-resolution.md` unless narrative stakes justify Hard (20) or higher.

## Death Saving Throws (special case)

Triggers when a creature drops to 0 HP and isn't killed outright.

- Roll d20, no modifiers.
- 10+ = success; below 10 = failure.
- 3 successes → stabilized (unconscious, stable).
- 3 failures → death.
- Natural 20 → regain 1 HP, become conscious.
- Natural 1 → counts as two failures.
- Any damage taken at 0 HP = automatic failure (and a critical hit or sufficiently massive damage can kill outright without the save sequence).

