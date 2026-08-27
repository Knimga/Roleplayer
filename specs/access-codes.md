# Spec: Access Codes

## Status
Implemented

## Summary
Two hardcoded access codes grant entry to the app — one per user. Each user slot has a fixed username (used to attribute messages in conversations), paired with its access code. No registration, no sessions beyond the code check.

## Requirements
- [x] App presents a code entry screen on load
- [x] Exactly two valid codes exist, each mapped to a username (e.g. code → "Alex", code → "Sam")
- [x] Valid code grants access, identifies which user slot is active, and attaches that user's username
- [x] Invalid code shows an error and does not proceed
- [x] Both users can be logged in simultaneously
- [x] Messages sent by a user are attributed to their username, not a generic "User A"/"User B" label
- [x] One user slot is flagged as admin in the config file; that flag is available on the authenticated session for gating admin-only actions elsewhere in the app

## Decisions
- For now (pre-Render deployment): codes and usernames are stored in a config file committed to the repo, not env vars. This file must be clearly marked with a comment noting it needs to move to Render environment variables before public deployment.
- Usernames are hard-coded in that config file (fixed, not user-editable)
- Session persists across page refresh (signed session cookie set on successful login)
- Exactly one user is flagged `isAdmin: true` in `server/config/users.js`, the other is not. This is general-purpose — not tied to any single feature — first consumer is conversation deletion ([conversation-management.md](conversation-management.md)), more admin-gated actions may use it later. Evan is the admin by default; trivial one-line change in the config file if that should be the other user instead.
- `requireAuth` already attaches `req.user`; it gains an `isAdmin` field read straight from the matched config record, so any route can check `req.user.isAdmin` without a separate lookup

## Open Questions
- Should the app show which user slot is taken vs. available?
