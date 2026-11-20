// Bot log queries. Every list is ordered newest-first with a stable tie-break.
const { pool } = require("../db");

const ORDER = "ORDER BY timestamp DESC, id DESC";

async function getLogById(id) {
  const [rows] = await pool.query("SELECT * FROM bot_logs WHERE id = ?", [id]);
  return rows[0];
}
async function insertLog(event_type, event_data, timestamp) {
  const [result] = await pool.query("INSERT INTO bot_logs (event_type, event_data, timestamp) VALUES (?, ?, COALESCE(?, NOW()))", [event_type, event_data, timestamp || null]);
  return result;
}
async function updateLogById(id, event_type, event_data, timestamp) {
  const [result] = await pool.query("UPDATE bot_logs SET event_type = ?, event_data = ?, timestamp = COALESCE(?, timestamp) WHERE id = ?", [event_type, event_data, timestamp || null, id]);
  return result;
}
async function deleteLogById(id) {
  const [result] = await pool.query("DELETE FROM bot_logs WHERE id = ?", [id]);
  return result;
}
async function getAllLogs(offset, limit) {
  const [rows] = await pool.query(`SELECT * FROM bot_logs ${ORDER} LIMIT ? OFFSET ?`, [limit, offset]);
  return rows;
}
async function getBotLoginLogs(offset, limit) {
  const [rows] = await pool.query(`SELECT * FROM bot_logs WHERE event_type = 'bot_login' ${ORDER} LIMIT ? OFFSET ?`, [limit, offset]);
  return rows;
}
async function getUserInteractionLogs(offset, limit) {
  const [rows] = await pool.query(`SELECT * FROM bot_logs WHERE event_type = 'user_interaction' ${ORDER} LIMIT ? OFFSET ?`, [limit, offset]);
  return rows;
}
async function getTotalLogsCountFromDatabase() {
  const [r] = await pool.query("SELECT COUNT(*) AS total FROM bot_logs");
  return r[0].total;
}
async function getTotalLoginLogsCountFromDatabase() {
  const [r] = await pool.query("SELECT COUNT(*) AS total FROM bot_logs WHERE event_type = 'bot_login'");
  return r[0].total;
}
async function getTotalInteractionLogsCount() {
  const [r] = await pool.query("SELECT COUNT(*) AS total FROM bot_logs WHERE event_type = 'user_interaction'");
  return r[0].total;
}
async function pruneLogs(days) {
  const [r] = await pool.query("DELETE FROM bot_logs WHERE timestamp < (NOW() - INTERVAL ? DAY)", [days]);
  return r.affectedRows;
}
async function getHeartbeat() {
  const [rows] = await pool.query("SELECT bot_id, bot_name, guilds, started_at, updated_at, TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS age_seconds FROM bot_heartbeat WHERE id = 1");
  return rows[0];
}

module.exports = { getAllLogs, getLogById, insertLog, updateLogById, deleteLogById, getBotLoginLogs, getUserInteractionLogs, getTotalLogsCountFromDatabase, getTotalLoginLogsCountFromDatabase, getTotalInteractionLogsCount, pruneLogs, getHeartbeat };
