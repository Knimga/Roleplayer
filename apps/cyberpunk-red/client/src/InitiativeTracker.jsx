import { useEffect, useState } from "react";
import { saveCharacterInitiative } from "./api/conversations";

// One click-to-edit number under SP, styled like the HP/SP numbers row. The
// player enters their own bonus (REF plus anything that adds to it); the
// combat-state feature will roll initiative from it (specs/combat-state.md).
export default function InitiativeTracker({ conversationId, initiative, onSaved }) {
  const value = initiative ?? 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [conversationId]);

  async function commit() {
    setEditing(false);
    if (draft === "" || draft === String(value)) return;
    try {
      await saveCharacterInitiative(conversationId, Number(draft));
      setError(null);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section id="initiative-tracker">
      <p className="hp-numbers">
        <span className="hp-label">Initiative</span>
        {editing ? (
          <input
            type="text"
            inputMode="numeric"
            className="hp-number-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") {
                setDraft(String(value));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="hp-number hp-neutral"
            title="Initiative bonus"
            onClick={() => {
              setDraft(String(value));
              setError(null);
              setEditing(true);
            }}
          >
            +{value}
          </button>
        )}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
