# Campaign Tracker Update Procedure (MCP Doc)

This document is consulted by the tracker-update pass once it has
already decided *that* something needs to change (see the
tracker-update-pass system prompt for that decision). This document
governs *how* to fill in the resulting tool call.

## Beat Completion

- On advancing a beat: set the current active beat's `status` to
  `complete`, and set the next beat in sequence to `active`.
- Advance at most one beat per pass, even if the response's content
  would technically also satisfy a later beat's narrative — beats
  represent the story's intended pacing, not a checklist to clear as
  fast as the fiction allows.