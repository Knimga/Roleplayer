export * from "@roleplayer/core/api/conversations.js";
import { API_BASE, parseErrorOr } from "@roleplayer/core/api/conversations.js";

export async function saveCharacterAc(conversationId, ac) {
  const res = await fetch(`${API_BASE}/${conversationId}/ac`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ac }),
  });
  const error = await parseErrorOr(res, "Failed to save AC");
  if (error) throw new Error(error);
  return res.json();
}

// Partial body, like saveCharacterHp: { current } and/or { max }.
export async function saveCharacterMp(conversationId, mp) {
  const res = await fetch(`${API_BASE}/${conversationId}/mp`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(mp),
  });
  const error = await parseErrorOr(res, "Failed to save MP");
  if (error) throw new Error(error);
  return res.json();
}

// Replaces the caller's whole spell list (specs/laria5e/character-spells.md).
// The server validates every field and returns { characterSpells }.
export async function saveCharacterSpells(conversationId, spells) {
  const res = await fetch(`${API_BASE}/${conversationId}/spells`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ spells }),
  });
  const error = await parseErrorOr(res, "Failed to save spells");
  if (error) throw new Error(error);
  return res.json();
}

// Casts outside a fight: posts the CAST: message to the chapter and deducts
// the MP. During a fight use castCombatSpell (@roleplayer/core/api/combats.js)
// instead - this one returns 409 then. Resolves to { characterMp }.
export async function castSpell(conversationId, spellId) {
  const res = await fetch(`${API_BASE}/${conversationId}/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ spellId }),
  });
  const error = await parseErrorOr(res, "Failed to cast");
  if (error) throw new Error(error);
  return res.json();
}
