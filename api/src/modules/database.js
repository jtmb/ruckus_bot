// database.js
const mysql = require("mysql2");
const bcrypt = require('bcrypt');

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}).promise();

async function getUsers() {
    const [rows] = await pool.query("SELECT id, username, role FROM credentials"); // Select only id, username, and role
    return rows;
}

async function getUser(id) {
    const [rows] = await pool.query(`
    SELECT id, username, role FROM credentials
    WHERE id = ? 
    `, [id]);
    return rows[0];
}

async function createUser(username, password, role) {
    // Hash the password before storing it in the database
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(`
    INSERT INTO credentials (username, password, role)
    VALUES (?, ?, ?)
    `, [username, hashedPassword, role]);
    return result;
}

async function updateUserPassword(id, newPassword) {
    const result = await pool.query(`
    UPDATE credentials
    SET password = ?
    WHERE id = ?
    `, [newPassword, id]);
    return result;
}
async function getUserByUsername(username) {
    const [rows] = await pool.query(`
    SELECT id, username, password, role FROM credentials
    WHERE username = ? 
    `, [username]);
    return rows[0];
}

module.exports = { getUsers, getUser, createUser, updateUserPassword, getUserByUsername };