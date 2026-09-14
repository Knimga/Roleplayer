import { useEffect, useState } from "react";
import { saveCharacterAc } from "./api/conversations";

const DEFAULT_AC = 16;

// Unlike HP's click-to-edit numbers, AC is a plain always-editable text
// input — it changes rarely (armor swap, spell effect), so there's no
// meter/track and no separate "start editing" step. The whole plate is a
// <label>, so clicking anywhere in it focuses the field.
export default function AcTracker({ conversationId, ac, onSaved }) {
  const [draft, setDraft] = useState(String(ac ?? DEFAULT_AC));
  const [error, setError] = useState(null);

  // Stay in sync with the server value on prop changes (e.g. after a
  // refetch), and drop any stale error/draft when switching conversations —
  // this component stays mounted across the switch, only its props change.
  useEffect(() => {
    setDraft(String(ac ?? DEFAULT_AC));
    setError(null);
  }, [ac, conversationId]);

  function handleChange(e) {
    setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2));
  }

  async function commit() {
    const current = ac ?? DEFAULT_AC;
    if (draft === "") {
      setDraft(String(current));
      return;
    }
    const value = Number(draft);
    if (value === current) return;
    try {
      await saveCharacterAc(conversationId, value);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setDraft(String(current));
    }
  }

  return (
    <div id="ac-tracker">
      <label className="ac-field">
        <span className="ac-label">Armor Class</span>
        <input
          type="text"
          inputMode="numeric"
          className="ac-input"
          value={draft}
          onChange={handleChange}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
