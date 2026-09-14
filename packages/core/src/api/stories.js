const API_BASE = "/api/stories";

async function parseErrorOr(res, fallback) {
  if (res.ok) return null;
  const { error } = await res.json().catch(() => ({ error: fallback }));
  return error ?? fallback;
}

async function postJson(url, body, fallback) {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const error = await parseErrorOr(res, fallback);
  if (error) throw new Error(error);
  return res.json();
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

// Generates a fresh Blueprint draft - NOT persisted. See approveBlueprint.
export function generateBlueprint(storyId, campaignInput) {
  return postJson(`${API_BASE}/${storyId}/blueprint/generate`, { campaignInput }, "Failed to generate Blueprint");
}

// Persists the (possibly admin-edited) draft and seeds the Situation from
// its openingSituation. Returns { blueprint, situation }.
export function approveBlueprint(storyId, blueprint) {
  return postJson(`${API_BASE}/${storyId}/blueprint/approve`, blueprint, "Failed to create Blueprint");
}

// Read-only fetch for the admin tabs. Returns { blueprint, situation }.
export async function getBlueprint(storyId) {
  const res = await fetch(`${API_BASE}/${storyId}/blueprint`, { credentials: "include" });
  const error = await parseErrorOr(res, "Failed to load Blueprint");
  if (error) throw new Error(error);
  return res.json();
}

// Admin edit of the Situation's rewritable fields. Returns { situation }.
export async function updateSituation(storyId, fields) {
  const res = await fetch(`${API_BASE}/${storyId}/situation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(fields),
  });
  const error = await parseErrorOr(res, "Failed to update Situation");
  if (error) throw new Error(error);
  return res.json();
}

// Manual admin override for the Milestones tab - one milestone forward or
// back. Both return the updated { situation }.
export function advanceMilestone(storyId) {
  return postJson(`${API_BASE}/${storyId}/blueprint/milestones/advance`, undefined, "Failed to advance milestone");
}

export function revertMilestone(storyId) {
  return postJson(`${API_BASE}/${storyId}/blueprint/milestones/revert`, undefined, "Failed to revert milestone");
}
