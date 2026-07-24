// ---------------------------------------------------------------------------
// Tiny JSON-file database. No external DB required — good enough for a
// single-instance MindPlay deployment / local dev / demo.
// Data is kept in memory and flushed to data/db.json after every write.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let state = { users: [], logs: [] };

if (fs.existsSync(DB_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    console.error("Could not read data/db.json, starting with an empty database.", err);
  }
}

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function createUser(user) {
  state.users.push(user);
  persist();
  return user;
}

function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  return state.users.find((u) => u.email.toLowerCase() === normalized) || null;
}

function findUserById(id) {
  return state.users.find((u) => u.id === id) || null;
}

function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) return null;
  Object.assign(user, patch);
  persist();
  return user;
}

function addLog(entry) {
  state.logs.push(entry);
  // Keep the log file from growing forever.
  if (state.logs.length > 5000) {
    state.logs = state.logs.slice(-5000);
  }
  persist();
  return entry;
}

function getLogsForUser(userId, limit = 300) {
  return state.logs
    .filter((l) => l.userId === userId)
    .slice(-limit);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  addLog,
  getLogsForUser,
};
