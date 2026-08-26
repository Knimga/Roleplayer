# Spec: Map

## Status
Implemented

## Summary
A third button in the same icon-button row as [character-description.md](character-description.md)'s Description/Weapons & Gear controls, labeled "Map" with a 🌐 emoji icon (see that spec's Decisions for the lucide-react → emoji reversal, which applied to all three buttons on this row identically). Clicking it opens a read-only modal displaying a static map image (`public/cyberpunk-red-map.jpg`), shown smaller than its native resolution and framed with a border. No data, no editing, no LLM involvement — a reference image, not character data.

## Requirements
- [x] A third icon button appears in the same row as Description/Weapons & Gear, styled identically (square icon button, small caption "Map" centered beneath)
- [x] Its icon is 🌐 (see [character-description.md](character-description.md)'s Decisions — this row briefly used Lucide's `earth` icon, then reverted to the mockup's literal emoji)
- [x] Clicking the button opens a modal showing `public/cyberpunk-red-map.jpg`
- [x] The image displays at roughly 80% of its native pixel size (native: 1024×1015) — its resolution doesn't hold up at full size, so it's shown smaller
- [x] The image has a visible gray border/frame within the modal
- [x] The modal closes via clicking outside it, same convention as every other modal in this app
- [x] It requires no backend changes, no new data, no LLM involvement

## Decisions
- **Reverses the earlier "disabled placeholder" decision.** The previous version of this spec deliberately kept Map inert, with an explicit note that any real functionality should update this spec rather than being bolted on elsewhere — this revision is exactly that: the image was added (`public/cyberpunk-red-map.jpg`) and its behavior specified directly, so `character-map.md` was updated in place rather than left as a stale placeholder doc alongside a separate "real" spec.
- **Static image, not interactive**: no pan/zoom/markers/click targets on the map itself — just a framed image in a modal, read exactly like the request described it. Anything richer (zoomable map, location pins) is a future feature, not assumed here.
- **80% sizing is a fixed display size, not a dynamic scale-to-fit.** The image is rendered at `width: 819px` (`1024 × 0.8`, rounded), `height: auto` — not e.g. `80vw` or scaled relative to the modal/viewport. The stated reason ("resolution is worse than its size") is about the source image's pixel density, a fixed property of that file, not about fitting arbitrary viewports — so a fixed pixel width is the correct read of the request, not a relative one. `max-width: 100%` is still applied as a safety net so it can't overflow a viewport narrower than the image on very small windows.
- **Border styling reuses the app's existing frame convention**: `1px solid var(--border, #444)` with `6px` border-radius — the same treatment `.avatar-frame` already uses — rather than introducing a new gray or a literal CSS `outline` (which behaves differently: doesn't affect box layout and is conventionally reserved for focus rings, not deliberate framing).
- **New `MapModal.jsx`, following the `PartyMemberModal.jsx` pattern**: a self-contained, read-only modal (image + implicit "click outside to close," no explicit action buttons needed beyond that, matching the minimalism of a pure image viewer). `RightPanel.jsx` now owns one small piece of state (`mapOpen`) to toggle it — the first state `RightPanel.jsx` itself has had to own, everything else so far being owned by child components.
- **No `<h2>Map</h2>` title inside the modal**: unlike every other modal in this app, the map image is self-explanatory (it's a labeled "NIGHT CITY 2045" map), so a redundant "Map" heading above it was removed — the button's own "Map" caption already identifies what opens it.
- **Modal width**: `.modal-panel` normally has a fixed `width` (360px, or 600px via `.wide`) — neither fits an 819px-wide image comfortably. Rather than adding another arbitrary fixed-width tier, `.modal-panel.map` sets `width: auto`, letting the panel hug the image's rendered width (plus padding), capped by the existing `max-width: 90vw`.

## Open Questions
None currently.
