import { useEffect, useState } from "react";

const MAX_LENGTH = 500;

export default function CharacterTextField({ conversationId, icon, label, buttonLabel, placeholder, value, onSave, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // A stale error (e.g. from a locked-chapter rejection) or an expanded
  // draft from a previous chapter/conversation shouldn't linger after
  // switching — this component stays mounted across the switch, only its
  // props change.
  useEffect(() => {
    setExpanded(false);
    setError(null);
  }, [conversationId]);

  function expand() {
    setDraft(value ?? "");
    setError(null);
    setExpanded(true);
  }

  function cancel() {
    setExpanded(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(conversationId, draft);
      setExpanded(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="character-text-field">
      <div className="action-item">
        <button type="button" className="icon-button" onClick={expand}>
          <span className="icon-emoji">{icon}</span>
        </button>
        <span className="action-label">{buttonLabel}</span>
      </div>
      {expanded && (
        <div className="modal-overlay" onClick={cancel}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <h2>{label}</h2>
            <textarea autoFocus maxLength={MAX_LENGTH} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
            <div className="field-meta">
              <span className={draft.length >= MAX_LENGTH ? "at-limit" : ""}>
                {draft.length} / {MAX_LENGTH}
              </span>
            </div>
            {error && <p role="alert">{error}</p>}
            <div className="field-actions">
              <button type="button" onClick={cancel} disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
