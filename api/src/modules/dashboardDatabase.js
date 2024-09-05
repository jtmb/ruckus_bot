// database.js
const mysql = require("mysql2");
const bcrypt = require('bcrypt');

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}).promise();


async function createDatabaseAndTable() {
    // Create the database if it doesn't exist
    await pool.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.MYSQL_DATABASE}\``);

    // Ensure the database is in use
    await pool.query(`USE \`${process.env.MYSQL_DATABASE}\``);

    // Create the credentials table if it doesn't exist
    await pool.query(`
        CREATE TABLE IF NOT EXISTS credentials (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL
        )
    `);

    return { message: 'Database and credentials table are set up successfully' };
}


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

async function deleteUserByUsername(username) {
    const result = await pool.query(`
    DELETE FROM credentials
    WHERE username = ?
    `, [username]);
    return result;
}

module.exports = { createDatabaseAndTable, getUsers, getUser, createUser, updateUserPassword, getUserByUsername, deleteUserByUsername };
