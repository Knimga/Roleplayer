import { useEffect, useState } from "react";
import { castCombatSpell } from "@roleplayer/core/api/combats.js";
import { castSpell } from "./api/conversations";
import { SpellChips, TypeBadge } from "./spellDisplay.jsx";

// Pick a spell from your spellbook and cast it: posts the CAST: message to
// the chapter - or to the fight, when one is active, same routing as the
// dice roller - and the server deducts the MP. The MP bar updates when the
// message's SSE event triggers the usual refresh.
export default function CastSpell({ conversationId, activeCombatId, spells, mp, onCast }) {
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    setExpanded(false);
  }, [conversationId]);

  // The last spell picked, or the first in the book if that one's gone.
  const spell = spells.find((s) => s.id === selectedId) ?? spells[0] ?? null;

  if (!spell) {
    return (
      <section id="cast-spell">
        <strong className="section-heading">Cast Spell</strong>
        <p className="cast-spell__empty">No spells in your spellbook yet.</p>
      </section>
    );
  }

  const current = mp?.current ?? 0;
  const affordable = current >= spell.mpCost;

  async function handleCast() {
    if (!affordable || casting) return;
    setCasting(true);
    setError(null);
    try {
      if (activeCombatId) {
        await castCombatSpell(activeCombatId, spell.id);
      } else {
        await castSpell(conversationId, spell.id);
      }
      onCast?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCasting(false);
    }
  }

  return (
    <section id="cast-spell">
      <strong className="section-heading">Cast Spell</strong>
      <div className={`cast-spell__pane${expanded ? " expanded" : ""}`}>
        <div className="cast-spell__select-row">
          <select
            className="cast-spell__select"
            value={spell.id}
            title="Choose a spell"
            onChange={(e) => {
              setSelectedId(e.target.value);
              setError(null);
            }}
          >
            {spells.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <svg className="cast-spell__chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className="cast-spell__detail" title={expanded ? "Click to collapse" : "Click for full detail"} onClick={() => setExpanded((v) => !v)}>
          <div className="cast-spell__meta">
            <TypeBadge type={spell.type} />
            <span className="cast-spell__mp">{spell.mpCost} MP</span>
          </div>
          <p className={`cast-spell__desc${expanded ? "" : " clamped"}`}>{spell.description}</p>
          {expanded && <SpellChips spell={spell} />}
        </div>
      </div>
      <button
        type="button"
        className="cast-spell__button"
        disabled={!affordable || casting}
        title={affordable ? undefined : `Needs ${spell.mpCost} MP — you have ${current}`}
        onClick={handleCast}
      >
        {casting ? "Casting…" : affordable ? `Cast · ${spell.mpCost} MP` : `Not enough MP · ${current} / ${spell.mpCost}`}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
