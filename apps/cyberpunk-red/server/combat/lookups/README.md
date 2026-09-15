# Ad hoc enemy stat lookups

One file per lookup tool, listed in `../index.js`'s `adHocLookups`. The
combat DM calls one when it needs a number the enemy's stat block doesn't
have; the engine runs `resolve` deterministically against that enemy's
stored fields, **persists the result at `path` in `enemy.stats`**, and
returns it. So the same enemy and the same input always give the same
number, and after the first call it's already in the injected stat block.

Cyberpunk currently needs none. Skill checks were the obvious candidate,
but the game has far too many skills to table per archetype and an NPC
never uses most of them, so instead every enemy's block carries all seven
STAT totals (`INT`/`REF`/`DEX`/`TECH`/`COOL`/`WILL`/`EMP`, from
`../enemy-stats.js`), precomputed at handoff, and the combat DM decides
which STAT a check falls under. Seven numbers is cheap to precompute and
leaves nothing for the DM to forget to look up. The same table backs the
`npc_check` MCP tool (`mcp/server.js`), which is how either DM rolls for an
NPC that has no stat block - a one-off guard, a bystander - by naming an
archetype, a tier, and a STAT.

A lookup earns its place here only for something that is both expensive to
precompute for every enemy and needed rarely — a specific cyberware
effect, a role ability. Shape (see `packages/server-core/src/combat/README.md`):

```js
export const lookupSomething = {
  name: "lookup_something",
  description: "What it returns and when the DM should call it.",
  input_schema: {
    required: ["key"],
    properties: { key: { type: "string", enum: KEYS } },
  },
  // `enemy` is the whole enemy object (tier, archetype, meleeWeapon, rangedWeapon, stats, ...).
  resolve(enemy, { key }) {
    return { path: ["something", key], value: TABLE[enemy.archetype][key] };
  },
};
```

The engine adds an `enemy` (name) argument to every lookup's schema itself;
don't declare it here.
