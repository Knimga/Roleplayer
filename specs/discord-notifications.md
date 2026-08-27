# Spec: Discord Cross-Notification

## Status
Implemented (local dev — real Discord webhook/user-ID values and the Render migration still pending)

## Summary
The two players are long-distance friends playing async across far-apart timezones, with no push signal today beyond opening the app. Whenever one player causes a new-message event (a chat message, a dice roll, a DM reply, or a new chapter starting), the *other* player's own Discord webhook gets a short ping — a content snippet, the story/conversation name, an `@`-mention, and a link back to the app — so they know to check in. Gated by a master on/off toggle in the admin Settings modal (see [admin-settings.md](admin-settings.md)).

## Requirements
- [x] A player's chat message, dice roll, the DM's reply, or a new chapter starting notifies the *other* player's Discord webhook — never the actor's own
- [x] The notification is skipped entirely (no error, no crash) if: the master toggle is off, the recipient has no webhook URL configured, or the webhook POST itself fails
- [x] The notification content includes a short snippet of the triggering content, the story/conversation name, and an `@`-mention of the recipient (when their Discord user ID is configured)
- [x] Every notification includes a link to `https://cyberpunk-red-rp.onrender.com/`
- [x] A new chapter produces exactly one notification (not one for the recap and a second for the intro)
- [x] Notifying Discord never delays or blocks the HTTP response to the player who triggered the event
- [x] The feature works correctly with zero, one, or two players' Discord credentials configured (only Evan's are available today; Nick's are not yet set up)
- [x] Discord webhook URLs and Discord user IDs are never committed to the repo — env vars only (`server/.env` locally, Render dashboard in prod), following this app's existing flat `USER_A_*`/`USER_B_*` convention

## Decisions
- **Trigger scope: any new-message event the recipient didn't cause** — a partner's chat message/dice roll, a DM reply (after either player asks), or a new chapter starting. Explicitly NOT included: typing-indicator pings or ready-toggle changes (see [typing-indicator.md](typing-indicator.md), [ready-for-dm.md](ready-for-dm.md)) — those are already low-latency, high-frequency, in-app-only signals; notifying Discord on every keystroke-adjacent event would be spammy and defeats the "check in when something real happened" purpose.
- **One webhook URL + one Discord user ID per player**, both from env vars (`USER_A_DISCORD_WEBHOOK_URL`, `USER_A_DISCORD_USER_ID`, and `_B_` equivalents) — mirrors the existing `USER_A_CODE`/`USER_B_CODE` flat-var convention rather than introducing a new JSON-blob or DB-stored credential shape. The app calls only the *other* person's webhook, resolved by excluding the acting user's own username from the two-entry `users` array.
- **Message content**: a short truncated snippet (150 chars) of the actual content + the story/conversation name, prefixed with `<@discordUserId>` so Discord actually pings/highlights the recipient even in a muted or shared channel — a plain mention-less message could go unnoticed indefinitely, defeating the purpose.
- **App link is always the root URL** (`https://cyberpunk-red-rp.onrender.com/`), never a deep link to a specific chapter. Accepted limitation: `App.jsx`'s `selectedConversationId` is pure React state with no URL sync, so there is no route to link to. Not building URL-based routing just for this — out of scope.
- **Fire-and-forget, fails closed.** `notifyOtherPlayer` never throws and is never `await`ed by its callers before responding to the client — matches this app's existing `sendTypingPing`-style pattern (outer `try/catch` around all synchronous logic, plus a `.catch()`-only handler on the webhook `fetch` that only logs). If the settings lookup itself errors, the notification is silently skipped rather than risking an unexpected send or a hung request.
- **Explicitly out of scope**: de-duplication/debouncing of rapid-fire events, retry-on-failure logic, entering Discord credentials through the UI (env vars only, admin edits Render's dashboard directly), rich Discord embeds (plain `content` string is enough).
- **Master toggle and admin Settings modal live in [admin-settings.md](admin-settings.md)** — this spec covers the notification-triggering/formatting/hook-point logic only, not the toggle's own storage or UI.

## Open Questions
None currently. Nick's Discord webhook URL/user ID are not yet available — the feature is designed to degrade gracefully (silently no-op for his side) until they are.
