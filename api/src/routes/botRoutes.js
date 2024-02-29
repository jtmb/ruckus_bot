// botRoutes.js
const express = require("express");
const router = express.Router();
const { getAllLogs, getLogById, insertLog, updateLogById, deleteLogById, getBotLoginLogs, getUserInteractionLogs} = require("../modules/botDatabase");

// Define a route for fetching all logs
router.get("/logs", async (req, res) => {
  try {
    const logs = await getAllLogs();
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

// Define a route for fetching bot login logs
router.get("/logins", async (req, res) => {
    try {
      const botLoginLogs = await getBotLoginLogs();
      res.json(botLoginLogs);
    } catch (error) {
      console.error("Error fetching bot login logs:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  
  // Define a route for fetching user interaction logs
  router.get("/interactions", async (req, res) => {
    try {
      const userInteractionLogs = await getUserInteractionLogs();
      res.json(userInteractionLogs);
    } catch (error) {
      console.error("Error fetching user interaction logs:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  

module.exports = router;
