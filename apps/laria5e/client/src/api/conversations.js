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
