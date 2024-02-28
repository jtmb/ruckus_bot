document.addEventListener("DOMContentLoaded", function() {
    const changePasswordForm = document.getElementById("changePasswordForm");
    console.log(changePasswordForm); // Log the form element

    if (changePasswordForm) {
        // Add event listener for form submission
        changePasswordForm.addEventListener("submit", async function(event) {
            event.preventDefault(); // Prevent the default form submission

            // Retrieve the new password from the form input field
            const newPassword = document.getElementById("passwordChangeField").value;

            // Retrieve the logged-in user information from sessionStorage
            const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

            // Make sure the logged-in user information is available
            if (loggedInUser) {
                // Construct the API endpoint URL
                const apiUrl = `http://localhost:3001/users/${loggedInUser.username}/password`;

                // Make an AJAX request to the API endpoint to update the password
                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            newPassword: newPassword
                        })
                    });

                    // Check if the request was successful
                    if (response.ok) {
                        const data = await response.json();
                        alert("Password updated successfully!");

                        // Redirect the user to the dashboard
                        window.location.href = "/dashboard";
                    } else {
                        console.error('Error updating password:', response.statusText);
                        alert("Failed to update password. Please try again later.");
                    }
                } catch (error) {
                    console.error('Error updating password:', error.message);
                    alert("Failed to update password. Please try again later.");
                }
            } else {
                console.error('Logged-in user information not found.');
                alert("Logged-in user information not found. Please log in again.");
            }
        });
    } else {
        console.error('Change password form not found.');
    }
});
