import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { SESSION_SECRET } from "./config/users.js";
import authRouter from "./routes/auth.js";
import conversationsRouter from "./routes/conversations.js";
import storiesRouter from "./routes/stories.js";
import settingsRouter from "./routes/settings.js";

// A missing var here wouldn't crash the app — e.g. cookie-parser silently
// accepts an undefined signing secret instead of throwing, which would
// degrade into forgeable session cookies rather than a visible failure.
// Fail loudly at startup instead of letting that happen quietly.
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "USER_A_CODE",
  "USER_A_USERNAME",
  "USER_A_ADMIN",
  "USER_B_CODE",
  "USER_B_USERNAME",
  "USER_B_ADMIN",
  "SESSION_SECRET",
];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../client/dist");

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// 5mb, not the 100kb default — a base64-encoded 3MB avatar image (the
// avatar upload route's own limit) comes in around 4MB over the wire.
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser(SESSION_SECRET));

app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/stories", storiesRouter);
app.use("/api/settings", settingsRouter);

// Serves the built frontend in production, where Express and the client are
// deployed as a single Render Web Service (same origin — no CORS needed for
// real traffic). Locally, client/dist doesn't exist unless someone runs
// `npm run build`; Vite's own dev server handles the frontend instead, via
// the /api proxy in client/vite.config.js.
app.use(express.static(CLIENT_DIST));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
