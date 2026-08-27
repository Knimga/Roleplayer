import { saveCharacterHp } from "./api/conversations";
import NumberBarTracker from "@roleplayer/ui/NumberBarTracker.jsx";
import { computeWoundState, woundStateColorClass } from "@roleplayer/core/woundState.js";

export default function HpTracker({ conversationId, hp, onSaved }) {
  const { current, max } = hp ?? { current: 0, max: 0 };
  const woundState = computeWoundState(current, max);
  const colorClass = woundStateColorClass(woundState);

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
    </section>
  );
}
