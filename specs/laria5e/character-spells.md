# Spec: Character Spells (Laria)

## Status
Planned (2026-09-17). Design agreed; nothing implemented. The final UI (a spell editor and a Cast control in the right panel) will come from a mockup in `ui-handoff/` — this spec covers everything the UI will plug into: data, routes, the cast message, and how both DMs resolve a cast.

## Summary
Laria players author their own spells and cast them in play. A spell has a name, a type, a description in the player's words, how it resolves (nothing / the player's attack roll / an enemy save at a DC), optional damage dice, an optional non-damage effect with a duration, and an MP cost. Casting posts a fixed-format `CAST:` message into whichever transcript is live — the main chapter, or the combat transcript during a fight, routed exactly like dice rolls — and deducts the cost from the caster's MP ([MP bar](../../apps/laria5e/client/src/MpTracker.jsx)). The DM never sees the spell list; everything it needs arrives in the cast message.

Cyberpunk is untouched: the shared combat engine gains one optional game-module hook that Cyberpunk's module doesn't implement.

## Requirements
- [ ] Each player can keep a list of spells on their character (per Story; carried into each new chapter like gear and MP), every field written by the player — nothing seeded or generated
- [ ] A spell records: name, type (buff / debuff / single-target / aoe / utility), description, range, resolution (none / attack / save), the save and DC when it's a save, whether a successful save halves or negates damage, damage dice, damage over time (dice applied each round for the duration), a non-damage effect, a duration, an MP cost
- [ ] Casting posts a `CAST:` message as the player (sender = character name) into the main chapter, or the combat transcript when a fight is active
- [ ] Casting deducts the spell's MP cost from the caster's current MP; a cast the player can't afford is refused with the shortfall stated
- [ ] The DM's roster carries nothing about spells; MP is never mentioned by the DM
- [ ] The narrative DM resolves a cast from the message alone — never asks for a DC, rolls enemy saves with `npc_check` at the stated DC, waits for the player's attack roll when the spell says so, honors effect and duration as written
- [ ] The combat DM does the same, and tracks durations in rounds: enemy-side effects in `update_enemy_status` notes, player-side effects in the end-of-response ledger

## Data model
New `characterSpells` jsonb column on Laria's `conversations` (schema + migration `0023_character_spells`), shaped `{ "<username>": Spell[] }`, carried over at new-chapter creation alongside `characterGear` / `characterMp`. Not seeded — `null` reads as `[]`.

```
Spell {
  id:          string, client-assigned (crypto.randomUUID), unique within the list
  name:        1–40 chars
  type:        "buff" | "debuff" | "single-target" | "aoe" | "utility"
  description: 1–200 chars — what it does, in the player's words (the DM reads this)
  range:       1–40 chars (e.g. "touch", "30ft")
  resolution:  "none" | "attack" | "save"
  save?:       "fortitude" | "reflex" | "will"   (required when resolution = "save")
  dc?:         int 1–30                          (required when resolution = "save")
  onSave?:     "none" | "half"                   (only with save + damage; default "none")
  damage?:     "NdX[+M][ type]" e.g. "6d6 fire", "1d10+3" — regex-validated, or absent; dealt once, on the hit or failed save
  damageOverTime?: same dice format — dealt again at the start of each of the target's rounds for the duration; requires `duration`
  effect?:     0–100 chars — non-damage effect ("STR −2", "immobilized", "confused")
  duration?:   0–40 chars — "3 rounds", "1 minute", "until end of combat"; absent = instant
  mpCost:      int ≥ 0
}
```

`damage` and `damageOverTime` are independent: a spell can have either, both (a fireball that also sets the target alight), or neither. A save with `onSave: "half"` halves the initial damage only; whether it also ends or halves the ongoing damage is the description's business ("a save ends the burning") and the DM's call.

Validation, the message format, and the cast resolver live together in a new `apps/laria5e/server/spells.js` — `SPELL_TYPES`, `RESOLUTIONS`, `validateSpellList(spells)` → `{ error } | { spells }` (max 30 per character), `formatCastMessage(spell)`, `resolveCast({ conversation, username, body })` — because the combat engine needs the same code as the narrative route.

## Routes
**`PATCH /api/conversations/:id/spells`** `{ spells: Spell[] }` — replaces the caller's own list. Same shape as the gear/AC routes: Story conversations only, `assertActiveChapter`, self-only. Returns `{ characterSpells }`. `characterSpells` is added to the list endpoint's select alongside the other character fields.

