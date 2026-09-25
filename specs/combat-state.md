# Spec: Combat State

## Status
Planned (2026-09-25). Nothing implemented. Builds on [combat-encounters.md](combat-encounters.md) (the combat mode itself) and supersedes parts of it as each phase lands: its Player/Enemy Phase procedure is replaced by initiative order in Phase 1, and its status-ladder tracking (§5.3) by HP in Phase 3. Applies to both games through the shared engine (`packages/server-core/src/combat/`); game-specific numbers come from each app's combat module.

## Summary
Move combat bookkeeping out of the combat DM's memory and into structured state the engine owns: who is fighting, the initiative order and whose turn it is, everyone's HP and lasting effects, and which actions are declared, resolved, or waiting on a roll. The engine renders that state into the DM's prompt every turn and advances it deterministically: it rolls enemy initiative, ticks ongoing damage, counts durations, resolves spell saves, compares rolls with their targets, and applies damage. The model keeps the judgment calls (targets, tactics, plausibility, difficulty, narration). Code keeps the books.

Fights run in **initiative order**, one combatant at a time, replacing today's Player Phase / Enemy Phase. A player ends their own turn with an **End turn** button, which prompts the DM automatically; the DM then runs every enemy turn up to the next player's, stopping only for rolls a player owes.

A compact tracker pinned to the top of the combat block in the chat shows the round and every combatant in initiative order: the party with HP bars, enemies with a condition word, effect icons, and their position on hover.

## Why
Every combat failure measured in live testing so far was bookkeeping done by the model:

| Failure | Rate | Cause |
|---|---|---|
| Spell save re-rolled next turn, effect re-applied | 3/3 runs | Tool results vanish from the transcript; the next turn re-resolves a `CAST:` it already resolved |
| Lasting effect not recorded when the spell lands | ~1 in 3 | Relies on the model remembering a tool call mid-sequence |
| Ongoing-damage tick skipped or late | ~1 in 3 | Relies on the model starting every Enemy Phase with a call |
| Countdown not advanced after a tick | ~1 in 3 | Multi-step arithmetic the model runs by hand |

A mechanics log replayed into the transcript would patch the first row only. Structured state fixes all four, and it is the foundation for real HP, initiative, and a visible tracker anyway, so the log is not built.

Initiative order replaces phases because phases leave "when is a player done?" to the DM's reading of the chat, which cramps players: someone who has spent their actions may still want a taunt or a line of banter. An explicit End turn makes that boundary the player's call, and makes it safe for enemy turns to run without waiting for a post.

## Principles
1. **The state is the truth; the transcript is the story.** Anything a later turn needs to know (HP, effects, what's resolved, what's owed, whose turn) lives in state and is rendered fresh each turn. Nothing mechanical has to be recovered from prose.
2. **The model decides; the engine computes.** The DM chooses targets, rules on what's plausible, sets difficulties, plays enemies, and narrates. Rolls it doesn't need to see, counts, comparisons, HP arithmetic, and expiry are code.
3. **Every state change is reversible with the message that caused it.** Admin delete-to-retry must keep working, so a DM message's state changes roll back with it.
4. **No new judgment from the engine.** It never decides whether an enemy is in range, who an area spell catches, how hard a check is, or whether a desperate move works. Those stay the DM's calls, passed to the engine as arguments.
5. **Players own their characters' numbers.** Players keep applying damage to their own HP; the engine reads player HP and never writes it.

## Data model

### `combats.state` (new jsonb column)
`combats.context` stays the immutable handoff: location, circumstances, objective, opening action, and each enemy's static fields and stat block. Everything that changes during the fight moves to a new `state` column:

