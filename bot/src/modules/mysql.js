// mysql.js
const mysql = require('mysql');

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

// Function to log bot events
function logEvent(eventType, eventData) {
    pool.query(
        "INSERT INTO bot_logs (event_type, event_data, timestamp) VALUES (?, ?, ?)",
        [eventType, JSON.stringify(eventData), new Date()],
        (error, results, fields) => {
            if (error) {
                console.error('Error inserting log:', error);
                return;
            }
            // Log only affectedRows and insertId
            console.log('Log inserted successfully - affectedRows:', results.affectedRows, ', insertId:', results.insertId);
        }
    );
}

// Export the logEvent function
module.exports = {
    logEvent
};