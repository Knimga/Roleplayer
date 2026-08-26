import { findUserByUsername } from "./users.js";

const SESSION_COOKIE = "session";

// Server-side enforcement boundary: every non-auth route must sit behind this.
// A request with no/invalid signed session cookie is rejected here, regardless
// of what the client UI does or doesn't show.
export function requireAuth(req, res, next) {
  const username = req.signedCookies?.[SESSION_COOKIE];
  if (!username) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = findUserByUsername(username);
  req.user = { username, isAdmin: !!user?.isAdmin };
  next();
}

export { SESSION_COOKIE };