```
state {
  round:        int, starts at 1
  turnOrder:    combatantId[]                  // highest initiative first; [] until initiative is in
  activeIndex:  int | null                     // null while initiative is being rolled
  combatants: {
    [id]: {
      id, kind: "player" | "enemy",
      name,                                    // enemies: the handoff name, unique in the fight
      username?:   string                      // players: links to the conversation's character fields
      enemyIndex?: int                         // enemies: index into context.enemies (static stats)
      initiative?: { roll, total }             // total sorts turnOrder
      surprised?:  true                        // skips their first turn, then clears
      hp?:         { current, max }            // enemies (Phase 3); players read characterHp (below)
      effects:     Effect[]                    // lasting effects - today's enemy.effects, generalized
      position?:   string                      // PUBLIC: what the players can see ("in melee with Barret")
      intent?:     string                      // PRIVATE: the DM's plan for them ("bolts if the captain drops")
      down?:       "dead" | "unconscious" | "fled" | "surrendered"
    }
  }
  ledger:  Entry[]                             // this round only; cleared at the round boundary
  history: string[]                            // one line per finished round
}

Effect { name, effect, ongoing?, roundsLeft | null, source? }   // as in effects.js today
Entry  {
  id, round, actor: combatantId,
  kind: "cast" | "attack" | "check" | "action",
  summary,                                     // "Immolate on the Scarred Captain"
  messageId?,                                  // the player message that declared it (casts)
  spell?,                                      // casts: the full spell, copied at cast time
  targets?: combatantId[],
  status: "pending" | "awaiting" | "resolved",
  awaiting?: { from: combatantId, roll: "initiative" | "attack" | "damage" | "check" | "save", target?: int }[],
  outcome?:   string,                          // "save failed (9 vs 13); burning 3 rounds; 7 fire damage"
  mechanics?: object                           // engine-computed results: per-target outcomes, damage applied
}
```

Enemies move out of `context.enemies[].condition` / `.effects` into `state.combatants`. Their static fields and stats stay in `context`, and the combatant points at them by `enemyIndex`.

**Players' HP stays in `conversations.characterHp`.** That's the one source of truth the right panel already edits, and the combatant reads it rather than copying it. Players apply their own damage; the state only displays and reports it.

**Position is public, intent is private.** `position` is written for the players: only what their characters can see, and it appears as the tooltip on the enemy's chip. `intent` is the DM's own notepad (a plan, a breaking point, a bluff) and never leaves the prompt. Splitting them lets the tracker show position without leaking hidden information, and keeps the "reveal only what the fiction earns" rule enforceable: anything in `position` is fair game for the table by definition.

**Backfill:** when a combat is loaded with `state` null (any fight active at deploy time), the engine builds `state` from `context`: round 1, combatants from the players and `context.enemies` carrying any existing `condition` / `effects` across, today's `update_enemy_status` note as `intent` (it was private), enemies' initiative rolled, and the players' initiative marked awaited. The DM's next response asks for it. No data migration beyond the column.

### `combat_messages.state_before` (new jsonb column)
The state as it was immediately before a DM message was generated, stored on that assistant row. See Rollback.

Migrations: one per app (`combats.state`, `combat_messages.state_before`), both nullable. Both apps, since both host the engine's tables.

## Enemy names

Every enemy's `name` is its label everywhere: the chip in the tracker, the `target` argument of every tool, and how the DM refers to it in state. So names must be **short** (they fit on a chip; Phase 1 adds a 24-character cap to the handoff), **unique within the fight**, and **distinguishable from narration alone**.

`validateHandoff` already rejects duplicate names (case-insensitive) and the handoff retries. What changes is the guidance on how to name, in `BASE_ENEMY_FIELDS.name`'s description and the narrative prompt's combat section:
- A named NPC uses their name: "Reiko", "Old Varn".
- Anyone else is named by what the players can see that sets them apart: a feature, a role, or a piece of kit. "Scarred Captain", "Red-Scarf", "Crossbowman", "The Big One", "Visor", "Shotgun".
- Numbers ("Bandit 1", "Bandit 2") only as a last resort for genuinely identical enemies, and even then a trait is better: "Tall Bandit", "Bald Bandit".

