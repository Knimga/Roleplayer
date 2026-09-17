# Check Resolution

Purpose: consulted only after `skill-check-triggers.md` has already determined a check is needed and which skill/ability applies. Covers setting the DC and resolving the roll. Not for saving throws — see `saving-throws.md`.

## Instructions

1. Determine the DC with the DC Table. The roll must beat this value — a tie fails. Never announce the DC to players.
2. Determine whether Advantage or Disadvantage applies.
3. Check other sections below for Contests, Group Checks, and Help, and determine whether any apply.
4. If an NPC is making the check, roll it with `npc_check` (see NPC Rolls below) and narrate the result. If players need to make the check, request it from them.

## DC Table

| Difficulty | DC | Use for... |
|---|---|---|
| Very Easy | 5 | Almost anyone succeeds; roll only for flavor/pacing |
| Easy | 10 | Minor obstacle, low stakes |
| Medium | 15 | Default for most adventuring checks |
| Hard | 20 | Real chance of failure for a competent character |
| Very Hard | 25 | Near the edge of what's plausible without exceptional build |
| Nearly Impossible | 30 | Reserve for legendary/narratively pivotal moments |

Default to 15 when uncertain. Adjust down for favorable circumstances/tools, up for adverse conditions.

## Advantage / Disadvantage

Grant when a specific in-fiction circumstance clearly helps or hinders the roll (favorable positioning, right tool, injury, bad footing, distraction, etc.). Multiple stacking sources do not compound — cap at one die of advantage and one of disadvantage; if both apply, they cancel and it's a flat roll.

| Grant Advantage when... | Grant Disadvantage when... |
|---|---|
| Player has a clear tactical/positional edge | Player is doing this under duress, injured, or in bad conditions |
| Another PC helped (see Working Together) | Player lacks proper tools where tools would normally matter |
| A spell/feature explicitly grants it | A spell/feature explicitly imposes it |

## NPC Rolls

NPCs have no stat sheet. Instead of inventing a modifier, call `npc_check` with:

- **class** — the closest of the thirteen (fighter, rogue, barbarian, monk, ranger, paladin, wizard, cleric, druid, sorcerer, bard, shaman, commoner) for who this NPC *is*. A town guard is a fighter, a pickpocket a rogue, a clan seer a shaman; a merchant, a farmer, an innkeeper is a commoner. The class is a fact about the person, chosen once when they first roll and never revisited per check — a commoner asked to lie rolls Deception as a commoner and may well be bad at it.
- **powerLevel** — 1 untrained, 2 adept, 3 professional, 4 elite, 5 boss. Judge it from who they are, not from how hard you want the check to be.
- **skill** (this file's case), or **ability** for a raw ability check.
- **dc** — the DC you set in step 1, so the result reports success outright. Omit it only for a contest against a player's roll.
- **advantage** — `adv` or `dis` when the section above says it applies; omit for a flat roll.

The tool looks up the NPC's bonus from the class and power level and rolls the d20 in one call, returning the total, whether it beat the DC, and a summary string to weave into the narration.

Once you've picked a class and power level for an NPC, keep them for every later roll that NPC makes — they are that character's stats now.

## Contests

Two creatures actively opposing each other on the same axis (e.g., grapple, hide-vs-seek, tug of war). Both roll; the initiator must beat the other's total — a tie leaves the situation unchanged.

Order, when a player is one side: request the player's roll first and end your response there, unless they already provided one. When their result arrives, roll the NPC's side with `npc_check` (no `dc` — it's opposed) and resolve both in the same narration. Never roll the NPC's side before you have the player's. When both sides are NPCs, roll both with `npc_check` and resolve at once.

## Group Checks

Whole party attempts the same thing simultaneously (e.g., sneaking past a patrol together). Everyone rolls. If at least half succeed, the group succeeds; otherwise it fails. Use sparingly — only when the fictional framing genuinely has everyone acting at once.

## Working Together / Help

One character can grant another advantage on a check by describing a concrete, plausible form of assistance for that specific task. Only one character can grant Help on a given check unless circumstances explicitly allow more. Does not apply if the task isn't one two people can meaningfully do together (e.g., can't Help someone Stealth past a single narrow gap).

## Resolution
Narrate the outcome as part of the action, weaving the roll in the way the tool summarizes it — "*Rolled 17! (Stealth + 5, d20 [12])*" is fine inside the prose — but the DC stays yours: say what happened, not what number it needed.
