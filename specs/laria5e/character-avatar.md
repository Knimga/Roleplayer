# Spec: Character Avatar

## Status
Planned

## Summary
Extends Main Story's character identity block in the right panel: each player can upload a portrait image for their character, shown in a fixed-size frame beneath the character name header. Unlike the character name, role, and level — locked forever at creation — the avatar is optional at creation time and replaceable at any time afterward.

## Requirements
- [ ] In a Main Story conversation's right panel, a 250px × 300px frame appears below the name-header-and-Role/Level grouping, separated from it by an `<hr>`
- [ ] No avatar is required when creating a Main Story
- [ ] When no image has been uploaded, the frame is blank with an "upload image" symbol centered in it
- [ ] Clicking the frame (whether empty or already showing an image) opens a file picker; selecting an image uploads it and replaces whatever the frame currently shows
- [ ] The uploaded image can be of any dimensions — it is scaled so its width fills the frame exactly, centered vertically, and any resulting overflow (top/bottom) is clipped; the frame itself never resizes to fit the image
- [ ] Hovering the frame shows a subtle, transparent light-gray highlight, whether the frame is blank or already showing an image
- [ ] The avatar is associated with that specific Main Story and that specific player only — persists and reappears whenever that user reopens that conversation, from any other conversation
- [ ] The frame/avatar is absent for non-Main-Story conversations, same as the rest of the character-identity block

## Decisions
- **Storage**: a new `avatar_images` jsonb column on `conversations`, shaped `{ "<username>": "<data URL>" }` — same per-username map convention as `character_names`/`character_details`, but mutable (a key can be set, then overwritten, unlike the locked-forever fields). Images are stored as base64 data URLs directly in Postgres rather than on disk, because Render's Web Service filesystem is not guaranteed to survive a redeploy (see [render-hosting.md](../deployment/render-hosting.md)) and this app has no object-storage service configured; Postgres is already the durable store for everything else.
- **Size/type limits**: max 3MB per uploaded file, restricted to PNG/JPEG/GIF/WEBP. Enforced both client-side (immediate feedback, avoids uploading something that will be rejected) and server-side (authoritative — re-checked on the actual request body regardless of what the client claims), per this project's established server-side-enforcement pattern.
- **Upload is a separate endpoint from creation**, since an avatar can be uploaded or replaced at any time, not just at Main Story creation (unlike name/role/level, which are set once in the creation form and never touched again).
- **Who can upload for whom**: a user can only set their own avatar (keyed by their own username in `avatar_images`) — there's no concept of uploading a portrait on behalf of the other player, or an admin override, since this is purely self-directed character customization.
- **Placement within the identity block**: name header → Role/Level caption → `<hr>` → avatar frame → `<hr>` → dice roller. Name+Role/Level is its own small component (tightly grouped, no separator between them); a dedicated `<hr>` then separates it from the avatar frame, and the existing `<hr>` still marks the boundary between the whole identity block and the dice roller below. Revised from an earlier name→avatar→Role/Level ordering after the user asked to keep Role/Level directly under the name as one grouped unit.
- **Sizing behavior**: the image's width is scaled to exactly fill the frame's width (`width: 100%`, `height: auto`, preserving aspect ratio) and is vertically centered, with the frame's `overflow: hidden` clipping anything taller than the frame. Revised from an earlier no-scaling/natural-size approach after the user asked for width-fit-with-vertical-centering instead — a portrait-style photo now reliably fills the frame's width rather than potentially appearing as a small centered dot.
- **Hover feedback**: `.avatar-frame:hover` gets a subtle `rgba(255, 255, 255, 0.08)` background (up from the frame's resting `rgba(255, 255, 255, 0.03)`) — signals it's clickable, in both the blank and image-loaded states.
- **No live sync**: uploading doesn't push over SSE to the other player's open session — it's picked up the next time either user's client refetches the conversation list (same as a rename), consistent with how character name/role/level already only need to be correct "whenever I re-enter the Story."

## Open Questions
None currently.