This matches what `combat-dm-core.md` already asks of the narration ("the one with the spear"), so the name and the prose agree. An enemy that joins mid-fight gets a name the same way (`add_enemy`, below), unique against everyone already in the fight, dead or not.

## Initiative and turns

**Rolling.** When a fight opens, the engine rolls every enemy's initiative from its stat block's `initiative` bonus (Laria: `1d20 + initiative`; Cyberpunk: `1d10 + initiative`, through the game's dice rules) and creates an `awaiting` initiative entry for each player. The DM's opening narration sets the scene and ends by asking both players for initiative. Both dice rollers gain an **Initiative** roll type (Laria uses the stored "Ini" bonus; Cyberpunk players enter their REF-based bonus as with any roll), and the engine matches each player's Initiative roll to their entry. When every player's is in, the engine sorts `turnOrder` and the first turn begins.

**Ties:** player before enemy; between two players or two enemies, the higher bonus, then a coin flip the engine makes once and stores.

**Surprise:** the DM's opening ruling. An enemy caught unaware (the handoff's circumstances say so) gets `surprised` and skips its first turn. Players are never marked surprised by the engine; an ambush on the party is handled by the enemies simply acting first.

**The opening action.** The action the players declared in the handoff is resolved on that player's first turn, not before initiative.

**A player's turn.** The tracker highlights them and their composer shows **End turn**. They declare an action, the DM resolves it and asks for rolls, they roll, the DM narrates, and so on, prompting the DM with "Ask DM" as today. When they're done, including any banter after their actions are spent, they click **End turn**. That posts a user-role marker message in the fight's transcript, `— BARRET ENDS TURN —` (sender: the character), and prompts the DM automatically. Only the active player sees the button. The ready toggle is hidden during combat, since turns replace it.

**The other player, off-turn,** can still post: banter, questions, OOC. A declared action is held for their turn, exactly as today's out-of-phase rule.

**Enemy turns run automatically.** After an End turn, the DM's response runs every consecutive enemy turn until the order reaches a player: for each enemy, act, then call `end_turn`. The engine ticks the next combatant's effects at the start of their turn and returns who's next. When `end_turn` returns a player, the DM hands them the spotlight and stops. Rolls players owe during that run (a Cyberpunk Evasion roll, a player's save) are collected and asked for together at the end, as today; when they come in, the DM resolves them and the turn passes as normal.

**Rounds.** When the order wraps, the round increments, the ledger's resolved entries collapse into one `history` line, and the ledger clears.

**Durations** count the affected combatant's own turns: an effect ticks (ongoing damage, countdown, expiry) at the start of that combatant's turn. "3 rounds" is three of their turns.

## Who judges a roll

The rule: **whoever holds both numbers compares them.** The engine compares whenever state holds the roll and the number it must beat. The DM sets any number that needs judgment (a skill DC or DV) *before* the roll arrives, which also means it can't be shaded after seeing the result.

| Roll | Target number | Who compares |
|---|---|---|
| Player attack vs enemy | Enemy's `ac` (Laria) / `defense` (Cyberpunk), from its stats | Engine (Phase 3), when the roll names or is matched to a target |
| Enemy save vs player spell | The spell's DC, from the `CAST:` entry | Engine (`resolve_cast`, Phase 2); `npc_check` with `dc` until then |
| Any NPC check vs a DC | Set by the DM | `npc_check` with `dc`, as today |
| Player skill check or save | DC/DV set by the DM in `request_roll` | Engine, when the matched roll arrives |
| Enemy attack vs player | Laria: the player's stored AC. Cyberpunk: `shootDv` (ranged) or the player's Evasion roll (melee) | Engine (`enemy_attack`, Phase 3) |
| Opposed player vs NPC | The NPC's `npc_check` total | Engine: the DM calls `npc_check` when the player's roll arrives, passing the player's total as `dc` |

