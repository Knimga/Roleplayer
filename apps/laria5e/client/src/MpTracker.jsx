import { saveCharacterMp } from "./api/conversations";
import NumberBarTracker from "@roleplayer/ui/NumberBarTracker.jsx";

// A plain counter beneath HP, always pale blue — no thresholds, no
// wound-state-equivalent label, unlike HpTracker. Player-only bookkeeping:
// MP never reaches the DM's roster.
export default function MpTracker({ conversationId, mp, onSaved }) {
  return (
    <section id="mp-tracker">
      <NumberBarTracker
        conversationId={conversationId}
        label="MP"
        value={mp}
        colorClass="hp-blue"
        saveFn={saveCharacterMp}
        onSaved={onSaved}
        layout="inline"
      />
    </section>
  );
}
