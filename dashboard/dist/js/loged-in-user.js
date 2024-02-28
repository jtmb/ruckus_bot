document.addEventListener("DOMContentLoaded", function() {
    // Retrieve logged-in user information from sessionStorage
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

    console.log("Logged-in user:", loggedInUser); // Check the logged-in user object

    if (loggedInUser) {
        // Display the logged-in user's information
        console.log("Displaying user:", loggedInUser.username); // Check the username
        document.getElementById("usernameDisplay").textContent = loggedInUser.username;
        document.getElementById("userRoleDisplay").textContent = "dashboard user";
    }
});