Every comparison uses the game's beat-the-number rule (a tie fails). The DM always narrates the result; it never decides a result the engine has already reported. Until Phase 3, the DM compares player attacks against the stat block itself, as today.

**When a player rolls an attack without naming a target:**
- If the fiction makes it unambiguous (one enemy left standing, or only one whose `position` puts them in reach), the DM takes that target and names it in the narration, so a wrong guess gets corrected on the spot.
- If it's ambiguous, the DM asks which one and holds the roll. The roll stands; the player never re-rolls. The ledger entry waits on the answer.
- From Phase 3, the dice roller's Attack type gets an optional **Target** picker during a fight (the living enemies, defaulting to the player's last target), and the roll message carries it: `Attack vs Red-Scarf - Rolled 17!`. That makes the target explicit and lets the engine compare without the DM.

## The ledger

A list of what's been declared this round, and whether it's resolved.

**How entries are created:**
- **Initiative, by the engine**, when the fight opens (one awaiting entry per player).
- **Casts, exactly and for free.** `POST /cast` during a fight creates a `pending` entry with the full spell copied in and `messageId` set (Phase 2). The route knows everything at intake.
- **Roll requests, by the DM.** `request_roll` creates an entry `awaiting` a specific roll from a specific player, with its target number when there is one.
- **Free-text actions at resolution, not intake.** "I shove the archer off the cart" is only an action once the DM interprets it, so the DM records it when it settles it: `resolve_action` creates the entry already `resolved`. The ledger's job is marking what's done, and that happens at resolution. A structured action composer in the UI (the player picks Attack / Cast / Move / Other and a target) is the upgrade path if free text proves the weak link; it is not in this spec.
- **Roll messages are matched, not interpreted.** When a player posts a roll whose type matches something the ledger is `awaiting` from them, the engine attaches it to that entry, and compares it if the entry carries a target number. Rolls with no match are left for the DM to read as today.

**What it prevents:** the ledger is rendered into the prompt every turn, so the DM sees "Kael: Immolate on the Scarred Captain, resolved (save failed 9 vs 13; burning 3 rounds); awaiting Kael's damage roll" rather than inferring it from prose. Resolving an entry twice is a tool error that names the existing outcome, so a double roll can't happen even if the model tries.

**What it enables:**
- The end-of-response list of outstanding rolls comes from `awaiting`, so the DM doesn't have to remember it.
- `end_combat`'s `enemyStatus` can be prefilled from state.

## Tools

The combat DM's tools after all phases. Each phase lists which it adds.

| Tool | Phase | Does | Replaces |
|---|---|---|---|
| `end_turn {}` | 1 | Ends the active enemy's turn: advances `activeIndex`, skips anyone `down`, clears `surprised`, ticks the next combatant's effects (rolls ongoing damage, applies it as HP from Phase 3, counts down, expires), increments the round on wrap. Returns what happened and who's next. Refuses on a player's turn: only their End turn button ends it. Refuses if the enemy's own action is still `pending`. | `tick_effects`, the phase procedure |
| `request_roll { from, roll, dc?, target?, why }` | 1 | Records a roll the DM needs from a player, with its target number if it's against one. The engine compares when the roll arrives. | the end-of-response ledger line, written by hand |
| `resolve_action { actor, summary, targets?, outcome }` | 1 | Records a free-text action as resolved. | - |
| `apply_effect { target, name, effect, ongoing?, rounds? }` | 1 | Effects the DM originates (an enemy ability, a shove leaving someone prone). Spell effects are applied by the engine from Phase 2. Works on players too. | today's `apply_effect` |
| `update_enemy { target, position?, intent?, down? }` | 1 | Position (public), intent (private), and taking an enemy out of play: fled, surrendered, unconscious, or dead. | `update_enemy_status` |
| `add_enemy { name, ...game fields }` | 1 | Reinforcements: validated like a handoff enemy (unique name, stats generated), initiative rolled and slotted into `turnOrder`. | - |
| `resolve_cast { entry, targets }` | 2 | The DM supplies only the targets it judged in range and inside the area. The engine does the rest: for a save spell it rolls each target's save from their stats (game hook `rollSave`), applies the effect and ongoing damage to failures, and marks the entry `awaiting` the caster's damage roll. For an attack spell it marks the entry `awaiting` the attack roll, with the target's AC. | the DM calling `npc_check` + `apply_effect` for spells |
| `apply_damage { target, amount, entry? }` | 3 | Subtracts HP from an enemy, clamps, derives the condition word from the HP ratio, and marks it `down` at 0. With an `entry`, it applies that entry's save outcome itself: half for a target that saved against a half-on-save spell, none for one that negated it. | the status ladder |
| `enemy_attack { enemy, target, weapon }` | 3 | Rolls the enemy's attack from its stats and compares it (Laria: the player's AC; Cyberpunk ranged: `shootDv`). On a hit it rolls damage and returns the number for the player to apply. Cyberpunk melee marks the entry awaiting the player's Evasion roll and compares when it arrives. | `roll_dice` for enemy attacks |

