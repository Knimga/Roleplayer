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
