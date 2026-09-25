import { useEffect, useState } from "react";
import { saveCharacterAc, saveCharacterSaves } from "./api/conversations";

const DEFAULT_AC = 16;
const SAVES = [
  ["fortitude", "Fort"],
  ["reflex", "Reflex"],
  ["will", "Will"],
];

// One always-editable number in a small square, like the old AC plate: it
// changes rarely, so there's no separate "start editing" step. The whole box
// is a <label>, so clicking anywhere in it focuses the field. Commits on blur
// or Enter; an empty field reverts.
function StatBox({ conversationId, label, value, onCommit }) {
  const [draft, setDraft] = useState(String(value));

  // Stay in sync with the server value after a refetch, and drop a stale
  // draft when switching conversations (this stays mounted across the switch).
  useEffect(() => {
    setDraft(String(value));
  }, [value, conversationId]);

  async function commit() {
    if (draft === "") {
      setDraft(String(value));
      return;
    }
    const next = Number(draft);
    if (next === value) return;
    const ok = await onCommit(next);
    if (!ok) setDraft(String(value));
  }

  return (
    <label className="stat-box">
      <span className="stat-box__square">
        <input
          type="text"
          inputMode="numeric"
          className="stat-box__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        />
      </span>
      <span className="stat-box__label">{label}</span>
    </label>
  );
}

// AC, then a divider, then the three saves (Laria's classic Fortitude /
// Reflex / Will). All four sit in the combat DM's roster.
export default function DefenseStats({ conversationId, ac, saves, onAcSaved, onSavesSaved }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
  }, [conversationId]);

  async function run(saveFn, onSaved) {
    try {
      await saveFn();
      setError(null);
      onSaved?.();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  return (
    <section id="defense-stats">
      <div className="defense-stats__row">
        <StatBox
          conversationId={conversationId}
          label="AC"
          value={ac ?? DEFAULT_AC}
          onCommit={(v) => run(() => saveCharacterAc(conversationId, v), onAcSaved)}
        />
        <span className="defense-stats__divider" aria-hidden="true" />
        {SAVES.map(([key, label]) => (
          <StatBox
            key={key}
            conversationId={conversationId}
            label={label}
            value={saves?.[key] ?? 0}
            onCommit={(v) => run(() => saveCharacterSaves(conversationId, { [key]: v }), onSavesSaved)}
          />
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