Unchanged: `roll_dice` (anything that isn't an attack), `npc_check`, MCP doc tools, `end_combat`.

Attack spells and weapon attacks: when the matched attack roll arrives, the engine compares it with the target's AC (Laria) or defense (Cyberpunk), resolves the hit or miss, and moves the entry to `awaiting` damage. The DM narrates what the engine reports.

## Prompt

A new **uncached** system tier, `## Combat State`, placed after the cached handoff tier, rendered from `state`:
- The round, the initiative order, and whose turn it is.
- Each combatant on one line: HP, condition word, lasting effects with rounds left, position, and intent.
- This round's ledger.
- What's awaited, from whom, and against what.

Mutable data moving out of the cached handoff tier into this uncached one is also a caching win. Today every note or effect change invalidates the handoff cache; after this, the handoff tier changes only when an ad hoc lookup lands.

`combat-dm-core.md` is reworked in Phase 1:
- **"The Shape of a Fight", "The Player Phase", and "The Enemy Phase" are replaced** by a turn procedure: an opening that ends asking for initiative; then turns in initiative order; the player's turn (resolve what they declare, ask for rolls, never end their turn for them); the enemy run (after an End turn, play each enemy in order and call `end_turn` after each, until the order reaches a player). One movement and one action per turn replaces "per phase".
- **"Where a response ends"** is kept, rephrased for turns: on a player's turn, end when they owe a roll or a decision; after an enemy run, end on the next player's spotlight with a clear picture of the field. The one-line ledger of owed rolls is replaced by `request_roll`, which the engine renders.
- A short **Combat State** section: the state tier is authoritative; read it, don't reconstruct from the transcript. An entry marked resolved is done. Engine-computed results (initiative, saves, ticks, comparisons, damage) are narrated, never re-rolled. `position` is visible to the players, so write only what they can see there; plans go in `intent`.
- **"Enemy status, not hit points"** is replaced in Phase 3 by HP from state, still revealed to players only through description.

Both games' combat prompts drop their "Laria uses the Player Phase / Enemy Phase structure for now" / "nothing rolls initiative yet" lines and the placeholder notes on `hp` and `initiative`. The per-game spell sections shrink to "call `resolve_cast` with the targets you judged in range" in Phase 2.

## Rollback (admin delete-to-retry)

Deleting a message must undo what it did to state:
- **Deleting the latest DM message** restores `combats.state` from that message's `state_before`. Every change made during that message is undone together, whether HP, effects, the ledger, the round, or the turn. An End turn's advance is applied inside the DM generation it triggers, after `state_before` is captured, so deleting that DM reply puts the turn back with the player; the marker message can then be deleted like any unanswered player message.
- **Deleting a player's `CAST:` message** (allowed until the DM replies, as for any player message) removes its `pending` ledger entry. Players fix their own MP. Found via the entry's `messageId`.
- **Deleting a player's roll message** detaches it from any `awaiting` entry it satisfied, and undoes the comparison it triggered, so the entry goes back to awaiting.
- **Edits** to message text never touch state.

## UI: the combat tracker

**Placement: the existing "⚔ Combat" divider becomes the tracker, pinned to the top of the chat while the fight is on.** Today the divider sits at the top of `li.combat-block` inside `#messages` (the chat's scroll container) and holds the "End combat" button. Making it `position: sticky; top: 0` keeps it in view while scrolling through the fight. Because sticky elements are bounded by their containing block, it scrolls away naturally once the player scrolls up past the fight into the chapter. The right panel is untouched, and the tracker exists only during combat.

One row, ~52px, across the 700px chat column, **chips in initiative order**, highest first, party and enemies interleaved:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ⚔ ROUND 2 │ [Red-Scarf  injured ✦] │ [▶ Kael ▮▮▮▮▯] │ [Scarred Captain  bruised ✦✦] │ [Bram ▮▮▮▮▮] │ … │ End combat │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Left:** the round. While initiative is being rolled: "Rolling initiative", with chips appearing as rolls come in.
- **Active chip:** highlighted, whoever's turn it is.
- **Party chips:** name and HP bar, colored with the existing wound-state classes, since it's the same data the right panel shows.
- **Enemy chips:** name and a condition word (unharmed / bruised / injured / critical; from HP in Phase 3). No numbers.
- **Effect icons:** each lasting effect on any combatant is a small generic icon on their chip; its tooltip names the effect and what it does ("Burning: 1d6 fire each turn, 2 rounds left").
- **Position:** hovering an enemy chip shows its `position` as a tooltip ("atop the boulder, loosing arrows"). `intent` never reaches the client.
- **Down:** dead, fled, or surrendered enemies stay in place, dimmed with the word ("fled"), so the order still reads.
- **Overflow:** past six chips the strip scrolls horizontally, keeping the active chip in view. A popover isn't needed now that details live in tooltips.
- **End turn** lives in the composer, where the ready toggle sits outside combat, and only for the active player.
- **Live:** updates arrive on the chapter's SSE channel as a new `combat-state` event after every DM message and state change.
- **Client payload:** the server sends a player-safe projection of the state: no enemy HP numbers, no `intent`, no stats.
- The final visual design comes from a mockup in `ui-handoff/`, per `steering/structure.md`.

**Alternatives considered:**
- **Swap the left panel during combat.** The story list isn't needed mid-fight, so the sidebar could show the tracker vertically. There's room for fuller combatant cards. But it hides chapter navigation and the admin's menus during a fight, and moves the fight's status away from where the fight is read. Rejected in favor of the strip.
- **The chat's side margins.** On wide screens there's space on either side of the 700px column, but it disappears on narrower windows. Rejected.
- **The right panel.** Ruled out: it's full, and a scrolling column is not wanted.

## Phases

Each phase ships and is useful on its own.

1. **State core and initiative.** Includes:
   - The `combats.state` column, the backfill, and `state_before` with rollback.
   - Combatants (enemies move out of `context`), public position and private intent, and the ledger with `request_roll` and `resolve_action`.
   - Initiative: engine-rolled for enemies, the Initiative roll type in both dice rollers, matching, `turnOrder`, surprise.
   - Turns: the End turn button and marker message with its automatic DM prompt, `end_turn` for enemy runs, per-turn effect ticks, `apply_effect` on players, `update_enemy`, `add_enemy`.
   - Enemy naming guidance.
   - The Combat State prompt tier and the `combat-dm-core.md` rework to turns.
   - A minimal tracker (round, chips in order, the active one highlighted) so players can see whose turn it is. Full styling waits for Phase 4.

   Removes `tick_effects`, `update_enemy_status`, and the Player/Enemy Phase procedure.

   *Fixes: re-resolution, skipped ticks, manual countdowns, and "is my turn over?".*

   Both games.
2. **Engine-resolved spells.** Includes:
   - `/cast` creating ledger entries, and `resolve_cast`.
   - Roll matching for spell attacks and damage, and the attack-spell comparison.
   - The `rollSave` game hook.

   *Fixes: effects not recorded on landing.* Laria only; Cyberpunk has no spells.
3. **Enemy HP and engine-judged attacks.** Includes:
   - HP from each enemy's stat block into `combatants[].hp`. The values already exist: Laria's is a flat 20 placeholder until its calculation is written; Cyberpunk's is half of 10 + 5 × the BODY/WILL average.
   - `apply_damage` with save-aware halving; the condition word derived from the HP ratio; the status ladder retires.
   - The Target picker on the Attack roll, and engine comparison of player attacks against AC / defense.
   - `enemy_attack`, including Cyberpunk's melee-vs-Evasion flow.

   Both games.
4. **Tracker UI.** The designed strip from a `ui-handoff/` mockup: HP bars, condition words, effect icons with tooltips, position tooltips, down states, overflow, and the `combat-state` SSE event's full projection.
5. **Later.** Player stat blocks as data; enemy armor (Cyberpunk SP); a structured action composer.

## Verification

No model calls are needed for most of each phase: engine functions over fixture states (initiative sorting and ties, turn advance skipping the down and the surprised, per-turn ticks, round wrap, roll matching and comparison), routes through in-process Express against the dev DB, and the generator with a stubbed client (as in the effects tests). All of these run freely.

Live-model runs follow `steering/tech.md`: ask first with the call count and model, keep them lean, and repeat only when measuring consistency. The success criteria are the rows in Why, measured on the same two-turn Immolate scenario used for the baseline, plus the new turn procedure:

| Criterion | Baseline (prompt-only / effects tools) | Target |
|---|---|---|
| Save not re-rolled on turn 2 | 1/3 / 0/3 | 3/3 (guarded by the ledger) |
| Effect recorded when the spell lands | 3/5 / 2/3 | 3/3 (engine-applied, Phase 2) |
| Tick happens at the right time | 4/5 / 2/3 | deterministic (start of turn, `end_turn`) |
| Countdown correct | 3/5 / 2/3 | deterministic |
| Enemy run stops at the next player's turn, having called `end_turn` for each enemy | - | 3/3 |

The one remaining model-dependent step is the enemy run: calling `end_turn` after each enemy and stopping at the player. The live test measures that directly.

## Decisions (2026-09-25)
1. **Players see about enemies:** name, a condition word (never a number), each active effect as a small generic icon with a tooltip, and position on hover. They never see HP numbers, stats, or intent.
2. **Turn boundaries and enemy turns:** players end their own turn with an End turn button, which posts a marker and prompts the DM. Enemy turns then run automatically up to the next player's turn, and the DM still stops for any roll a player owes.
3. **Player HP:** players apply their own damage. The engine never writes player HP.
4. **Enemy HP values:** both games' stat blocks carry HP (Laria a placeholder).
5. **Tracker placement:** the sticky strip in the chat.
6. **Effects on players:** engine-tracked, and shown only in the tracker.
7. **Initiative order, not phases,** from Phase 1.

## Open Questions
1. **An admin DM view.** Should the admin see real enemy HP and intent in the tracker (a toggle), or is the prompt tier enough?
2. **Cyberpunk players' initiative bonus.** They type their REF into the roller like any modifier. Should Cyberpunk store it the way Laria stores "Ini", so the roller prefills it?
3. **A player who never clicks End turn.** The other player can't act until they do. Should the admin (or the other player, after some time) be able to end it for them?