**Casting** — one resolver, two routes, mirroring how `buildRollMessage` serves both `/roll` routes:

- `resolveCast({ conversation, username, body })`: finds `body.spellId` in `conversation.characterSpells[username]` (404 "Spell not found"); checks `characterMp[username].current >= mpCost` (400 "Not enough MP — need 3, have 1"); returns `{ content, patch: { characterMp } }` with the deducted value. Pure apart from its inputs.
- Laria narrative router, `POST /:id/cast`: `assertActiveChapter`, `assertNoActiveCombat` (409 during a fight, as `/roll` does), `resolveCast`, apply `patch` to the conversation row, then `insertUserMessage(...)` with `resolveSender` (character name) — which publishes `created` and pings Discord. Returns `{ characterMp }`.
- Combat engine router (`packages/server-core/src/combat/router.js`), `POST /:id/cast`: `loadActiveCombat`, then `game.resolveCast` if the module defines it (404 "This game has no spells" otherwise), apply `patch` to `tables.conversations`, `insertCombatUserMessage`. The game-module contract (`packages/server-core/src/combat/README.md`) gains `resolveCast?` as an optional member; `apps/laria5e/server/combat/index.js` exports it from `../spells.js`.

Client API (no UI): `saveCharacterSpells(conversationId, spells)` and `castSpell(conversationId, spellId)` in `apps/laria5e/client/src/api/conversations.js` next to `saveCharacterAc`; `castCombatSpell(combatId, spellId)` in `packages/core/src/api/combats.js` next to `submitCombatRoll`. The client routes a cast to the combat endpoint when `activeCombatId` is set, exactly as the dice roller does.

MP refresh for the caster: the `created` SSE event already triggers `refreshConversations` in ChatView, so the MP bar updates with no new event type.

## The cast message
A user-role message with a fixed layout, so both DMs can read it the way they read roll messages:

```
CAST: Hold Person (debuff) · 3 MP
Arcane bands seize the target's limbs.
Range: 30ft
Save: Will DC 14 — no effect on a save
Effect: paralyzed
Duration: 2 rounds
```
```
CAST: Fire Bolt (single-target) · 1 MP
A mote of fire hurled at one creature.
Range: 60ft
To hit: attack roll follows
Damage: 1d10 fire
```
```
CAST: Immolate (single-target) · 4 MP
The target bursts into clinging flame.
Range: touch
Save: Reflex DC 13 — half damage on a save
Damage: 2d6 fire
Ongoing: 1d6 fire at the start of each of its rounds
Duration: 3 rounds
```

Line 1 always (MP shown only when cost > 0); the description always; `Range:` always; then only the lines that apply — `To hit: attack roll follows` / `Save: <Save> DC <n> — half damage on a save|no effect on a save` / `No roll to hit`, then `Damage:`, `Ongoing: <dice> at the start of each of its rounds`, `Effect:`, `Duration:`. The cast never rolls: no spell-attack bonus is stored, so the player rolls attack and initial damage afterwards with the existing roller. Ongoing damage is different — it isn't the player's action on any later round, so the DM rolls it (below).

## DM guidance
**Narrative DM** (`apps/laria5e/server/config/laria-system-prompt.md`, new `# Spells` section): a `CAST:` message is the player's declared action complete with its mechanics — don't ask for a DC or re-derive anything. Resolve by the `To hit` / `Save` line: attack → wait for the player's attack roll (and damage on a hit) like any attack; save → `npc_check` for each affected NPC with the stated save and `dc` (AoE: decide from the fiction who's in it, roll each); none → apply as described. `Range` is a fact of the fiction — a target beyond it isn't a target, say so before anything is rolled. `Effect` / `Duration` are in force as written — narrate the onset, honor it while it lasts, narrate its end; out of combat a duration in rounds is "a few moments". `Ongoing` damage outside combat: roll it with the dice tool once per "round" of the duration as the scene allows, or fold it into the narration of the effect running its course. Never mention MP.

