// Mirrors the thresholds in server/lib/claude.js's computeWoundState — keep
// both in sync if either changes. A falsy max (0, the Story-creation
// default, or undefined/null, e.g. data that predates this feature) is
// treated as unset rather than run through the thresholds below.
export function computeWoundState(current, max) {
  if (!max) return null;
  if (current === max) return "Healthy";
  if (current > max / 2) return "Lightly Wounded";
  if (current >= 1) return "Seriously Wounded";
  return "Mortally Wounded";
}

const COLOR_CLASS = {
  Healthy: "hp-green",
  "Lightly Wounded": "hp-yellow-green",
  "Seriously Wounded": "hp-orange",
  "Mortally Wounded": "hp-red",
};

export function woundStateColorClass(woundState) {
  return woundState ? COLOR_CLASS[woundState] : "hp-neutral";
}
