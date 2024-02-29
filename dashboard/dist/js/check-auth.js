// check-auth.js

// Function to check if the user is already authenticated
function checkAuthentication() {
    // Check if the user session contains authentication information
    const loggedInUser = sessionStorage.getItem('loggedInUser');
    if (loggedInUser) {
        // User is authenticated, redirect to dashboard.html
        window.location.href = './dashboard.html';
    }
}

// Call the checkAuthentication function when the page loads
window.addEventListener('load', checkAuthentication);
