document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`http://localhost:3001/users?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
        const data = await response.json();

        if (response.ok) {
            // Authentication successful
            console.log("Authentication successful:", data);
            // Redirect the user to the dashboard
            window.location.href = "dashboard.html";
        } else {
            // Authentication failed
            console.error("Authentication failed:", data.error);
            // Display error message to the user
        }
    } catch (error) {
        console.error("Error during authentication:", error);
        // Display error message to the user
    }
});
