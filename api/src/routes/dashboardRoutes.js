const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../modules/dashboardDatabase");
const { migrate } = require("../migrations");
const { pool } = require("../db");
const { createSession, destroySession, requireUser, requireAdmin, isLocked, recordFailure, clearFailures } = require("../middleware/auth");
const { credentials, USERNAME, bad } = require("../middleware/validate");

const fail = (req, res, error, label) => {
  console.error(`[${req.id}] ${label}:`, error.message);
  res.status(500).json({ error: "Internal Server Error", requestId: req.id });
};

// Idempotent migration trigger kept for compatibility (REG-013), now admin-only.
// First-run bootstrap uses /auth/bootstrap and never depends on this route.
router.post("/initialize-db", requireAdmin, async (req, res) => {
  try {
    await migrate(pool);
    res.json({ message: "Database and credentials table are set up successfully" });
  } catch (e) { fail(req, res, e, "initialize-db"); }
});

router.get("/auth/bootstrap", async (req, res) => {
  try { res.json({ adminExists: await db.adminExists() }); } catch (e) { fail(req, res, e, "bootstrap-status"); }
});

// First-run only: creates the initial admin. Refuses once any account exists.
router.post("/auth/bootstrap", credentials(), async (req, res) => {
  try {
    const id = await db.createFirstAdmin(req.body.username, req.body.password);
    if (id === null) return bad(res, req, "An Admin account already exists");
    res.status(201).json({ message: "User created successfully", username: req.body.username, insertId: id });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return bad(res, req, "Username already exists");
    if (e.code === "ADMIN_OP_BUSY") return res.status(409).json({ error: "Concurrent bootstrap in progress; retry shortly", requestId: req.id });
    fail(req, res, e, "bootstrap");
  }
});

async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !USERNAME.test(username) || password.length > 128) {
    return bad(res, req, "username and password are required");
  }
  if (isLocked(username, req.ip)) return res.status(429).json({ error: "Too many failed attempts. Try again later.", requestId: req.id });
  try {
    const user = await db.getUserForLogin(username);
    // Compare against a dummy hash for unknown users so timing does not reveal existence.
    const ok = await bcrypt.compare(password, user ? user.password : "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Vv2l4M9bQ8l9yQ0yJ3Zr1x7sQJXkYa");
    if (!user || !ok) {
      recordFailure(username, req.ip);
      return res.status(401).json({ error: "Invalid credentials", requestId: req.id });
    }
    clearFailures(username, req.ip);
    const token = await createSession(user.id);
    res.json({ message: "Authentication successful", user: { id: user.id, username: user.username, role: user.role }, token });
  } catch (e) { fail(req, res, e, "login"); }
}
router.post("/auth/login", login);
router.post("/users/authenticate", login); // legacy path, now returns the same safe projection

router.post("/auth/logout", requireUser, async (req, res) => {
  try { await destroySession(req.sessionToken); res.json({ message: "Logged out" }); } catch (e) { fail(req, res, e, "logout"); }
});
router.get("/auth/session", requireUser, (req, res) => res.json({ user: req.user }));

router.get("/users", requireAdmin, async (req, res) => {
  try { res.json(await db.getUsers()); } catch (e) { fail(req, res, e, "list-users"); }
});

router.get("/users/:id", requireAdmin, async (req, res) => {
  if (!/^\d{1,10}$/.test(req.params.id)) return bad(res, req, "id must be a positive integer");
  try {
    const user = await db.getUser(req.params.id);
    user ? res.json(user) : res.status(404).json({ error: "User not found", requestId: req.id });
  } catch (e) { fail(req, res, e, "get-user"); }
});

router.post("/users", requireAdmin, credentials({ needRole: true }), async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const [result] = await db.createUser(username, password, role);
    res.status(201).json({ message: "User created successfully", username, insertId: result.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return bad(res, req, "Username already exists");
    fail(req, res, e, "create-user");
  }
});

router.post("/users/:username/password", requireUser, async (req, res) => {
  const { newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) return bad(res, req, "newPassword must be 8-128 characters");
  if (req.user.role !== "admin" && req.user.username !== req.params.username) return res.status(403).json({ error: "Forbidden", requestId: req.id });
  try {
    const user = await db.getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: "User not found", requestId: req.id });
    await db.updateUserPassword(user.id, newPassword);
    res.json({ message: "Password updated successfully" });
  } catch (e) { fail(req, res, e, "update-password"); }
});

router.delete("/users/:username", requireAdmin, async (req, res) => {
  try {
    // Last-admin guard + session revocation run atomically in dashboardDatabase.
    const result = await db.deleteUserGuarded(req.params.username);
    if (result.lastAdmin) return bad(res, req, "Cannot delete the last admin");
    result.affectedRows === 0 ? res.status(404).json({ error: "User not found", requestId: req.id }) : res.json({ message: "User deleted successfully" });
  } catch (e) {
    if (e.code === "ADMIN_OP_BUSY") return res.status(409).json({ error: "Concurrent user operation; retry shortly", requestId: req.id });
    fail(req, res, e, "delete-user");
  }
});

module.exports = router;
