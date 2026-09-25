import { useEffect, useRef, useState } from "react";
import { useModalClose } from "@roleplayer/ui/useModalClose.js";
import { saveCharacterSpells } from "./api/conversations";
import { spellFieldErrors } from "../../server/spells.js";
import { SpellChips, TypeBadge } from "./spellDisplay.jsx";

// The player's own spell list (specs/laria5e/character-spells.md): view,
// create, edit, delete. Every save or delete writes the whole list to the
// server (PATCH /spells), which validates it with the same rules the form
// marks fields with - spellFieldErrors from server/spells.js.

const BLANK_DRAFT = {
  name: "",
  type: "utility",
  description: "",
  range: "",
  resolution: "none",
  save: "will",
  dc: "",
  onSave: "none",
  damage: "",
  damageOverTime: "",
  effect: "",
  duration: "",
  mpCost: "",
};

function toDraft(spell) {
  return {
    ...BLANK_DRAFT,
    ...Object.fromEntries(Object.entries(spell).filter(([, v]) => v !== undefined && v !== null)),
    dc: spell.dc == null ? "" : String(spell.dc),
    mpCost: spell.mpCost == null ? "" : String(spell.mpCost),
  };
}

// The draft as the server wants it: numbers as numbers, optional fields
// dropped when empty, save fields only on a save spell.
function fromDraft(id, d) {
  const spell = {
    id,
    name: d.name.trim(),
    type: d.type,
    description: d.description.trim(),
    range: d.range.trim(),
    resolution: d.resolution,
    mpCost: d.mpCost === "" ? undefined : Number(d.mpCost),
  };
  if (d.resolution === "save") {
    spell.save = d.save;
    spell.dc = d.dc === "" ? undefined : Number(d.dc);
    if (d.damage.trim()) spell.onSave = d.onSave;
  }
  for (const key of ["damage", "damageOverTime", "effect", "duration"]) {
    if (d[key].trim()) spell[key] = d[key].trim();
  }
  return spell;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `sp-${Date.now()}`);

function Field({ label, span, error, children }) {
  return (
    <label className={`spell-field span-${span}${error ? " invalid" : ""}`} title={error || undefined}>
      {label}
      {children}
    </label>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L20 8l-4-4L4 16v4z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  );
}

