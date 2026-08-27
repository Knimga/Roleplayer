# Spec: Admin Settings Modal

## Status
Implemented (local dev — Render deploy/migration still pending)

## Summary
A small admin-only "⚙️ Settings" row at the bottom of the sidebar opens a modal holding app-wide settings — starting with a single master on/off toggle for Discord notifications (see [discord-notifications.md](../chat/discord-notifications.md)). Designed as the first thing to live in what will eventually become a general admin panel (e.g. Claude API usage info), but nothing beyond the one toggle is being built now — no placeholder rows for future content.

## Requirements
- [x] A "⚙️ Settings" row appears at the bottom of the sidebar, below the conversation list, visible only to the admin
- [x] Clicking it opens a modal titled "Settings"
- [x] The modal shows one row: "Discord Notifications" with an on/off toggle reflecting the current persisted state
- [x] Clicking the toggle flips it and persists the new value immediately (no separate Save step)
- [x] The modal closes via a "Close" button or clicking outside it, same convention as every other modal in this app
- [x] Both the settings API and the modal are inaccessible to the non-admin user (403 server-side; the row itself isn't rendered client-side)
- [x] The toggle's state persists in Postgres — survives a server restart or redeploy, unlike an in-memory flag or something requiring an env var change

## Decisions
- **Global toggle, not per-user.** Only the admin can reach this modal at all, so a single switch controlling the whole notification feature is simpler than per-user switches — asked directly and confirmed. A recipient with no Discord webhook URL configured (see [discord-notifications.md](../chat/discord-notifications.md)) still gets nothing regardless of this switch; it's an additional gate, not a replacement for per-user config.
- **Persisted in Postgres, not an env var.** The whole point is a *live*, in-app-toggleable switch — an env var would need a Render redeploy to change, defeating the purpose. In-memory state was also rejected: Render's free tier can restart/spin down, which would silently reset an in-memory flag back to some default without the admin noticing.
- **A new single-row `app_settings` table, not a generic key-value settings store.** Deliberately the simplest thing that solves the concrete need now — a plain typed boolean column, matching this project's existing pattern of explicit typed jsonb/boolean columns (`character_hp`, `character_ready`, etc.) rather than a schema-less KV table designed for hypothetical future settings whose shape isn't known yet. If/when a second real setting is needed, that's the time to extend the table — not now.
- **Sidebar (left), not the right panel.** The request said "conversations column on the right," which doesn't match this app's actual layout (the conversation list is the *left* sidebar; the right column is the character/Party/Dice Roller panel) — confirmed directly that the sidebar was meant.
- **Reuses the "Mark Ready" toggle's visual language**, not a new toggle-switch component: `.ready-toggle`/`.ready-dot`/`.ready-label` (see [ready-for-dm.md](../chat/ready-for-dm.md)) already implement exactly this on/off button pattern with an active-state glow. The Settings modal's toggle is styled identically, just relabeled "On"/"Off" instead of "Mark Ready"/"Ready for DM".
- **Self-contained modal, no App.jsx state.** `SettingsModal.jsx` fetches its own state on mount and updates it locally after each toggle, the same pattern `NewChapterModal.jsx` already uses — no global settings state needs to live in `App.jsx`, since nothing else in the app currently reads this value client-side.

## Open Questions
None currently.
