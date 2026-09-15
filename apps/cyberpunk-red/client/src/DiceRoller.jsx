import { useEffect, useState } from "react";
import { submitRoll } from "./api/conversations";
import { submitCombatRoll } from "@roleplayer/core/api/combats.js";

const ROLL_TYPES = [
  { value: "SKILL_CHECK", label: "Skill Check", requiresFreeText: true },
  { value: "SKILL_CHECK_OPPOSING", label: "Skill Check (Opposing)", requiresFreeText: true },
  { value: "ATTACK_MELEE", label: "Attack Roll (Melee)", requiresFreeText: true },
  { value: "ATTACK_RANGED", label: "Attack Roll (Ranged)", requiresFreeText: true },
  { value: "DAMAGE", label: "Damage Roll", requiresFreeText: true, requiresNumDice: true },
  { value: "DEFENSE_MELEE", label: "Evasion (Melee)", requiresFreeText: false },
];

const EMPTY_FORM = { rollType: "", modifier: "", freeText: "", numDice: "" };

// While the chapter is in combat mode (activeCombatId set), rolls post to
// the combat's own transcript instead of the chapter's - same math, same
// message format, different table (specs/combat-encounters.md §5.3).
export default function DiceRoller({ conversationId, activeCombatId = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [rolling, setRolling] = useState(false);

  // A stale error (e.g. from a locked-chapter rejection) or a half-filled
  // roll shouldn't linger after switching chapters/conversations — this
  // component stays mounted across the switch, only its props change.
  useEffect(() => {
    setForm(EMPTY_FORM);
    setError(null);
  }, [conversationId]);

  const selectedType = ROLL_TYPES.find((t) => t.value === form.rollType);

  // Modifier "even if it's 0" just means the field can't be left blank —
  // an untouched input is "", a typed zero is "0", so a plain non-empty
  // check already distinguishes the two correctly.
  const canRoll =
    !!conversationId &&
    !!selectedType &&
    form.modifier.trim() !== "" &&
    (!selectedType.requiresFreeText || form.freeText.trim() !== "") &&
    (!selectedType.requiresNumDice || (form.numDice.trim() !== "" && Number(form.numDice) >= 1));

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleRoll() {
    if (!canRoll || rolling) return;
    setRolling(true);
    setError(null);
    try {
      const payload = {
        rollType: form.rollType,
        modifier: Number(form.modifier),
        freeText: selectedType.requiresFreeText ? form.freeText.trim() : undefined,
        numDice: selectedType.requiresNumDice ? Number(form.numDice) : undefined,
      };
      if (activeCombatId) {
        await submitCombatRoll(activeCombatId, payload);
      } else {
        await submitRoll(conversationId, payload);
      }
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setRolling(false);
    }
  }

  return (
    <section id="dice-roller">
      <strong>Dice Roller</strong>

      <label>
        Roll type
        <select value={form.rollType} onChange={(e) => update("rollType", e.target.value)}>
          <option value="" disabled>
            Select...
          </option>
          {ROLL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {selectedType?.requiresNumDice && (
        <label>
          Number of d6
          <input
            type="number"
            min="1"
            value={form.numDice}
            onChange={(e) => update("numDice", e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}

      <label>
        Modifier
        <input
          type="number"
          value={form.modifier}
          onChange={(e) => update("modifier", e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </label>

      {selectedType?.requiresFreeText && (
        <label>
          Weapon / skill
          <input type="text" value={form.freeText} onChange={(e) => update("freeText", e.target.value)} />
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={handleRoll} disabled={!canRoll || rolling}>
        {rolling ? "Rolling..." : "ROLL"}
      </button>
    </section>
  );
}
