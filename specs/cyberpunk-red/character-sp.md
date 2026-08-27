# Spec: Character SP

## Status
Planned

## Summary
Extends [character-hp.md](character-hp.md) with a second, simpler number tracker for SP (Stamina Points), stacked directly beneath the HP tracker within the same `hr`-separated section (no new section/divider of its own). Same persistent-per-character storage and editing mechanics as HP, but visually and functionally simpler: the bar is always gray (no color states), there is no Wound-State-equivalent label, and — unlike HP, which at least sends a derived Wound State — SP is never sent to the LLM in any form at all.

## Requirements
- [ ] SP renders directly beneath the HP tracker's content, inside the same `hr`-separated section beneath the avatar (not a new section, not a new `hr`)
- [ ] SP bar: same shape/sizing as the HP bar (thin, rounded corners, 250px track matching the avatar frame's width, proportional fill), but always gray — the fill color never changes regardless of current/max
- [ ] SP numbers ("12/12" format) render centered beneath the SP bar; current and max are each independently editable, same click-to-edit interaction as HP
- [ ] SP numbers are always a neutral/muted color — no color states, since there's no Wound-State-equivalent concept for SP
- [ ] No state label (no Wound-State-equivalent line) is rendered beneath the SP numbers, ever
- [ ] SP is persistent, per-character, per-conversation data — saved to the backend, not just held in frontend state
- [ ] When a new Story is created, both players' SP is initialized to 0/0, same as HP
- [ ] New-chapter creation carries SP over as the new chapter's starting value, same as HP and the other character fields
- [ ] The section is absent for non-Story conversations and locked (read-only) on an inactive chapter, same as HP
- [ ] SP is never sent to the LLM during "Ask the DM" calls — not the raw numbers, and (unlike HP) not any derived value either
- [ ] The HP numbers row is now prefixed "HP" and the SP numbers row is prefixed "SP" (e.g. "HP 47/47", "SP 12/12"), so the two stacked trackers are distinguishable — this is a small addition to the already-implemented [character-hp.md](../character-hp.md), not just new-for-SP

## Decisions
- **Storage**: a new `character_sp` jsonb column on `conversations`, shaped identically to `character_hp` — `{ "<username>": { "current": <int>, "max": <int> } }`, seeded to `{ current: 0, max: 0 }` for both players at Story creation, carried over on new-chapter creation. Same lifecycle, same `PATCH /:id/sp` merge/validate/self-only/active-chapter-gated shape as `PATCH /:id/hp` — see [plan-character-hp.md](plan-character-hp.md) for the pattern being mirrored.
- **Labeling**: chosen over a small caption-above-the-bar alternative because it adds no extra line to an already-dense right panel (avatar → HP → SP → Description → Weapons & Gear → Party → Dice Roller) and ties the label directly to the exact numbers a player is about to click and edit. Applies to both bars now that there are two — HP's numbers row goes from bare "47/47" to "HP 47/47" as part of this pass.
- **Always-gray bar and numbers**: no thresholds, no computed state, no color logic at all for SP — explicitly requested ("no color changes, no wound state"). The bar reuses the same track styling as HP's bar but a fixed muted-gray fill (visually similar to HP's own "unset/0-0" neutral state, reused rather than inventing a new gray).
- **Second field withheld from the LLM — and further than HP**: `character-hp.md` already established that raw HP numbers are withheld from the LLM while a *derived* Wound State is sent. SP goes one step further: nothing about SP — not the numbers, not any derived value — is ever included in a Claude request. There's no Stamina-equivalent narrative concept the DM needs to react to, so there's no `formatFieldBlock` entry for it at all, unlike HP's Wound State line.
- **No separate `hr`-wrapped section**: the request was to add SP "underneath the HP tracker," read as extending the existing HP block rather than creating a second `hr`-bounded section beside it. The single section beneath the avatar now contains HP's bar/numbers/Wound-State stack followed immediately by SP's bar/numbers stack, still opening and closing with the same two `hr`s the section already had.
- **Shared component, not a copy-pasted one**: `HpTracker.jsx`'s bar-rendering, click-to-edit-number, and reset-on-conversation-switch logic is close to 1:1 what SP needs. Rather than duplicating that in a new `SpTracker.jsx`, the plan extracts a shared presentational component parameterized by label, color mode (wound-state-driven vs. always-neutral), and save function — see [plan-character-sp.md](plan-character-sp.md).

## Open Questions
None currently.
