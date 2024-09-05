const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt');
const { getUsers, getUser, createUser, updateUserPassword, getUserByUsername, deleteUserByUsername, createDatabaseAndTable } = require("../modules/dashboardDatabase.js");


// Route to initialize the database and table
router.post("/initialize-db", async (req, res) => {
  try {
    const result = await createDatabaseAndTable();
    res.json(result);
  } catch (error) {
    console.error("Error initializing database:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching all users
router.get("/users", async (req, res) => {
  try {
    const users = await getUsers();
    // Map the users to include only the required fields (id, username, role)
    const simplifiedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role
    }));
    res.json(simplifiedUsers);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for fetching a specific user by ID
router.get("/users/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
    } else {
      // Return the user with only the required fields (id, username, role)
      const simplifiedUser = {
        id: user.id,
        username: user.username,
        role: user.role
      };
      res.json(simplifiedUser);
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for creating a new user
router.post("/users", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const [result] = await createUser(username, password, role); // Assuming createUser function now accepts role
    const insertId = result.insertId;
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

// Define a route for updating a user's password by username
router.post("/users/:username/password", async (req, res) => {
  const username = req.params.username;
  const { newPassword } = req.body;

  try {
    // Retrieve the user from the database
    const user = await getUserByUsername(username);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password in the database
    const result = await updateUserPassword(user.id, hashedNewPassword);
    console.log(`Password updated for user ${username}`);
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for deleting a user by username
router.delete("/users/:username", async (req, res) => {
  const username = req.params.username;
  try {
    // Call the deleteUserByUsername function from the database module
    const result = await deleteUserByUsername(username);
    if (result.affectedRows === 0) {
      // If no user was deleted, return a not found error
      res.status(404).json({ error: "User not found" });
    } else {
      // If user was deleted successfully, return success message
      res.json({ message: "User deleted successfully" });
    }
  } catch (error) {
    // If an error occurs, return an internal server error
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Define a route for authenticating a user
router.post("/users/authenticate", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Retrieve the user from the database based on the provided username
    const user = await getUserByUsername(username);
    if (!user) {
      // If the user is not found, return an error response
      return res.status(404).json({ error: "User not found" });
    }

    // Compare the provided password with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      // If the passwords do not match, return an error response
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // If authentication is successful, return a success response with user information
    res.json({ message: "Authentication successful", user });
  } catch (error) {
    // If an error occurs, return an internal server error response
    console.error("Error during authentication:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;