import { saveCharacterSp } from "./api/conversations";
import NumberBarTracker from "@roleplayer/ui/NumberBarTracker.jsx";

// A plain counter, always gray — no thresholds, no wound-state-equivalent
// label, unlike HpTracker. See character-sp.md.
export default function SpTracker({ conversationId, sp, onSaved }) {
  return (
    <section id="sp-tracker">
      <NumberBarTracker
        conversationId={conversationId}
        label="SP"
        value={sp}
        colorClass="hp-neutral"
        saveFn={saveCharacterSp}
        onSaved={onSaved}
      />
    </section>
  );
}
