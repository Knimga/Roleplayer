const API_BASE = "/api/settings";

async function parseErrorOr(res, fallback) {
  if (res.ok) return null;
  const { error } = await res.json().catch(() => ({ error: fallback }));
  return error ?? fallback;
}

export async function getSettings() {
  const res = await fetch(API_BASE, { credentials: "include" });
  const error = await parseErrorOr(res, "Failed to load settings");
  if (error) throw new Error(error);
  return res.json();
}

export async function updateSettings(discordNotificationsEnabled) {
  const res = await fetch(API_BASE, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ discordNotificationsEnabled }),
  });
  const error = await parseErrorOr(res, "Failed to update settings");
  if (error) throw new Error(error);
  return res.json();
}
