# Ad hoc enemy stat lookups

One file per lookup tool, listed in `../index.js`'s `adHocLookups`. The
combat DM calls one when it needs a number the enemy's stat block doesn't
have; the engine runs `resolve` deterministically against that enemy's
stored fields, **persists the result at `path` in `enemy.stats`**, and
returns it. So the same enemy and the same input always give the same
number, and after the first call it's already in the injected stat block.

This is the D&D case the contract was designed for: ~18 skills per enemy
is waste to precompute and trivial to derive once when Stealth actually
comes up. Shape (see `packages/server-core/src/combat/README.md`):

```js
export const lookupEnemySkill = {
  name: "lookup_enemy_skill",
  description: "The enemy's bonus for one skill, from its stored stats.",
  input_schema: {
    required: ["skill"],
    properties: { skill: { type: "string", enum: SKILLS } },
  },
  // `enemy` is the whole enemy object (creatureType, threatTier, stats, ...).
  resolve(enemy, { skill }) {
    return { path: ["skills", skill], value: proficiency(enemy) + abilityMod(enemy, skill) };
  },
};
```

The engine adds an `enemy` (name) argument to every lookup's schema itself;
don't declare it here.

Nothing here yet - pending Laria's combat rules doc and the stat tables in
`../enemy-stats.js`.
