export * from "@roleplayer/core/api/conversations.js";
import { API_BASE, parseErrorOr } from "@roleplayer/core/api/conversations.js";

// Resolves to { characterInitiative }.
export async function saveCharacterInitiative(conversationId, initiative) {
  const res = await fetch(`${API_BASE}/${conversationId}/initiative`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ initiative }),
  });
  const error = await parseErrorOr(res, "Failed to save initiative");
  if (error) throw new Error(error);
  return res.json();
}

export async function saveCharacterSp(conversationId, sp) {
  const res = await fetch(`${API_BASE}/${conversationId}/sp`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(sp),
  });
  const error = await parseErrorOr(res, "Failed to save SP");
  if (error) throw new Error(error);
  return res.json();
}
