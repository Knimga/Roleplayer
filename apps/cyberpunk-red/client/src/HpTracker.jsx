import { saveCharacterHp } from "./api/conversations";
import NumberBarTracker from "@roleplayer/ui/NumberBarTracker.jsx";
import { computeWoundState, woundStateColorClass } from "@roleplayer/core/woundState.js";

// The action penalties Wound State applies (player-damage-healing.md) -
// Cyberpunk Red specific, so kept local rather than in the shared
// woundState.js helper (Laria doesn't render a Wound State line at all).
// Only the two worst states carry a penalty; Healthy/Lightly Wounded map to
// no entry, so nothing extra renders and the panel's height is unchanged.
const WOUND_PENALTIES = {
  "Seriously Wounded": "(-2 to All)",
  "Mortally Wounded": "(-4 to All, Slow Mvt.)",
};

export default function HpTracker({ conversationId, hp, onSaved }) {
  const { current, max } = hp ?? { current: 0, max: 0 };
  const woundState = computeWoundState(current, max);
  const colorClass = woundStateColorClass(woundState);
  const penalty = WOUND_PENALTIES[woundState];

  return (
    <section id="hp-tracker">
      <NumberBarTracker
        conversationId={conversationId}
        label="HP"
        value={hp}
        colorClass={colorClass}
        saveFn={saveCharacterHp}
        onSaved={onSaved}
      />
      {woundState && <p className={`wound-state ${colorClass}`}>{woundState}</p>}
      {penalty && <p className={`wound-penalty ${colorClass}`}>{penalty}</p>}
    </section>
  );
}
