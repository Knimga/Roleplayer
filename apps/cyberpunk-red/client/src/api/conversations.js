export * from "@roleplayer/core/api/conversations.js";
import { API_BASE, parseErrorOr } from "@roleplayer/core/api/conversations.js";

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