**Combat DM** (`apps/laria5e/server/combat/system-prompt.md`, new `## Spells` section): the same resolution rules, plus:
- Response boundary: a save-based or no-roll spell resolves fully inside the DM's response (it rolls the saves); an attack spell whose roll hasn't arrived yet ends the response requesting it.
- Durations count in rounds, one round = one Player Phase. An effect on an enemy goes into that enemy's `update_enemy_status` note with rounds remaining ("held — 2 rounds left"), decremented each Enemy Phase, narrated when it ends. An effect on a player (a buff, or a debuff from an enemy) goes in the end-of-response ledger line with its remaining rounds. This is how the combat DM "counts turns".
- Initial damage rolls stay the player's; enemy status advances from the damage the player reports, as with weapons.
- `Ongoing` damage is the DM's to roll: at the start of each affected enemy's round (the Enemy Phase), roll the dice with the dice tool, advance that enemy's status by it, and carry it in the same `update_enemy_status` note as the countdown ("burning 1d6 — 2 rounds left"). For a player under ongoing damage from an enemy's ability, roll it at the start of the Player Phase and hand them the total to apply, as with any enemy damage. When the duration runs out, the note and the narration both say so.
- `Range` is checked before resolution: a target out of range means the cast doesn't land — tell the player and let them act again, rather than resolving a spell that couldn't reach.

**Docs**: `apps/laria5e/mcp/docs/saving-throws.md` DC Source — a `CAST:` message states the save and DC; use them. The "ask for the spell save DC" fallback stays for a player who describes a spell in prose without casting it through the app. `steering/tech.md`'s right-panel line: Laria adds spells (never in the roster).

## Decisions
- **MP cost auto-deducts on cast** (user choice). The Cast control should be disabled when current MP is short; the server refuses regardless. MP itself stays player-only bookkeeping — the DM never hears about it.
- **Nothing about spells in the roster** (user choice over "names and types only"). Keeps every turn's roster small; the cast message is the DM's whole view of a spell.
- **Cast anywhere** (user choice). Same routing as dice rolls: main chapter unless a fight is active, then the combat transcript; the narrative `/cast` returns 409 mid-fight so the client can't post to the wrong transcript.
- **Fixed message format over free text**: the DM prompts key on the `To hit:` / `Save:` lines the same way they key on roll-message labels; a player can't accidentally omit the DC.
- **Durations are loosely tracked by design.** Rounds map to Player Phases in combat and to "moments" outside it; the DM's existing notepad (`update_enemy_status`) and ledger line carry the countdown, so no new mechanism is needed.
- **One hook on the engine, not spell knowledge**: the shared combat router learns only that a game may resolve a "cast" into a user message plus a conversation-row patch. Cyberpunk's module lacks the hook and its `/cast` route 404s.
- **Ongoing damage is rolled by the DM, not the player.** Every other damage roll in the app is the player's own, but a damage-over-time tick on a later round isn't an action the player takes; making them roll it would mean the DM ending a response to request a roll for something already in motion. The DM has the dice tool and the enemy's notepad; it rolls the tick, applies it, and keeps the fight moving. Validation ties `damageOverTime` to a `duration` so a tick always has an end.
- **Player-authored, replace-the-list semantics**: `PATCH /spells` takes the whole list, like the text fields, rather than per-spell CRUD — simplest for an editor that already holds the list in memory, and the list is small (≤ 30).

## Verification (when implemented)
1. `npm run db:migrate` in `apps/laria5e/server` against dev.
2. In-process route test (temporary `apps/laria5e/server/_spells-test.mjs`, same harness as the MP route test, deleted after): create a story; `PATCH /spells` valid → stored and echoed by the list endpoint; invalid (bad type, save without dc, bad dice, missing range, `damageOverTime` without `duration`, 31 spells) → 400; set MP 5/10; cast an attack spell (cost 1) → content matches the format including `Range:`, MP 4; a save spell → `Save: Will DC 14` line; a damage-over-time spell → `Ongoing:` and `Duration:` lines; cost 9 → 400, MP unchanged; open a combat row → narrative `/cast` 409, combat `/cast` inserts into `combat_messages` and deducts; Cyberpunk's combat router `/cast` → 404. Cleanup removes the story.
3. Both clients build.
4. Prompt read-through; no live model calls. Optionally one Sonnet combat turn with a seeded cast message to watch the DM resolve a save via `npc_check` at the stated DC.

## Open Questions
- Whether the cast message should be styled distinctly in ChatView (as roll messages currently aren't). Deferred to the mockup.
- Whether `damage` / `damageOverTime` should split dice and damage type into two fields for the editor. The single string is enough for the DM; the editor can decide.
- Whether ongoing damage should offer a "save each round to end it" option as a field. Left to the description for now; add a field only if players write it often.
