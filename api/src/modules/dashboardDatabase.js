// User/credential storage. Password hashes never leave this module except via getUserForLogin.
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const ROLES = ["admin", "user"];

// One MySQL advisory lock serialises every last-admin / bootstrap critical section across
// connections and processes. It is released in a finally block, so an error never leaves it held.
const CREDENTIAL_LOCK = "ruckus_credentials_admin";

// Acquires the credential lock or throws ADMIN_OP_BUSY. Input: a connection and optional wait.
// Output: an async release function. Side effects: one GET_LOCK on the connection.
async function acquireCredentialLock(conn, waitSeconds = 10) {
  const [rows] = await conn.query("SELECT GET_LOCK(?, ?) AS locked", [CREDENTIAL_LOCK, waitSeconds]);
  const locked = rows[0] && rows[0].locked;
  if (locked !== 1 && locked !== true) {
    const err = new Error("Credential store is busy; retry shortly");
    err.code = "ADMIN_OP_BUSY";
    throw err;
  }
  return async () => { await conn.query("SELECT RELEASE_LOCK(?)", [CREDENTIAL_LOCK]); };
}

async function getUsers(dbPool = pool) {
  const [rows] = await dbPool.query("SELECT id, username, role FROM credentials ORDER BY id");
  return rows;
}

async function getUser(id, dbPool = pool) {
  const [rows] = await dbPool.query("SELECT id, username, role FROM credentials WHERE id = ?", [id]);
  return rows[0];
}

async function createUser(username, password, role, dbPool = pool) {
  const hashed = await bcrypt.hash(password, 12);
  return dbPool.query("INSERT INTO credentials (username, password, role) VALUES (?, ?, ?)", [username, hashed, role]);
}

// Atomically creates the first account (an admin) only while zero accounts exist.
// The advisory lock stops concurrent first-run requests from both passing the check.
// Returns the new id, or null when bootstrap is already closed; never logs the password/hash.
async function createFirstAdmin(username, password, dbPool = pool) {
  const hashed = await bcrypt.hash(password, 12);
  const conn = await dbPool.getConnection();
  let release = null;
  let txStarted = false;
  try {
    release = await acquireCredentialLock(conn);
    await conn.beginTransaction();
    txStarted = true;
    const [rows] = await conn.query("SELECT COUNT(*) AS n FROM credentials");
    if (rows[0].n > 0) {
      await conn.rollback(); txStarted = false;
      return null; // bootstrap already complete
    }
    const [result] = await conn.query("INSERT INTO credentials (username, password, role) VALUES (?, ?, 'admin')", [username, hashed]);
    await conn.commit(); txStarted = false;
    return result.insertId;
  } catch (e) {
    if (txStarted) await conn.rollback();
    throw e;
  } finally {
    if (release) { try { await release(); } catch (_) { /* connection already gone */ } }
    conn.release();
  }
}

// Wire-compatible bootstrap gate for GET /auth/bootstrap: true once ANY account exists,
// so the create-account page is reachable only on first run (session contract §5).
async function adminExists(dbPool = pool) {
  const [rows] = await dbPool.query("SELECT COUNT(*) AS n FROM credentials");
  return rows[0].n > 0;
}

// Updates a password and revokes that user's sessions atomically (session contract §2.5).
// Input: user id and plaintext password (hashed here at cost 12). No credential is logged.
async function updateUserPassword(id, password, dbPool = pool) {
  const hashed = await bcrypt.hash(password, 12);
  const conn = await dbPool.getConnection();
  let txStarted = false;
  try {
    await conn.beginTransaction(); txStarted = true;
    await conn.query("UPDATE credentials SET password = ? WHERE id = ?", [hashed, id]);
    await conn.query("DELETE FROM sessions WHERE user_id = ?", [id]);
    await conn.commit(); txStarted = false;
  } catch (e) {
    if (txStarted) await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getUserForLogin(username, dbPool = pool) {
  const [rows] = await dbPool.query("SELECT id, username, password, role FROM credentials WHERE username = ?", [username]);
  return rows[0];
}

async function getUserByUsername(username, dbPool = pool) {
  const [rows] = await dbPool.query("SELECT id, username, role FROM credentials WHERE username = ?", [username]);
  return rows[0];
}

// Deletes a user and its sessions in one transaction, refusing to delete the last admin.
// The count and delete share the advisory lock so two concurrent deletes cannot both pass.
// Returns the DELETE result, {affectedRows:0} if absent, or {lastAdmin:true,...} if guarded.
async function deleteUserGuarded(username, dbPool = pool) {
  const conn = await dbPool.getConnection();
  let release = null;
  let txStarted = false;
  try {
    release = await acquireCredentialLock(conn);
    await conn.beginTransaction();
    txStarted = true;
    const [rows] = await conn.query("SELECT id, role FROM credentials WHERE username = ?", [username]);
    if (rows.length === 0) {
      await conn.rollback(); txStarted = false;
      return { affectedRows: 0 };
    }
    const target = rows[0];
    if (target.role === "admin") {
      const [admins] = await conn.query("SELECT COUNT(*) AS n FROM credentials WHERE role = 'admin'");
      if (admins[0].n <= 1) {
        await conn.rollback(); txStarted = false;
        return { lastAdmin: true, affectedRows: 0 };
      }
    }
    await conn.query("DELETE FROM sessions WHERE user_id = ?", [target.id]);
    const [result] = await conn.query("DELETE FROM credentials WHERE id = ?", [target.id]);
    await conn.commit(); txStarted = false;
    return result;
  } catch (e) {
    if (txStarted) await conn.rollback();
    throw e;
  } finally {
    if (release) { try { await release(); } catch (_) { /* connection already gone */ } }
    conn.release();
  }
}

// Legacy helper kept so existing callers keep working; routes use the atomic guarded variant.
async function deleteUserByUsername(username, dbPool = pool) {
  return deleteUserGuarded(username, dbPool);
}

async function countAdmins(dbPool = pool) {
  const [rows] = await dbPool.query("SELECT COUNT(*) AS n FROM credentials WHERE role = 'admin'");
  return rows[0].n;
}

module.exports = {
  ROLES, getUsers, getUser, createUser, createFirstAdmin, adminExists,
  updateUserPassword, getUserForLogin, getUserByUsername, deleteUserGuarded,
  deleteUserByUsername, countAdmins,
};
