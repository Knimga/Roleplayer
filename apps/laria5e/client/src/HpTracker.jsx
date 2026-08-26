import { saveCharacterHp } from "./api/conversations";
import NumberBarTracker from "./NumberBarTracker";
import { computeWoundState, woundStateColorClass } from "./woundState";

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
