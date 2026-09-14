# Ad hoc enemy stat lookups

One file per lookup tool, listed in `../index.js`'s `adHocLookups`. The
combat DM calls one when it needs a number the enemy's stat block doesn't
have; the engine runs `resolve` deterministically against that enemy's
stored fields, **persists the result at `path` in `enemy.stats`**, and
returns it. So the same enemy and the same input always give the same
number, and after the first call it's already in the injected stat block.

Shape (see `packages/server-core/src/combat/README.md`):

```js
export const lookupEnemySkill = {
  name: "lookup_enemy_skill",
  description: "The enemy's skill base for one skill, from its tier.",
  input_schema: {
    required: ["skill"],
    properties: { skill: { type: "string", enum: SKILLS } },
  },
  // `enemy` is the whole enemy object (tier, weapon, stats, ...).
  resolve(enemy, { skill }) {
    return { path: ["skills", skill], value: SKILL_BASE_BY_TIER[enemy.tier] };
  },
};
```

The engine adds an `enemy` (name) argument to every lookup's schema itself;
don't declare it here.

Nothing here yet - the Combat Number already covers attack and defense.
