import { Router } from "express";
import { findUserByCode, findUserByUsername, users } from "./users.js";
import { SESSION_COOKIE, requireAuth } from "./requireAuth.js";

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

router.post("/login", (req, res) => {
  const { code } = req.body ?? {};
  const user = findUserByCode(code);

  if (!user) {
    return res.status(401).json({ error: "Invalid code" });
  }

  res.cookie(SESSION_COOKIE, user.username, COOKIE_OPTIONS);
  res.json({ username: user.username, isAdmin: !!user.isAdmin });
});

router.get("/me", (req, res) => {
  const username = req.signedCookies?.[SESSION_COOKIE];
  if (!username) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = findUserByUsername(username);
  res.json({ username, isAdmin: !!user?.isAdmin });
});

// Feeds the New Story character-name modal, which needs to label a field
// for each of the two players — the client otherwise only knows its own
// logged-in username via /me.
router.get("/users", requireAuth, (req, res) => {
  res.json(users.map((u) => ({ username: u.username })));
});

export default router;
