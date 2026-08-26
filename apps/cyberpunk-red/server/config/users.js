// Two fixed user slots, sourced from environment variables — see
// server/.env.example for the full list. No hardcoded fallback: a missing
// var should fail loudly rather than silently degrade auth in production.
export const users = [
  {
    code: process.env.USER_A_CODE,
    username: process.env.USER_A_USERNAME,
    isAdmin: process.env.USER_A_ADMIN === "true",
    discordWebhookUrl: process.env.USER_A_DISCORD_WEBHOOK_URL || null,
    discordUserId: process.env.USER_A_DISCORD_USER_ID || null,
  },
  {
    code: process.env.USER_B_CODE,
    username: process.env.USER_B_USERNAME,
    isAdmin: process.env.USER_B_ADMIN === "true",
    discordWebhookUrl: process.env.USER_B_DISCORD_WEBHOOK_URL || null,
    discordUserId: process.env.USER_B_DISCORD_USER_ID || null,
  },
];

export function findUserByCode(code) {
  return users.find((u) => u.code === code) ?? null;
}

export function findUserByUsername(username) {
  return users.find((u) => u.username === username) ?? null;
}

export const SESSION_SECRET = process.env.SESSION_SECRET;
