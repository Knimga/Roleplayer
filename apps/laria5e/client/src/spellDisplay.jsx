// How a spell reads on screen - shared by the Spellbook modal and the Cast
// Spell section so the two can't drift. Data rules live in
// server/spells.js; this is presentation only.

export const TYPE_LABELS = {
  buff: "Buff",
  debuff: "Debuff",
  "single-target": "Single Target",
  aoe: "AoE",
  utility: "Utility",
};

export const typeLabel = (type) => TYPE_LABELS[type] ?? "Utility";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// The label/value chips under a spell's description.
export function spellChips(spell) {
  const chips = [{ label: "Range", value: spell.range }];
  if (spell.resolution === "attack") chips.push({ label: "Resolve", value: "Attack roll" });
  if (spell.resolution === "save") {
    const half = spell.damage && spell.onSave === "half" ? " · half on save" : "";
    chips.push({ label: "Save", value: `${capitalize(spell.save)} DC ${spell.dc}${half}` });
  }
  if (spell.damage) chips.push({ label: "Damage", value: spell.damage });
  if (spell.damageOverTime) chips.push({ label: "Per Round", value: spell.damageOverTime });
  if (spell.effect) chips.push({ label: "Effect", value: spell.effect });
  chips.push({ label: "Duration", value: spell.duration || "Instant" });
  return chips;
}

export function SpellChips({ spell }) {
  return (
    <div className="spell-chips">
      {spellChips(spell).map((chip) => (
        <span key={chip.label} className="spell-chip">
          <span className="spell-chip__label">{chip.label}</span>
          <span>{chip.value}</span>
        </span>
      ))}
    </div>
  );
}

export function TypeBadge({ type }) {
  return <span className={`spell-badge spell-badge--${TYPE_LABELS[type] ? type : "utility"}`}>{typeLabel(type)}</span>;
}
