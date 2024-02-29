const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;

// Configure JSON body-parser middleware
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());

// Import dashboard routes
const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/", dashboardRoutes);

// Import bot routes
const botRoutes = require("./routes/botRoutes");
app.use("/bot", botRoutes); // Register bot routes under /bot prefix

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
