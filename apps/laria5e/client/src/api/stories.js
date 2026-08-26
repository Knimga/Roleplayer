const API_BASE = "/api/stories";

async function parseErrorOr(res, fallback) {
  if (res.ok) return null;
  const { error } = await res.json().catch(() => ({ error: fallback }));
  return error ?? fallback;
}

export async function renameStory(storyId, name) {
  const res = await fetch(`${API_BASE}/${storyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  const error = await parseErrorOr(res, "Failed to rename story");
  if (error) throw new Error(error);
  return res.json();
}
