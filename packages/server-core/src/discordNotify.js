const SNIPPET_MAX = 150;

function truncate(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed.length > SNIPPET_MAX ? `${trimmed.slice(0, SNIPPET_MAX)}…` : trimmed;
}

function formatSenderLabel(sender, authorUsername) {
  return sender && sender !== authorUsername ? `${sender} (${authorUsername})` : (sender ?? authorUsername);
}

export function formatPlayerMessage(sender, authorUsername, conversationName, content) {
  return `💬 **${formatSenderLabel(sender, authorUsername)}** in *${conversationName}*: "${truncate(content)}"`;
}

export function formatDmReply(conversationName, content) {
  return `🎲 **The DM** replied in *${conversationName}*: "${truncate(content)}"`;
}

export function formatNewChapter(storyName, introContent) {
  return `📖 A new chapter began in *${storyName}*: "${truncate(introContent)}"`;
}

// Takes the app's own users list, getSettings, display label, and app URL
// rather than importing any of them directly, since which players/webhooks
// exist and what URL to link back to are per-app configuration, not shared
// logic. appLabel is tagged onto every message so a player who's in both
// games' Discord channels (or one channel used for both) can tell which app
// a ping came from.
export function createDiscordNotifier({ users, getSettings, appLabel, appUrl }) {
  // Fire-and-forget by design: NEVER throws, NEVER produces an unhandled
  // rejection, and callers must never `await` this before responding to the
  // client. Fails CLOSED — if the settings lookup itself errors, the
  // notification is silently skipped rather than risking an unexpected send.
  return async function notifyOtherPlayer({ actorUsername, message }) {
    try {
      const settings = await getSettings();
      if (!settings.discordNotificationsEnabled) return;

      const recipient = users.find((u) => u.username !== actorUsername);
      if (!recipient?.discordWebhookUrl) return;

      const mention = recipient.discordUserId ? `<@${recipient.discordUserId}> ` : "";
      fetch(recipient.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `${mention}**[${appLabel}]** ${message}\n${appUrl}` }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => console.error("[discordNotify] webhook POST failed:", err));
    } catch (err) {
      console.error("[discordNotify] unexpected error:", err);
    }
  };
}
