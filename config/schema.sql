-- Create the dashboard database if not exists
CREATE DATABASE IF NOT EXISTS db;
USE db;

-- Create the bot_logs table
USE db;
CREATE TABLE IF NOT EXISTS bot_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(255) NOT NULL,
    event_data TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a table for user credentials
CREATE TABLE IF NOT EXISTS credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL
);
-- Insert a test user into the credentials table
-- INSERT INTO credentials (username, password, role) VALUES ('admin', 'changeme', 'admin');
INSERT INTO credentials (username, password, role) VALUES ('user', 'changeme', 'user');
