import { useEffect, useState } from "react";

// Used by HpTracker: a labeled bar + a pair of independently click-to-edit
// numbers, plus the save/error/reset plumbing behind them. The caller owns
// the color logic (HP's wound-state-derived thresholds) — this component
// only renders the bar and the numbers themselves.
export default function NumberBarTracker({ conversationId, label, value, colorClass, saveFn, onSaved }) {
  const { current, max } = value ?? { current: 0, max: 0 };
  const [editingField, setEditingField] = useState(null); // null | "current" | "max"
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);

  // A stale error or an in-progress edit shouldn't linger after switching to
  // a different chapter/conversation — this component stays mounted across
  // the switch, only its props change.
  useEffect(() => {
    setEditingField(null);
    setError(null);
  }, [conversationId]);

  const fillPct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  function startEdit(field) {
    setDraft(String(field === "current" ? current : max));
    setError(null);
    setEditingField(field);
  }

  async function commit(field) {
    if (draft === String(field === "current" ? current : max)) {
      setEditingField(null);
      return;
    }
    const numericValue = Number(draft);
    if (!Number.isInteger(numericValue)) {
      setError(`${field === "current" ? "Current" : "Max"} ${label} must be a whole number`);
      setEditingField(null);
      return;
    }
    try {
      await saveFn(conversationId, { [field]: numericValue });
      setEditingField(null);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setEditingField(null);
    }
  }

  function renderNumber(field, fieldValue) {
    if (editingField === field) {
      return (
        <input
          type="number"
          className="hp-number-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(field)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(field);
            if (e.key === "Escape") setEditingField(null);
          }}
        />
      );
    }
    return (
      <button type="button" className={`hp-number ${colorClass}`} onClick={() => startEdit(field)}>
        {fieldValue}
      </button>
    );
  }

  return (
    <>
      <div className="hp-bar-track">
        <div className={`hp-bar-fill ${colorClass}`} style={{ width: `${fillPct}%` }} />
      </div>
      <p className="hp-numbers">
        <span className="hp-label">{label}</span>
        {renderNumber("current", current)}
        <span>/</span>
        {renderNumber("max", max)}
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
