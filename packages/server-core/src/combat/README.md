# Combat engine

Combat is a mode of a chapter with its own DM. This folder is the
game-agnostic engine; each app supplies a **game module** at
`apps/<app>/server/combat/` that says what an enemy is, how to stat it, how
its dice read, and what its mechanics prompt says. The engine never knows
which game it's running. Design reasoning lives in
[specs/combat-encounters.md](../../../../specs/combat-encounters.md); this
file is the map.

## The flow

```
 narrative turn                         combat turns                       back to narrative
 ──────────────                         ────────────                       ─────────────────
 apps/<app>/server/lib/claude.js        packages/server-core/src/combat/    router.js finishCombat()
   generateReply()                        router.js  POST /combats/:id/…      ├─ afterCombatEnded()  ← app's Situation pass
   ├─ tools: MCP + start_combat            ├─ messages / roll / edit / delete  ├─ outcome → one DM message in `messages`
   │         (tools.js, schema from         └─ respond → generator.js           ├─ combats.status = resolved, summary kept
   │          game.enemySchema)                 generateCombatReply()           ├─ combat_messages deleted
   └─ start_combat is TERMINAL:                   ├─ system: combat-dm-core.md   └─ SSE combat-ended
        text = cut-in, input = handoff              │        + game.loadSystemPrompt()
              │                                     │        + buildCombatContext()   (context.js)
              ▼                                     │        + roster
 apps/<app>/server/routes/conversations.js          ├─ tools: MCP roll_dice/docs
   startCombat()                                    │         + game.adHocLookups (persist into stats)
   ├─ validateHandoff()        (tools.js)           │         + update_enemy_status (persist into condition)
   │                                                │         + end_combat            (tools.js)
   ├─ stats = game.generateCoreStats(enemy)         └─ end_combat is TERMINAL → outcome
   ├─ INSERT combats { context }
   └─ SSE combat-started
```

Manual overrides: **Start combat** (`POST /conversations/:id/combat/start`)
runs `generateCombatHandoff` in the app's `claude.js`, a narrative call with
`start_combat` forced; **End combat** (`POST /combats/:id/end`) runs
`generateCombatEnd` with `end_combat` forced. Both land in the same code
paths as the automatic ones.

While a combat is active, the main chapter's messages / roll / respond /
new-chapter routes return 409, and the shared `pendingReplies` set (keyed
by conversation id) keeps a narrative turn and a combat turn from ever
generating concurrently.

## Files here

| File | What |
|---|---|
| `tools.js` | `start_combat` (built from the game's `enemySchema`; description loaded from `prompts/combat-handoff.md`), `end_combat`, `update_enemy_status` (the combat DM's notepad: status + a position note, persisted on the enemy and rendered in the handoff tier next message), both validators, and `withBaseEnemyFields` |
| `context.js` | `combat-dm-core.md` loader, the handoff rendered as a cached prompt tier, the outcome rendered as a message |
| `generator.js` | `createCombatGenerator({ client, model, getMcpTools, callMcpTool, game })` → `{ generateCombatReply, generateCombatEnd }` |
| `router.js` | `createCombatsRouter({ db, tables, game, … })` → the `/api/combats` routes |
| `index.js` | re-exports all of the above |
| `../../prompts/combat-dm-core.md` | the shared combat DM prompt: procedure, values, exit rule (always loaded, both games) |
| `../../prompts/combat-handoff.md` | what a good handoff contains; becomes `start_combat`'s tool description |

## The game module contract

`apps/<app>/server/combat/index.js` exports one object:

```js
export const combatGame = {
  enemySchema,        // JSON schema for one enemy in start_combat - withBaseEnemyFields({ required, properties })
  generateCoreStats,  // (enemy) => stats object, run server-side at handoff, stored on enemy.stats
  adHocLookups,       // [{ name, description, input_schema, resolve(enemy, input) => { path, value } }]
  buildRollMessage,   // (requestBody) => { content } | { error } - the game's dice math + message format
  loadSystemPrompt,   // () => the game's combat mechanics prompt text
};
```

An enemy is one flat object: the engine's `name` / `description` /
`motive` / `notes`, plus whatever the game's schema adds (Cyberpunk: `tier`,
`archetype`, `meleeWeapon`, `rangedWeapon`; Laria: `creatureType`, `threatTier`), plus `stats`,
which only the engine writes (from `generateCoreStats` at handoff and from
lookups during the fight). `buildCombatContext` renders the game's fields
as "Type: …" without knowing their names.

Where things go inside the game module:

```
apps/<app>/server/combat/
  index.js          the contract object above
  enemy-schema.js   what the narrative DM is asked for per enemy
  enemy-stats.js    generateCoreStats and its tables
  lookups/          one file per ad hoc lookup tool, listed in index.js
  roll-message.js   the game's dice validation + message text
  system-prompt.md  the game's combat mechanics (the numbers), loaded after combat-dm-core.md
```
