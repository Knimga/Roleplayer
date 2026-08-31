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

// Generates a fresh Campaign Bible draft - NOT persisted. See approveCampaignBible.
export async function generateCampaignBible(storyId, campaignInput) {
  const res = await fetch(`${API_BASE}/${storyId}/campaign-bible/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ campaignInput }),
  });
  const error = await parseErrorOr(res, "Failed to generate Campaign Bible");
  if (error) throw new Error(error);
  return res.json();
}

// Persists the (possibly admin-edited) generated draft and initializes both trackers.
export async function approveCampaignBible(storyId, bible) {
  const res = await fetch(`${API_BASE}/${storyId}/campaign-bible/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(bible),
  });
  const error = await parseErrorOr(res, "Failed to create Campaign Bible");
  if (error) throw new Error(error);
  return res.json();
}

// Read-only fetch for the viewing tabs (Bible Text, Beats).
export async function getCampaignBible(storyId) {
  const res = await fetch(`${API_BASE}/${storyId}/campaign-bible`, { credentials: "include" });
  const error = await parseErrorOr(res, "Failed to load Campaign Bible");
  if (error) throw new Error(error);
  return res.json();
}
