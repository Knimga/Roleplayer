// In-memory pub/sub keyed by conversation id. Fine at this scale (single
// server process, two users) — no Redis needed.
const subscribers = new Map(); // conversationId -> Set<res>

export function subscribe(conversationId, res) {
  if (!subscribers.has(conversationId)) {
    subscribers.set(conversationId, new Set());
  }
  subscribers.get(conversationId).add(res);

  res.on("close", () => {
    subscribers.get(conversationId)?.delete(res);
  });
}

export function publish(conversationId, message) {
  const conns = subscribers.get(conversationId);
  if (!conns) return;

  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const res of conns) {
    res.write(payload);
  }
}
