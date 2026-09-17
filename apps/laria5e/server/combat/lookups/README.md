# Ad hoc enemy stat lookups

One file per lookup tool, listed in `../index.js`'s `adHocLookups`. The
combat DM calls one when it needs a number the enemy's stat block doesn't
have; the engine runs `resolve` deterministically against that enemy's
stored fields, **persists the result at `path` in `enemy.stats`**, and
returns it. So the same enemy and the same input always give the same
number, and after the first call it's already in the injected stat block.

The engine adds an `enemy` (name) argument to every lookup's schema itself;
don't declare it here. Shape (see `packages/server-core/src/combat/README.md`):

```js
export const lookupSomething = {
  name: "lookup_something",
  description: "...",
  input_schema: { required: [...], properties: { ... } },
  // `enemy` is the whole enemy object (class, powerLevel, stats, ...).
  resolve(enemy, input) {
    return { path: ["something", input.key], value: /* from ../enemy-stats.js */ };
  },
};
```

Laria currently needs none. Abilities and saves are precomputed into the
block at handoff (six and three is cheap). Skills are the long tail — most
enemies never roll most of them — and were the obvious candidate, but a
lookup here is only reachable by the combat DM, and the narrative DM needs
the same numbers for a guard or a merchant. So, as in Cyberpunk, one MCP
tool serves both: `npc_check` (`mcp/server.js`) takes a class, a power
level, and a skill / ability / save, looks the bonus up from
`../enemy-stats.js`, and rolls it in one call. The combat DM passes the
class and power level from the enemy's block, so the same enemy always
gets the same number without anything being persisted.

A lookup earns its place here only for something that is both expensive to
precompute for every enemy and needed rarely — a specific spell, a class
feature.
