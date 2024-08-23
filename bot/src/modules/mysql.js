const mysql = require('mysql');

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

// Function to create tables if they don't exist
function createTablesIfNotExists() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS bot_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(255) NOT NULL,
            event_data TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    pool.query(createTableQuery, (error, results) => {
        if (error) {
            console.error('Error creating tables:', error);
            return;
        }
        console.log('Tables created or already exist.');
    });
}

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

// Create tables when the module is loaded
createTablesIfNotExists();

// Export the logEvent function
module.exports = {
    logEvent
};
