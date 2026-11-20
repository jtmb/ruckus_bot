const mysql = require("mysql2");
const { load } = require("./config");

const config = load();
const pool = mysql
  .createPool({ ...config.mysql, connectionLimit: 10, waitForConnections: true, queueLimit: 100 })
  .promise();

module.exports = { pool, config };
