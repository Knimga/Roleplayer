import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The two tools that cross the narrative/combat boundary, and the validation
// of what crosses it. start_combat is the narrative DM's terminal handoff
// INTO combat mode; end_combat is the combat DM's terminal outcome OUT of
// it. See README.md in this folder for the flow, specs/combat-encounters.md
// §5.1 / §5.2 / §5.4 for the design.

const HANDOFF_PROMPT_PATH = fileURLToPath(new URL("../../prompts/combat-handoff.md", import.meta.url));

export const COMBAT_OUTCOMES = ["victory", "defeat", "escaped", "enemiesFled", "enemiesSurrendered", "standoff"];
// The spec writes this as true | false | partial; a three-value string enum
// is the same information in a shape JSON schema expresses cleanly and the
// model can't half-satisfy.
export const OBJECTIVE_RESULTS = ["achieved", "failed", "partial"];
export const ENEMY_END_STATES = ["dead", "fled", "captured", "unconscious", "surrendered", "unharmed-and-gone"];

// ---------------------------------------------------------------------------
// The enemy object: engine fields + the game's own
// ---------------------------------------------------------------------------

// What every enemy carries regardless of game - the engine needs `name` to
// address it (lookups, status, the outcome) and the rest is what the combat
// DM narrates from. Everything else about an enemy (its nature, its stat
// inputs, whatever a game's tables want) is the game module's to define;
// see withBaseEnemyFields.
export const BASE_ENEMY_PROPERTIES = {
  name: { type: "string", description: "Short, unique within this fight (e.g. 'Ganger with the shotgun', 'Reiko')." },
  description: { type: "string", description: "What the players can see: appearance, weapon, posture, where they are." },
  motive: { type: "string", description: "What this enemy wants out of the fight, if it matters (a named NPC's goal, a hired gun's price)." },
  notes: { type: "string", description: "Known abilities, personality, anything the combat DM needs to play them well. No campaign secrets." },
};
export const BASE_ENEMY_REQUIRED = ["name", "description"];
const BASE_ENEMY_KEYS = new Set(Object.keys(BASE_ENEMY_PROPERTIES));

// Composes a game's enemy fields onto the base ones. The result is the whole
// per-enemy schema in start_combat - flat, one object, the game's fields
// alongside name/description/motive/notes. A game module calls this once
// in its enemy-schema.js:
//
//   export const enemySchema = withBaseEnemyFields({
//     required: ["tier", "weapon"],
//     properties: { tier: {...}, weapon: {...} },
//   });
export function withBaseEnemyFields({ required = [], properties = {} } = {}) {
  const clash = Object.keys(properties).find((k) => BASE_ENEMY_KEYS.has(k));
  if (clash) throw new Error(`enemy schema: "${clash}" is an engine field and can't be redefined by the game`);
  return {
    type: "object",
    required: [...BASE_ENEMY_REQUIRED, ...required],
    properties: { ...BASE_ENEMY_PROPERTIES, ...properties },
  };
}

// Splits an enemy object into the engine's fields and the game's, so the
// renderer can show the game fields as "what kind of enemy this is" without
// knowing what they are. `stats` is the engine's too (it's what the game's
// generateCoreStats and lookups write).
export function gameFieldsOf(enemy) {
  return Object.fromEntries(Object.entries(enemy).filter(([k]) => !BASE_ENEMY_KEYS.has(k) && k !== "stats"));
}

// ---------------------------------------------------------------------------
// start_combat
// ---------------------------------------------------------------------------

// Read fresh per call like every prompt loader in this codebase, so edits to
// the handoff guidance take effect on the next turn.
function loadHandoffGuidance() {
  return readFileSync(HANDOFF_PROMPT_PATH, "utf-8").trim();
}

// `enemySchema` is the game module's full per-enemy schema (withBaseEnemyFields).
// The handoff guidance prompt is folded into the tool's description - it's
// read at exactly the moment the model is deciding what to put in it, and it
// sits in the cached tools prefix like everything else about the tool.
export function buildStartCombatTool({ enemySchema }) {
  return {
    name: "start_combat",
    description: loadHandoffGuidance(),
    input_schema: {
      type: "object",
      required: ["location", "enemies", "circumstances", "objective", "openingAction"],
      properties: {
        location: {
          type: "string",
          description:
            "The battlefield, stated once and well: layout, cover, exits, light, distances between everyone. Combat is theatre-of-the-mind and this is all the combat DM has to work with.",
        },
        enemies: { type: "array", minItems: 1, items: enemySchema },
        circumstances: {
          type: "string",
          description:
            "Time pressure, noise or attention risk, reinforcements possible, environmental hazards - or 'isolated, inconsequential'.",
        },
        objective: {
          type: "string",
          description:
            "What the players are trying to achieve in this fight as best you can tell: escape, kill, capture alive, protect someone, hold a position. Not an exit condition - the fight runs until hostilities end.",
        },
        openingAction: {
          type: "string",
          description: "The players' declared action that started it, verbatim intent, UNROLLED and unresolved. The combat DM opens by requesting whatever rolls it needs.",
        },
      },
    },
  };
}

