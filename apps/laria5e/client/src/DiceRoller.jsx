import { useEffect, useState } from "react";
import { submitRoll } from "./api/conversations";
import { submitCombatRoll } from "@roleplayer/core/api/combats.js";

const SKILLS = [
  "Athletics",
  "Acrobatics",
  "Sleight of Hand",
  "Stealth",
  "Arcana",
  "History",
  "Investigation",
  "Nature",
  "Religion",
  "Animal Handling",
  "Insight",
  "Medicine",
  "Perception",
  "Survival",
  "Deception",
  "Intimidation",
  "Performance",
  "Persuasion",
];
// Laria uses the classic three saves, not 5e's six ability saves - see
// mcp/docs/saving-throws.md. Mirrored in server/combat/roll-message.js.
const SAVES = ["Fortitude", "Reflex", "Will"];
const DIE_TYPES = ["4", "6", "8", "10", "12", "20"];

function emptyFields() {
  return {
    skill: "",
    save: "",
    diceRows: [{ count: "1", dieType: "" }],
    modifier: "",
    adv: "flat",
    crit: false,
    description: "",
  };
}

// The actual roll — including advantage/disadvantage and crit resolution —
// happens server-side (POST /:id/roll) so it's authoritative and visible to
// both players as a message in the conversation, the same as any other
// chat message. This component is just the input surface + gating.
// While the chapter is in combat mode (activeCombatId set), rolls post to
// the combat's own transcript instead of the chapter's - same math, same
// message format, different table (specs/combat-encounters.md §5.3).
export default function DiceRoller({ conversationId, activeCombatId = null }) {
  const [rollType, setRollType] = useState("skill"); // "skill" | "attack" | "save" | "damage" | "misc"
  const [fields, setFields] = useState(emptyFields);
  const [error, setError] = useState(null);
  const [rolling, setRolling] = useState(false);

  // A stale error or a half-filled roll shouldn't linger after switching
  // chapters/conversations — this component stays mounted across the
  // switch, only its props change.
  useEffect(() => {
    setRollType("skill");
    setFields(emptyFields());
    setError(null);
  }, [conversationId]);

  const isSkill = rollType === "skill";
  const isSave = rollType === "save";
  const isDamage = rollType === "damage";
  const isMisc = rollType === "misc";
  const usesDiceRows = isDamage || isMisc;
  const usesAdvantage = isSkill || rollType === "attack" || isSave;
  // Forced to "flat"/false whenever their controls aren't shown, so a stale
  // adv/dis or crit picked before switching roll type can never leak into a
  // result it doesn't apply to.
  const effectiveAdv = usesAdvantage ? fields.adv : "flat";
  const effectiveCrit = isDamage && fields.crit;

  const parsedRows = fields.diceRows.map((r) => ({ count: parseInt(r.count, 10) || 0, dieType: r.dieType }));
  const diceRowsReady = parsedRows.every((r) => r.count > 0 && r.dieType);
  const rollDisabled =
    !conversationId ||
    rolling ||
    (isSkill
      ? !fields.skill
      : isSave
        ? !fields.save
        : isDamage
          ? !diceRowsReady
          : isMisc
            ? !diceRowsReady || !fields.description.trim()
            : false);

  function update(patch) {
    setFields((prev) => ({ ...prev, ...patch }));
  }

  function updateRow(i, patch) {
    setFields((prev) => ({
      ...prev,
      diceRows: prev.diceRows.map((r, n) => (n === i ? { ...r, ...patch } : r)),
    }));
  }

  function addRow() {
    setFields((prev) => ({ ...prev, diceRows: [...prev.diceRows, { count: "1", dieType: "" }] }));
  }

  function removeRow(i) {
    setFields((prev) => (prev.diceRows.length > 1 ? { ...prev, diceRows: prev.diceRows.filter((_, n) => n !== i) } : prev));
  }

  function handleRollTypeChange(e) {
    setRollType(e.target.value);
    setFields(emptyFields());
  }

  async function handleRoll() {
    if (rollDisabled) return;
    setRolling(true);
    setError(null);
    try {
      const modifier = parseInt(fields.modifier, 10) || 0;
      const payload = {
        rollType,
        skill: isSkill ? fields.skill : undefined,
        save: isSave ? fields.save : undefined,
        advantage: usesAdvantage ? fields.adv : undefined,
        diceRows: usesDiceRows ? parsedRows.map((r) => ({ count: r.count, dieType: Number(r.dieType) })) : undefined,
        crit: isDamage ? fields.crit : undefined,
        description: isMisc ? fields.description.trim() : undefined,
        modifier,
      };
      if (activeCombatId) {
        await submitCombatRoll(activeCombatId, payload);
      } else {
        await submitRoll(conversationId, payload);
      }
      setFields((prev) => ({ ...emptyFields(), adv: prev.adv }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRolling(false);
    }
  }

  const diceRowsSummary = parsedRows
    .map((r) => `${effectiveCrit ? r.count * 2 : r.count}d${r.dieType}`)
    .join(" + ");

  const rollLabel = usesDiceRows
    ? diceRowsReady
      ? `Roll ${diceRowsSummary}${effectiveCrit ? " · Crit" : ""}`
      : isDamage
        ? "Roll Damage"
        : "Roll Dice"
    : effectiveAdv === "adv"
      ? "Roll 2d20 · Keep High"
      : effectiveAdv === "dis"
        ? "Roll 2d20 · Keep Low"
        : "Roll 1d20";

  // Crit takes precedence over the advantage tint on the Roll button — they
  // can't actually collide, since advantage is never active on a damage roll.
  const rollTintClass = effectiveCrit ? "crit" : effectiveAdv;

  return (
    <section id="dice-roller">
      <strong>Dice Roller</strong>

      <label>
        Roll Type
        <select value={rollType} onChange={handleRollTypeChange}>
          <option value="skill">Skill Check</option>
          <option value="attack">Attack Roll</option>
          <option value="save">Saving Throw</option>
          <option value="damage">Damage Roll</option>
          <option value="misc">Misc. Roll</option>
        </select>
      </label>

      {isSkill && (
        <label>
          Skill
          <select
            className={fields.skill ? "" : "field-required-empty"}
            value={fields.skill}
            onChange={(e) => update({ skill: e.target.value })}
          >
            <option value="">Choose a skill…</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {isSave && (
        <label>
          Save
          <select
            className={fields.save ? "" : "field-required-empty"}
            value={fields.save}
            onChange={(e) => update({ save: e.target.value })}
          >
            <option value="">Choose a save…</option>
            {SAVES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {usesAdvantage && (
        <div className="adv-toggle">
          <button
            type="button"
            className={`adv-segment adv${fields.adv === "adv" ? " active" : ""}`}
            onClick={() => update({ adv: "adv" })}
            title="Roll twice, keep the higher"
          >
            ADV
          </button>
          <button
            type="button"
            className={`adv-segment flat${fields.adv === "flat" ? " active" : ""}`}
            onClick={() => update({ adv: "flat" })}
            title="Single d20"
          >
            FLAT
          </button>
          <button
            type="button"
            className={`adv-segment dis${fields.adv === "dis" ? " active" : ""}`}
            onClick={() => update({ adv: "dis" })}
            title="Roll twice, keep the lower"
          >
            DIS
          </button>
        </div>
      )}

      {usesDiceRows && (
        <div className="damage-dice-field">
          <span className="damage-dice-label">{isDamage ? "Damage Dice" : "Dice"}</span>
          <div className="damage-dice-list">
            {fields.diceRows.map((row, i) => (
              <div className="damage-dice-row" key={i}>
                <input
                  className={parsedRows[i].count > 0 ? "" : "field-required-empty"}
                  type="number"
                  min="1"
                  max="20"
                  placeholder="2"
                  value={row.count}
                  onChange={(e) => updateRow(i, { count: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
                <span className="die-separator">d</span>
                <select
                  className={row.dieType ? "" : "field-required-empty"}
                  value={row.dieType}
                  onChange={(e) => updateRow(i, { dieType: e.target.value })}
                >
                  <option value="">—</option>
                  {DIE_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dice-row-remove"
                  disabled={fields.diceRows.length < 2}
                  onClick={() => removeRow(i)}
                  title="Remove this die"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="add-dice-row" onClick={addRow}>
            + Add Dice
          </button>
        </div>
      )}

      {isDamage && (
        <button
          type="button"
          className={`crit-toggle${fields.crit ? " active" : ""}`}
          onClick={() => update({ crit: !fields.crit })}
          title="Double the damage dice"
        >
          <span className="crit-dot" />
          <span>Critical Hit</span>
        </button>
      )}

      <label>
        Modifier
        <input
          type="number"
          placeholder="0"
          value={fields.modifier}
          onChange={(e) => update({ modifier: e.target.value })}
          onFocus={(e) => e.target.select()}
        />
      </label>

      {isMisc && (
        <label>
          Roll Type Description
          <input
            className={fields.description.trim() ? "" : "field-required-empty"}
            type="text"
            maxLength={80}
            placeholder="e.g. Perception (Passive)"
            value={fields.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <button type="button" className={`roll-button ${rollTintClass}`} disabled={rollDisabled} onClick={handleRoll}>
        {rolling ? "Rolling…" : rollLabel}
      </button>
    </section>
  );
}
