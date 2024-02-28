document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`http://localhost:3001/users?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
        const users = await response.json();

        if (response.ok) {
            // Find the logged-in user
            const loggedInUser = users.find(user => user.username === username);
            
            if (loggedInUser) {
                // Authentication successful
                console.log("Authentication successful:", loggedInUser);
                // Save logged-in user's information
                sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
                // Redirect the user to the dashboard
                window.location.href = "dashboard.html";
            } else {
                // User not found
                console.error("User not found");
                // Display error message to the user
            }
        } else {
            // Authentication failed
            console.error("Authentication failed:", users.error);
            // Display error message to the user
        }
    } catch (error) {
        console.error("Error during authentication:", error);
        // Display error message to the user
    }
});