// Never throws: returns { errors, value }. `value` is the normalized handoff
// ready to be persisted as combats.context, minus `stats`, which the game's
// generateCoreStats adds afterwards. Engine fields are validated here; the
// game's own fields pass through as-is (the API already enforced their
// schema), so a game that wants stricter checks does them in
// generateCoreStats.
export function validateHandoff(input) {
  const errors = [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const location = str(input?.location);
  const circumstances = str(input?.circumstances);
  const objective = str(input?.objective);
  const openingAction = str(input?.openingAction);
  if (!location) errors.push("location is required");
  if (!circumstances) errors.push("circumstances is required");
  if (!objective) errors.push("objective is required");
  if (!openingAction) errors.push("openingAction is required");

  const enemies = Array.isArray(input?.enemies) ? input.enemies : [];
  if (enemies.length === 0) errors.push("at least one enemy is required");
  const normalizedEnemies = enemies.map((e, i) => {
    // `stats` is never accepted from the model - the game's generateCoreStats
    // writes it at handoff. Everything else the game's schema declared passes
    // through untouched.
    const { stats: _stats, motive, notes, ...rest } = e && typeof e === "object" ? e : {};
    const name = str(rest.name);
    const description = str(rest.description);
    if (!name) errors.push(`enemies[${i}].name is required`);
    if (!description) errors.push(`enemies[${i}].description is required`);
    const enemy = { ...rest, name, description };
    if (str(motive)) enemy.motive = str(motive);
    if (str(notes)) enemy.notes = str(notes);
    return enemy;
  });
  const names = normalizedEnemies.map((e) => e.name.toLowerCase());
  if (new Set(names).size !== names.length) errors.push("enemy names must be unique within the fight");

  return {
    errors,
    value: { location, enemies: normalizedEnemies, circumstances, objective, openingAction },
  };
}

// ---------------------------------------------------------------------------
// update_enemy_status - the combat DM's notepad
// ---------------------------------------------------------------------------

// The DM is told to track each enemy's state privately, but a model has no
// private memory between messages - only its own past narration, which it
// is also told to keep vague about status. This is the notepad: what it
// records here is persisted on the enemy in the combat record and rendered
// in the handoff tier next message, so status and position survive without
// being re-derived from prose. Never shown to players.
export const ENEMY_STATUS_LADDER = ["unharmed", "bruised", "injured", "critical", "dead"];

export const UPDATE_ENEMY_STATUS_TOOL = {
  name: "update_enemy_status",
  description:
    "Your notepad for one enemy - the players never see it. Record its step on the status ladder and a one-line note on where it is and what shape it's in, and it will be in its stat block next message. Call it whenever a hit lands on an enemy, it drops, or it moves somewhere that matters, before you narrate the beat.",
  input_schema: {
    type: "object",
    required: ["enemy", "status"],
    properties: {
      enemy: { type: "string", description: "The enemy's name exactly as it appears in the stat blocks." },
      status: { type: "string", enum: ENEMY_STATUS_LADDER },
      note: {
        type: "string",
        description: "One line: position, wounds, what it's doing. e.g. 'behind the dumpster, gun arm hit, reloading'.",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// end_combat
// ---------------------------------------------------------------------------

export const END_COMBAT_TOOL = {
  name: "end_combat",
  description:
    "Call this only when hostilities have ended: no one is left both able and willing to fight the players (all enemies dead, incapacitated, fled, or surrendered), or the players have disengaged beyond reach or are all down, or both sides have genuinely stopped. The players meeting their objective does NOT end combat on its own. Narrate the wrap in your text, then call this. This ends your response and the fight.",
  input_schema: {
    type: "object",
    required: ["outcome", "objectiveAchieved", "narrative", "partyStatus", "enemyStatus", "consequences"],
    properties: {
      outcome: { type: "string", enum: COMBAT_OUTCOMES, description: "How hostilities ended." },
      objectiveAchieved: {
        type: "string",
        enum: OBJECTIVE_RESULTS,
        description: "Whether the players' objective was met - independent of outcome. A victory can leave it failed; an escape can leave it achieved.",
      },
      narrative: {
        type: "string",
        description:
          "3-5 sentences, player-facing, narrative tone: that a fight occurred, its key moments, how it ended, and where everyone stands now. This becomes the message the players read back in the main story.",
      },
      partyStatus: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "condition"],
          properties: {
            name: { type: "string" },
            condition: { type: "string", description: "In words. You do not track or state HP numbers - players own those." },
          },
        },
      },
      enemyStatus: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "status"],
          properties: {
            name: { type: "string" },
            status: { type: "string", enum: ENEMY_END_STATES },
          },
        },
      },
      consequences: {
        type: "array",
        items: { type: "string" },
        description:
          "The circumstances that actually fired: alarm raised, noise heard, reinforcements inbound, time lost, a named NPC's fate. What the campaign needs to know. Empty if genuinely nothing.",
      },
    },
  },
};

export function validateOutcome(input) {
  const errors = [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const outcome = input?.outcome;
  const objectiveAchieved = input?.objectiveAchieved;
  const narrative = str(input?.narrative);
  if (!COMBAT_OUTCOMES.includes(outcome)) errors.push(`outcome must be one of ${COMBAT_OUTCOMES.join("/")}`);
  if (!OBJECTIVE_RESULTS.includes(objectiveAchieved)) {
    errors.push(`objectiveAchieved must be one of ${OBJECTIVE_RESULTS.join("/")}`);
  }
  if (!narrative) errors.push("narrative is required");

  const partyStatus = (Array.isArray(input?.partyStatus) ? input.partyStatus : [])
    .map((p) => ({ name: str(p?.name), condition: str(p?.condition) }))
    .filter((p) => p.name && p.condition);
  const enemyStatus = (Array.isArray(input?.enemyStatus) ? input.enemyStatus : [])
    .map((e) => ({ name: str(e?.name), status: ENEMY_END_STATES.includes(e?.status) ? e.status : "" }))
    .filter((e) => e.name && e.status);
  const consequences = (Array.isArray(input?.consequences) ? input.consequences : []).map(str).filter(Boolean);

  return {
    errors,
    value: { outcome, objectiveAchieved, narrative, partyStatus, enemyStatus, consequences },
  };
}