export default function SpellbookModal({ conversationId, characterName, spells, mp, onClose, onSaved }) {
  const { overlayClass, requestClose } = useModalClose();
  // A spell being created exists only here until it's saved.
  const [pendingNew, setPendingNew] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [confirmId, setConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  const close = () => requestClose(onClose);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const list = pendingNew ? [pendingNew, ...spells] : spells;
  const errors = editingId ? spellFieldErrors(fromDraft(editingId, draft)) : {};
  const canSave = Object.keys(errors).length === 0 && !saving;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function startNew() {
    const blank = { id: newId(), ...BLANK_DRAFT };
    setPendingNew(blank);
    setEditingId(blank.id);
    setDraft(BLANK_DRAFT);
    setConfirmId(null);
    setError(null);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  function startEdit(spell) {
    setPendingNew(null);
    setEditingId(spell.id);
    setDraft(toDraft(spell));
    setConfirmId(null);
    setError(null);
  }

  function cancelEdit() {
    setPendingNew(null);
    setEditingId(null);
    setError(null);
  }

  async function persist(nextList) {
    setSaving(true);
    setError(null);
    try {
      await saveCharacterSpells(conversationId, nextList);
      onSaved?.();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!canSave) return;
    const spell = fromDraft(editingId, draft);
    const exists = spells.some((s) => s.id === editingId);
    const nextList = exists ? spells.map((s) => (s.id === editingId ? spell : s)) : [spell, ...spells];
    if (await persist(nextList)) {
      setPendingNew(null);
      setEditingId(null);
    }
  }

  async function deleteSpell(id) {
    if (await persist(spells.filter((s) => s.id !== id))) {
      setConfirmId(null);
      if (editingId === id) setEditingId(null);
    }
  }

  const count = spells.length;

  return (
    <div className={overlayClass} onClick={close}>
      <div className="modal-panel spellbook-panel" onClick={(e) => e.stopPropagation()}>
        <div className="spellbook-header">
          <span className="spellbook-header__icon">📖</span>
          <div className="spellbook-header__titles">
            <strong className="spellbook-header__title">Spellbook</strong>
            <span className="spellbook-header__subtitle">
              {characterName} · {count} {count === 1 ? "Spell" : "Spells"} · {mp?.current ?? 0} / {mp?.max ?? 0} MP
            </span>
          </div>
          <button type="button" className="spellbook-close" onClick={close} title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="spellbook-list" ref={listRef}>
          {list.length === 0 && <p className="spellbook-empty">No spells yet. Add your first with + New Spell.</p>}
          {list.map((spell) =>
            editingId === spell.id ? (
              <div key={spell.id} className="spell-pane editing">
                <div className="spell-form">
                  <Field label="Name" span={4} error={errors.name}>
                    <input value={draft.name} maxLength={40} placeholder="Ember Volley" onChange={(e) => set({ name: e.target.value })} autoFocus />
                  </Field>
                  <Field label="MP Cost" span={2} error={errors.mpCost}>
                    <input value={draft.mpCost} inputMode="numeric" placeholder="0" onChange={(e) => set({ mpCost: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} />
                  </Field>
                  <Field label="Type" span={3} error={errors.type}>
                    <select value={draft.type} onChange={(e) => set({ type: e.target.value })}>
                      <option value="buff">Buff</option>
                      <option value="debuff">Debuff</option>
                      <option value="single-target">Single Target</option>
                      <option value="aoe">AoE</option>
                      <option value="utility">Utility</option>
                    </select>
                  </Field>
                  <Field label="Range" span={3} error={errors.range}>
                    <input value={draft.range} maxLength={40} placeholder="touch · 30ft" onChange={(e) => set({ range: e.target.value })} />
                  </Field>
                  <Field label={`Description · ${draft.description.trim().length} / 200`} span={6} error={errors.description}>
                    <textarea
                      rows={2}
                      maxLength={200}
                      value={draft.description}
                      placeholder="What it looks like when you cast it — the DM reads this."
                      onChange={(e) => set({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="Resolution" span={2} error={errors.resolution}>
                    <select value={draft.resolution} onChange={(e) => set({ resolution: e.target.value })}>
                      <option value="none">None</option>
                      <option value="attack">Attack roll</option>
                      <option value="save">Saving throw</option>
                    </select>
                  </Field>
                  {draft.resolution === "save" && (
                    <>
                      <Field label="Save" span={2} error={errors.save}>
                        <select value={draft.save} onChange={(e) => set({ save: e.target.value })}>
                          <option value="fortitude">Fortitude</option>
                          <option value="reflex">Reflex</option>
                          <option value="will">Will</option>
                        </select>
                      </Field>
                      <Field label="DC · 1–30" span={2} error={errors.dc}>
                        <input value={draft.dc} inputMode="numeric" placeholder="14" onChange={(e) => set({ dc: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} />
                      </Field>
                    </>
                  )}
                  <Field label="Damage · optional" span={3} error={errors.damage}>
                    <input value={draft.damage} maxLength={32} placeholder="6d6 fire · 1d10+3" onChange={(e) => set({ damage: e.target.value })} />
                  </Field>
                  {draft.resolution === "save" && draft.damage.trim() && (
                    <Field label="On a successful save" span={3} error={errors.onSave}>
                      <select value={draft.onSave} onChange={(e) => set({ onSave: e.target.value })}>
                        <option value="none">No damage</option>
                        <option value="half">Half damage</option>
                      </select>
                    </Field>
                  )}
                  <Field label="Damage Per Round · needs a duration" span={3} error={errors.damageOverTime}>
                    <input value={draft.damageOverTime} maxLength={32} placeholder="1d6 poison" onChange={(e) => set({ damageOverTime: e.target.value })} />
                  </Field>
                  <Field label="Duration · blank is instant" span={3} error={errors.duration}>
                    <input value={draft.duration} maxLength={40} placeholder="3 rounds" onChange={(e) => set({ duration: e.target.value })} />
                  </Field>
                  <Field label="Other Effect · optional" span={6} error={errors.effect}>
                    <input value={draft.effect} maxLength={100} placeholder="STR −2 · immobilized · confused" onChange={(e) => set({ effect: e.target.value })} />
                  </Field>
                </div>
                {error && <p role="alert">{error}</p>}
                <div className="spell-form__actions">
                  <button type="button" className="spell-save" disabled={!canSave} onClick={saveEdit}>
                    {saving ? "Saving…" : "Save Spell"}
                  </button>
                  <button type="button" className="spell-cancel" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={spell.id} className="spell-pane">
                <div className="spell-pane__head">
                  <span className="spell-pane__name">{spell.name}</span>
                  <TypeBadge type={spell.type} />
                  <span className="spell-pane__mp">{spell.mpCost} MP</span>
                </div>
                <p className="spell-pane__desc">{spell.description}</p>
                <SpellChips spell={spell} />
                {confirmId === spell.id ? (
                  <div className="spell-pane__actions confirming">
                    <button type="button" className="spell-delete-confirm" disabled={saving} onClick={() => deleteSpell(spell.id)}>
                      Delete
                    </button>
                    <button type="button" className="spell-icon" title="Keep this spell" onClick={() => setConfirmId(null)}>
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="spell-pane__actions">
                    <button type="button" className="spell-icon" title="Edit spell" onClick={() => startEdit(spell)}>
                      <PencilIcon />
                    </button>
                    <button type="button" className="spell-icon danger" title="Delete spell" onClick={() => setConfirmId(spell.id)}>
                      <TrashIcon />
                    </button>
                  </div>
                )}
                {confirmId === spell.id && error && <p role="alert">{error}</p>}
              </div>
            ),
          )}
        </div>

        <div className="spellbook-footer">
          <span className="spellbook-footer__hint">Esc closes</span>
          <button type="button" className="spellbook-new" onClick={startNew} disabled={!!pendingNew}>
            + New Spell
          </button>
        </div>
      </div>
    </div>
  );
}
