const API_BASE = "/api/auth";

export async function login(code) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(error);
  }

  return res.json();
}

export async function me() {
  const res = await fetch(`${API_BASE}/me`, {
    credentials: "include",
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

export async function listUsers() {
  const res = await fetch(`${API_BASE}/users`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to load player roster");
  }

  return res.json();
}
