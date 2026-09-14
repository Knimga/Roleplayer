import { API_BASE as CONVERSATIONS_BASE, parseErrorOr } from "./conversations.js";

const API_BASE = "/api/combats";

async function post(url, body, fallback) {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const error = await parseErrorOr(res, fallback);
  if (error) throw new Error(error);
  return res;
}

// The chapter's active combat, if any: { combat: { id, messages } | null }.
// Fetched alongside the chapter's messages on load; kept current afterwards
// by the combat-* SSE events on the chapter's own channel.
export async function getActiveCombat(conversationId) {
  const res = await fetch(`${CONVERSATIONS_BASE}/${conversationId}/combat`, { credentials: "include" });
  const error = await parseErrorOr(res, "Failed to load combat");
  if (error) throw new Error(error);
  return res.json();
}

export async function sendCombatMessage(combatId, content) {
  await post(`${API_BASE}/${combatId}/messages`, { content }, "Failed to send message");
}

export async function submitCombatRoll(combatId, payload) {
  await post(`${API_BASE}/${combatId}/roll`, payload, "Failed to roll");
}

// Mirrors editMessage/deleteMessage in api/conversations.js, scoped to one
// combat's own transcript - same lock rules (own message, until the combat
// DM has replied after it; admin can always delete the single most recent
// message, even the DM's, to retry).
export async function editCombatMessage(combatId, messageId, content) {
  const res = await fetch(`${API_BASE}/${combatId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  const error = await parseErrorOr(res, "Failed to edit message");
  if (error) throw new Error(error);
  return res.json();
}

export async function deleteCombatMessage(combatId, messageId) {
  const res = await fetch(`${API_BASE}/${combatId}/messages/${messageId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to delete message");
  if (error) throw new Error(error);
}

// Resolves on 202; the reply arrives over SSE as a combat-message event, or
// the fight ends with a combat-ended event.
export async function requestCombatReply(combatId) {
  await post(`${API_BASE}/${combatId}/respond`, undefined, "Failed to request combat DM reply");
}

// Admin-only manual overrides (specs/combat-encounters.md §5.1, §5.4).
export async function startCombat(conversationId) {
  const res = await post(`${CONVERSATIONS_BASE}/${conversationId}/combat/start`, undefined, "Failed to start combat");
  return res.json();
}

export async function endCombat(combatId) {
  const res = await post(`${API_BASE}/${combatId}/end`, undefined, "Failed to end combat");
  return res.json();
}
