export const API_BASE = "/api/conversations";

export async function parseErrorOr(res, fallback) {
  if (res.ok) return null;
  const { error } = await res.json().catch(() => ({ error: fallback }));
  return error ?? fallback;
}

export async function listConversations() {
  const res = await fetch(API_BASE, { credentials: "include" });
  const error = await parseErrorOr(res, "Failed to load conversations");
  if (error) throw new Error(error);
  return res.json();
}

export async function createConversation(content) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  const error = await parseErrorOr(res, "Failed to create conversation");
  if (error) throw new Error(error);
  return res.json();
}

export async function createStory(characterNames, characterDetails) {
  const res = await fetch(`${API_BASE}/story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ characterNames, characterDetails }),
  });
  const error = await parseErrorOr(res, "Failed to create story");
  if (error) throw new Error(error);
  return res.json();
}

export async function uploadAvatar(conversationId, dataUrl) {
  const res = await fetch(`${API_BASE}/${conversationId}/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ image: dataUrl }),
  });
  const error = await parseErrorOr(res, "Failed to upload avatar");
  if (error) throw new Error(error);
  return res.json();
}

export async function saveCharacterDescription(conversationId, description) {
  const res = await fetch(`${API_BASE}/${conversationId}/description`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ description }),
  });
  const error = await parseErrorOr(res, "Failed to save description");
  if (error) throw new Error(error);
  return res.json();
}

export async function saveCharacterGear(conversationId, gear) {
  const res = await fetch(`${API_BASE}/${conversationId}/gear`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ gear }),
  });
  const error = await parseErrorOr(res, "Failed to save Weapons & Gear");
  if (error) throw new Error(error);
  return res.json();
}

export async function saveCharacterHp(conversationId, hp) {
  const res = await fetch(`${API_BASE}/${conversationId}/hp`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(hp),
  });
  const error = await parseErrorOr(res, "Failed to save HP");
  if (error) throw new Error(error);
  return res.json();
}

export async function saveCharacterReady(conversationId, ready) {
  const res = await fetch(`${API_BASE}/${conversationId}/ready`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ready }),
  });
  const error = await parseErrorOr(res, "Failed to update ready status");
  if (error) throw new Error(error);
  return res.json();
}

export async function renameConversation(conversationId, name) {
  const res = await fetch(`${API_BASE}/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  const error = await parseErrorOr(res, "Failed to rename conversation");
  if (error) throw new Error(error);
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${API_BASE}/${conversationId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to delete conversation");
  if (error) throw new Error(error);
}

export async function getMessages(conversationId) {
  const res = await fetch(`${API_BASE}/${conversationId}/messages`, {
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to load messages");
  if (error) throw new Error(error);
  return res.json();
}

export async function sendMessage(conversationId, content) {
  const res = await fetch(`${API_BASE}/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  const error = await parseErrorOr(res, "Failed to send message");
  if (error) throw new Error(error);
}

export async function editMessage(conversationId, messageId, content) {
  const res = await fetch(`${API_BASE}/${conversationId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  const error = await parseErrorOr(res, "Failed to edit message");
  if (error) throw new Error(error);
  return res.json();
}

export async function deleteMessage(conversationId, messageId) {
  const res = await fetch(`${API_BASE}/${conversationId}/messages/${messageId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to delete message");
  if (error) throw new Error(error);
}

export async function submitRoll(conversationId, payload) {
  const res = await fetch(`${API_BASE}/${conversationId}/roll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const error = await parseErrorOr(res, "Failed to roll");
  if (error) throw new Error(error);
}

// Fire-and-forget — callers don't await or handle failures, a missed ping
// just means the other player's indicator doesn't refresh this once.
export async function sendTypingPing(conversationId) {
  await fetch(`${API_BASE}/${conversationId}/typing`, {
    method: "POST",
    credentials: "include",
  });
}

export async function requestReply(conversationId) {
  const res = await fetch(`${API_BASE}/${conversationId}/respond`, {
    method: "POST",
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to request DM reply");
  if (error) throw new Error(error);
}

export async function generateChapterSummary(conversationId) {
  const res = await fetch(`${API_BASE}/${conversationId}/summarize`, {
    method: "POST",
    credentials: "include",
  });
  const error = await parseErrorOr(res, "Failed to summarize chapter");
  if (error) throw new Error(error);
  return res.json();
}

export async function createNewChapter(conversationId, summary) {
  const res = await fetch(`${API_BASE}/${conversationId}/new-chapter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ summary }),
  });
  const error = await parseErrorOr(res, "Failed to create new chapter");
  if (error) throw new Error(error);
  return res.json();
}

export function subscribeToEvents(conversationId, onMessage) {
  const source = new EventSource(`${API_BASE}/${conversationId}/events`, {
    withCredentials: true,
  });
  source.onmessage = (event) => onMessage(JSON.parse(event.data));
  return () => source.close();
}
