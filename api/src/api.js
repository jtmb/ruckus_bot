const express = require("express");
const { getUsers, getUser, createUser } = require("./modules/database.js");
const bodyParser = require("body-parser");
const cors = require("cors"); // Import the CORS middleware
const app = express();
const PORT = process.env.PORT || 3001;

// Configure JSON body-parser middleware
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());

// Define a route for fetching all users
app.get("/users", async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching a specific user by ID
app.get("/users/:id", async (req, res) => {
    const userId = req.params.id;
    try {
      const user = await getUser(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
      } else {
        res.json(user);
      }
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  
// Define a route for creating a new user
app.post("/users", async (req, res) => {
    const { username, password } = req.body;
    try {
      const [result] = await createUser(username, password); // Destructure the result array
      const insertId = result.insertId; // Access the insertId from the first element of the array
      if (insertId !== undefined) {
        console.log(`User "${username}" created successfully with ID ${insertId}`);
        res.json({ message: "User created successfully", username, insertId });
      } else {
        console.error("Error: insertId is undefined");
        res.status(500).json({ error: "Internal Server Error" });
      }
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
});

// Define a route for user authentication
app.get("/users/authenticate", async (req, res) => {
    const { username, password } = req.query; // Get username and password from query parameters

    try {
        // Check if the user with the provided username exists
        const user = await getUserByUsername(username);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // Check if the password matches the stored password
        const passwordMatch = await comparePassword(password, user.password);
        if (!passwordMatch) {
            res.status(401).json({ error: "Invalid password" });
            return;
        }

        // Authentication successful
        res.json({ message: "Authentication successful", user });
    } catch (error) {
        console.error("Error during authentication:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

  

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
