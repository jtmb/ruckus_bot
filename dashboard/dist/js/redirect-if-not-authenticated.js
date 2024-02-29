// redirect-if-not-authenticated.js

// Function to check if the user is authenticated
function checkAuthentication() {
    // Retrieve the user session from sessionStorage
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    // If the user session does not exist or is invalid, redirect to the login page
    if (!loggedInUser || !loggedInUser.username) {
        window.location.href = './'; // Redirect to the login page
    }
}

// Call the checkAuthentication function when the page loads
window.addEventListener('load', checkAuthentication);
