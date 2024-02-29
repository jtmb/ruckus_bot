// botDatabase.js
const mysql = require("mysql2");

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}).promise();

// Function to get a log by ID
async function getLogById(id) {
    const [rows] = await pool.query("SELECT * FROM bot_logs WHERE id = ?", [id]);
    return rows[0];
}

// Function to insert a new log
async function insertLog(event_type, event_data, timestamp) {
    const [result] = await pool.query("INSERT INTO bot_logs (event_type, event_data, timestamp) VALUES (?, ?, ?)", [event_type, event_data, timestamp]);
    return result;
}

// Function to update a log by ID
async function updateLogById(id, event_type, event_data, timestamp) {
    const [result] = await pool.query("UPDATE bot_logs SET event_type = ?, event_data = ?, timestamp = ? WHERE id = ?", [event_type, event_data, timestamp, id]);
    return result;
}

// Function to delete a log by ID
async function deleteLogById(id) {
    const [result] = await pool.query("DELETE FROM bot_logs WHERE id = ?", [id]);
    return result;
}

// Function to get all logs
async function getAllLogs() {
    const [rows] = await pool.query("SELECT * FROM bot_logs");
    return rows;
}

// Function to get bot login logs
async function getBotLoginLogs() {
    const [rows] = await pool.query("SELECT * FROM bot_logs WHERE event_type = 'bot_login'");
    return rows;
}

// Function to get user interaction logs
async function getUserInteractionLogs() {
    const [rows] = await pool.query("SELECT * FROM bot_logs WHERE event_type = 'user_interaction'");
    return rows;
}

// Export the functions
module.exports = { getAllLogs, getLogById, insertLog, updateLogById, deleteLogById, getBotLoginLogs, getUserInteractionLogs };
