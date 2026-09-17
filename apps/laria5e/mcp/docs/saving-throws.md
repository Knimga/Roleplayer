# Saving Throws

Purpose: consulted when an effect (trap, spell, hazard, poison, etc.) forces a resistance roll. Trigger condition differs from skill checks: saves are DM/effect-initiated, not declared by the player as an action. Do not use `skill-check-triggers.md` logic for these — a save fires because something is *happening to* the character, not because they chose an action.

## Instructions

1. Determine who rolls (see below).
2. Determine which save type is required (see below).
3. If an NPC is rolling, roll the save with `npc_check` (see NPC Saves below). If a player needs to roll, request it from them.

## Who Rolls

A saving throw can apply to a player, an NPC, or both at once (an area effect catching several creatures) — resolve each affected creature independently, by whichever of these applies to it:

- **NPC/enemy**: roll it yourself with `npc_check` (see NPC Saves below) rather than inventing a result. Do not request it or wait on anyone.
- **Player**: request the roll clearly — "**Roll a Will save.**" — on its own line, in bold, naming one of the three saves; say "with advantage" or "with disadvantage" when it applies, otherwise it's a flat roll. Never state the DC, and never roll on their behalf. Their roller offers exactly these three saves.

## Save Table

Classic three-save system, not the six-ability version — every effect resolves against one of these three.

| Save | Resists... | Typical sources |
|---|---|---|
| Fortitude | Bodily strain and raw physical force | Poison, disease, forced endurance, shove effects, grapples, being pinned, forced movement, being crushed/moved by force |
| Reflex | Area effects you can dodge | Explosions, collapsing terrain, swinging/sweeping traps, breath weapons |
| Will | Attacks on the mind, willpower, or sense of self | Illusions, psychic assaults, charm, fear, forced deception of the senses, possession, soul-trapping, banishment effects |

## NPC Saves

NPCs save outside combat as readily as in it — the merchant who drinks the poisoned wine, the guard caught in a player's *sleep*, the priest resisting a charm — and they have no stat sheet. Instead of inventing a modifier, call `npc_check` with:

- **class** — the closest of the twelve (fighter, rogue, barbarian, monk, ranger, paladin, wizard, cleric, druid, sorcerer, bard, shaman) for who this NPC is and what they're good at.
- **powerLevel** — 1 untrained, 2 adept, 3 professional, 4 elite, 5 boss. Judge it from who they are, not from whether you want the save to succeed.
- **save** — `fortitude`, `reflex`, or `will`, from the Save Table above.
- **dc** — from DC Source below, so the result reports success outright.
- **advantage** — `adv` or `dis` when a circumstance clearly warrants it (`skill-check-resolution.md`, Advantage / Disadvantage); omit for a flat roll.

The tool looks up the NPC's save bonus from the class and power level (governing ability plus proficiency if the class has that save), rolls the d20, and reports whether it beat the DC — a tie fails — with a summary string to weave into the narration.

The same tool serves in combat: an enemy in a fight has its class and power level in its stat block — pass those. Once you've picked a class and power level for an NPC, keep them for every later roll that NPC makes, checks and saves alike (`skill-check-resolution.md`, NPC Rolls, covers the check side).

## DC Source

The DC is set by whatever is causing the effect (a spell's save DC, a trap's fixed DC, a poison's listed DC) — not chosen freely at time of resolution. The roll must beat it; a tie fails. If no DC is defined for a homebrewed hazard, default to the Medium band (15) from `skill-check-resolution.md` unless narrative stakes justify Hard (20) or higher.

**A player's spell or effect against an NPC**: the DC is that player's spell save DC, which you don't have. Use the one they state; if they didn't state it, ask for it — "**What's your spell save DC?**" — and resolve the save when it arrives. Never guess it.

## Death Saving Throws (special case)

Triggers when a player drops to 0 HP and isn't killed outright.

- Roll d20, no modifiers.
- 10+ = success; below 10 = failure.
- 3 successes → stabilized (unconscious, stable).
- 3 failures → death.
- Natural 20 → regain 1 HP, become conscious.
- Natural 1 → counts as two failures.
- Any damage taken at 0 HP = automatic failure (and a critical hit or sufficiently massive damage can kill outright without the save sequence).

