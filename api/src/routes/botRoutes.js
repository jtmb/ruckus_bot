// botRoutes.js
const express = require("express");
const router = express.Router();
const { exec } = require('child_process'); // Import exec from child_process
const { getAllLogs, getLogById, insertLog, updateLogById, deleteLogById,
  getBotLoginLogs, getUserInteractionLogs, getTotalLogsCountFromDatabase, getTotalLoginLogsCountFromDatabase } = require("../modules/botDatabase");


// Define a route for fetching all logs with pagination
router.get("/logs", async (req, res) => {
  try {
    // Retrieve pagination parameters from query string or use default values
    const { offset = 0, limit = 10 } = req.query;
    const logs = await getAllLogs(offset, limit);

    // Fetch the total count of logs
    const totalCount = await getTotalLogsCountFromDatabase(); // Use the correct function

    // Set the total count in the response headers
    res.set('X-Total-Count', totalCount);

    // Send logs as JSON response
    res.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching a log by ID
router.get("/logs/:id", async (req, res) => {
  const logId = req.params.id;
  try {
    const log = await getLogById(logId);
    if (!log) {
      res.status(404).json({ error: "Log not found" });
    } else {
      res.json(log);
    }
  } catch (error) {
    console.error("Error fetching log by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for inserting a new log
router.post("/logs", async (req, res) => {
  const { event_type, event_data, timestamp } = req.body;
  try {
    const result = await insertLog(event_type, event_data, timestamp);
    res.json({ message: "Log inserted successfully", insertId: result.insertId });
  } catch (error) {
    console.error("Error inserting log:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for updating a log by ID
router.put("/logs/:id", async (req, res) => {
  const logId = req.params.id;
  const { event_type, event_data, timestamp } = req.body;
  try {
    const result = await updateLogById(logId, event_type, event_data, timestamp);
    res.json({ message: "Log updated successfully" });
  } catch (error) {
    console.error("Error updating log:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for deleting a log by ID
router.delete("/logs/:id", async (req, res) => {
  const logId = req.params.id;
  try {
    const result = await deleteLogById(logId);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: "Log not found" });
    } else {
      res.json({ message: "Log deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting log:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/logins", async (req, res) => {
  try {
    // Retrieve pagination parameters from query string or use default values
    const { offset = 0, limit = 10 } = req.query;
    const botLoginLogs = await getBotLoginLogs(offset, limit);
    res.json(botLoginLogs);
  } catch (error) {
    console.error("Error fetching bot login logs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching user interaction logs with pagination
router.get("/interactions", async (req, res) => {
  try {
    // Retrieve pagination parameters from query string or use default values
    const { offset = 0, limit = 10 } = req.query;
    const userInteractionLogs = await getUserInteractionLogs(offset, limit);
    res.json(userInteractionLogs);
  } catch (error) {
    console.error("Error fetching user interaction logs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching the total count of logs
router.get("/count", async (req, res) => {
  try {
    const totalCount = await getTotalLogsCountFromDatabase();
    res.json({ totalCount });
  } catch (error) {
    console.error("Error fetching total count of logs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching the total count of login logs
router.get("/login_count", async (req, res) => {
  try {
    const totalCount = await getTotalLoginLogsCountFromDatabase();
    res.json({ totalCount });
  } catch (error) {
    console.error("Error fetching total count of login logs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Restart bot route
router.post('/restart', (req, res) => {
  exec('supervisorctl restart bot_run', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).send('Error restarting bot');
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
    res.send('Bot restarted successfully');
  });
});


module.exports = router;