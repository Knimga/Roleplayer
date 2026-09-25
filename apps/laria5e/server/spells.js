// Player-authored spells (specs/laria5e/character-spells.md): validation of
// the list a player saves, the fixed-format CAST: message a cast posts, and
// the resolver both cast routes share - the narrative one in
// routes/conversations.js and the combat engine's, which reaches it through
// combat/index.js. One module so the two transcripts can't drift apart.

export const SPELL_TYPES = ["buff", "debuff", "single-target", "aoe", "utility"];
export const RESOLUTIONS = ["none", "attack", "save"];
export const SPELL_SAVES = ["fortitude", "reflex", "will"];
export const ON_SAVE = ["none", "half"];
export const MAX_SPELLS = 30;

// "6d6", "1d10+3", "2d6 fire", "1d8 + 2 radiant". The count and sides are
// bounded so a typo can't post a thousand-die roll into the transcript.
const DICE_PATTERN = /^([1-9]\d?)d(4|6|8|10|12|20)(\s*[+-]\s*\d{1,2})?(\s+[a-z][a-z -]{0,19})?$/i;

// Each field's rule, in one place: [key, required, check(value) -> error or
// null]. Strings are trimmed before checking and stored trimmed.
function text(label, min, max) {
  return (v) => {
    if (typeof v !== "string") return `${label} must be text`;
    const len = v.trim().length;
    if (len < min) return min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`;
    if (len > max) return `${label} must be ${max} characters or fewer`;
    return null;
  };
}
const oneOf = (label, options) => (v) => (options.includes(v) ? null : `${label} must be one of ${options.join(", ")}`);
const dice = (label) => (v) =>
  typeof v === "string" && DICE_PATTERN.test(v.trim()) ? null : `${label} must be dice like "2d6", "1d10+3" or "6d6 fire"`;

function spellChecks(spell) {
  return [
    ["id", true, text("id", 1, 64)],
    ["name", true, text("Name", 1, 40)],
    ["type", true, oneOf("Type", SPELL_TYPES)],
    ["description", true, text("Description", 1, 200)],
    ["range", true, text("Range", 1, 40)],
    ["resolution", true, oneOf("Resolution", RESOLUTIONS)],
    ["save", spell.resolution === "save", oneOf("Save", SPELL_SAVES)],
    ["dc", spell.resolution === "save", (v) => (Number.isInteger(v) && v >= 1 && v <= 30 ? null : "DC must be a whole number from 1 to 30")],
    ["onSave", false, oneOf("On a save", ON_SAVE)],
    ["damage", false, dice("Damage")],
    ["damageOverTime", false, dice("Damage over time")],
    ["effect", false, text("Effect", 0, 100)],
    ["duration", false, text("Duration", 0, 40)],
    ["mpCost", true, (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? null : "MP cost must be a whole number of 0 or more")],
  ];
}

const isAbsent = (raw) => raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

// Every problem with one spell, keyed by field - { name: "Name is required",
// dc: "DC must be ..." } - or {} when it's valid. The spell editor
// (client/src/SpellbookModal.jsx) imports this to mark fields as the player
// types, so the form and the server can't disagree about what's valid.
export function spellFieldErrors(spell) {
  const errors = {};
  for (const [key, required, check] of spellChecks(spell)) {
    const raw = spell[key];
    if (isAbsent(raw)) {
      if (required) errors[key] = `${key} is required`;
      continue;
    }
    const error = check(raw);
    if (error) errors[key] = error;
  }
  if (!isAbsent(spell.damageOverTime) && isAbsent(spell.duration)) {
    errors.duration = "damage over time needs a duration";
  }
  return errors;
}

function validateSpell(spell, index) {
  const where = `Spell ${index + 1}`;
  if (!spell || typeof spell !== "object" || Array.isArray(spell)) return { error: `${where} must be an object` };

  const clean = {};
  for (const [key, required, check] of spellChecks(spell)) {
    const raw = spell[key];
    if (isAbsent(raw)) {
      if (required) return { error: `${where} (${spell.name || "unnamed"}): ${key} is required` };
      continue;
    }
    const error = check(raw);
    if (error) return { error: `${where} (${spell.name || "unnamed"}): ${error}` };
    clean[key] = typeof raw === "string" ? raw.trim() : raw;
  }

  // Cross-field rules. Save fields only mean something on a save spell, so
  // they're dropped rather than stored as dead data otherwise.
  if (clean.resolution !== "save") {
    delete clean.save;
    delete clean.dc;
    delete clean.onSave;
  } else if (clean.onSave && !clean.damage) {
    delete clean.onSave;
  }
  if (clean.damageOverTime && !clean.duration) {
    return { error: `${where} (${clean.name}): damage over time needs a duration` };
  }
  return { spell: clean };
}

// Validates a whole list for PATCH /spells. Returns { spells } (cleaned) or
// { error } naming the first problem.
export function validateSpellList(spells) {
  if (!Array.isArray(spells)) return { error: "spells must be a list" };
  if (spells.length > MAX_SPELLS) return { error: `A character can have at most ${MAX_SPELLS} spells` };
  const cleaned = [];
  const ids = new Set();
  for (let i = 0; i < spells.length; i++) {
    const { spell, error } = validateSpell(spells[i], i);
    if (error) return { error };
    if (ids.has(spell.id)) return { error: `Spell ${i + 1} (${spell.name}): duplicate id` };
    ids.add(spell.id);
    cleaned.push(spell);
  }
  return { spells: cleaned };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The message a cast posts. Fixed layout - the DM prompts key on these line
// labels the same way they key on roll-message labels. Only the lines that
// apply are included.
export function formatCastMessage(spell) {
  const lines = [`CAST: ${spell.name} (${spell.type})${spell.mpCost > 0 ? ` · ${spell.mpCost} MP` : ""}`, spell.description, `Range: ${spell.range}`];
  if (spell.resolution === "attack") {
    lines.push("To hit: attack roll follows");
  } else if (spell.resolution === "save") {
    const onSave = spell.damage && spell.onSave === "half" ? "half damage on a save" : "no effect on a save";
    lines.push(`Save: ${capitalize(spell.save)} DC ${spell.dc} — ${onSave}`);
  } else {
    lines.push("No roll to hit");
  }
  if (spell.damage) lines.push(`Damage: ${spell.damage}`);
  if (spell.damageOverTime) lines.push(`Ongoing: ${spell.damageOverTime} at the start of each of its rounds`);
  if (spell.effect) lines.push(`Effect: ${spell.effect}`);
  if (spell.duration) lines.push(`Duration: ${spell.duration}`);
  return lines.join("\n");
}

// Shared by both cast routes. `conversation` needs characterSpells and
// characterMp. Returns { content, patch } - the message to post and the
// conversation-row update that pays for it - or { status, error }. Pure:
// the caller applies the patch and posts the message.
export function resolveCast({ conversation, username, body }) {
  const spellId = body?.spellId;
  if (typeof spellId !== "string" || !spellId) return { status: 400, error: "spellId is required" };

  const spell = (conversation.characterSpells?.[username] ?? []).find((s) => s.id === spellId);
  if (!spell) return { status: 404, error: "Spell not found" };

  const mp = conversation.characterMp?.[username] ?? { current: 0, max: 0 };
  if (mp.current < spell.mpCost) {
    return { status: 400, error: `Not enough MP — need ${spell.mpCost}, have ${mp.current}` };
  }

  const characterMp = { ...(conversation.characterMp ?? {}), [username]: { ...mp, current: mp.current - spell.mpCost } };
  return { content: formatCastMessage(spell), patch: { characterMp } };
}
