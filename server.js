require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = (() => {
  // tiny built-in id generator so we don't need an extra dependency
  const crypto = require("crypto");
  return { v4: () => crypto.randomUUID() };
})();

const db = require("./src/db");
const { signToken, authenticateToken } = require("./src/auth");
const { sendStressAlert } = require("./src/sms");

const app = express();
const PORT = process.env.PORT || 3000;

// Stress level (0-10) at which MindPlay sends the first early-warning SMS.
// Project brief: catch it early, around level 5-6, not only at extreme stress.
const ALERT_THRESHOLD = Number(process.env.ALERT_THRESHOLD || 5);
// Minimum time between two SMS alerts for the same user (avoid spamming), in ms.
const ALERT_COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MINUTES || 5) * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

app.post("/api/signup", async (req, res) => {
  const { name, email, password, phone } = req.body || {};

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: "Name, email, phone and password are all required." });
  }
  if (db.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }
  if (!/^\+?[0-9]{7,15}$/.test(phone.replace(/[\s-]/g, ""))) {
    return res.status(400).json({
      error: "Phone number looks invalid. Use full international format, e.g. +923001234567.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    name,
    email,
    phone: phone.replace(/[\s-]/g, ""),
    passwordHash,
    lastAlertAt: null,
    createdAt: new Date().toISOString(),
  };
  db.createUser(user);

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.findUserByEmail(email || "");
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ---------------------------------------------------------------------------
// Stress tracking
// ---------------------------------------------------------------------------

// Called every few seconds by the dashboard while the webcam is running.
app.post("/api/stress", authenticateToken, async (req, res) => {
  const { level, emotions } = req.body || {};

  if (typeof level !== "number" || level < 0 || level > 10) {
    return res.status(400).json({ error: "level must be a number between 0 and 10." });
  }

  const entry = {
    id: uuidv4(),
    userId: req.user.id,
    level,
    emotions: emotions || null,
    timestamp: new Date().toISOString(),
  };
  db.addLog(entry);

  // Decide whether this crossing deserves an SMS.
  let alert = { sent: false };
  if (level >= ALERT_THRESHOLD) {
    const user = db.findUserById(req.user.id);
    const last = user.lastAlertAt ? new Date(user.lastAlertAt).getTime() : 0;
    const now = Date.now();

    if (now - last >= ALERT_COOLDOWN_MS) {
      const result = await sendStressAlert(user.phone, level);
      if (result.sent) {
        db.updateUser(user.id, { lastAlertAt: new Date().toISOString() });
      }
      alert = { sent: result.sent, reason: result.reason || null };
    }
  }

  res.json({ ok: true, entry, alert });
});

app.get("/api/stress/history", authenticateToken, (req, res) => {
  const logs = db.getLogsForUser(req.user.id, 300);
  res.json({ logs });
});

app.get("/api/me", authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone });
});

app.listen(PORT, () => {
  console.log(`MindPlay server running at http://localhost:${PORT}`);
  console.log(`Alert threshold: level >= ${ALERT_THRESHOLD}/10, cooldown ${ALERT_COOLDOWN_MS / 60000} min`);
});
