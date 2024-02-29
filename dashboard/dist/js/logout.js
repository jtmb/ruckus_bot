// logout.js

// Function to handle logout
function logout() {
    // Remove the user session from sessionStorage
    sessionStorage.removeItem('loggedInUser');
    // Redirect the user to the login page (assuming it's named login.html)
    window.location.href = './';
}
