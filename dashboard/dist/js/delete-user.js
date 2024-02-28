// Function to display a success notification
function displaySuccessAlert(message) {
    // Create the alert message
    const alertDiv = document.createElement("div");
    alertDiv.classList.add("alert", "alert-success", "alert-dismissible", "position-fixed", "top-0", "end-0", "m-3", "fade", "show");
    alertDiv.setAttribute("role", "alert");
    alertDiv.style.maxWidth = "20rem"; // Adjust width as needed

    // Create the content of the alert message
    alertDiv.innerHTML = `
        <div class="d-flex">
            <div>
                <!-- You can add an SVG icon here if needed -->
            </div>
            <div>
                <h4 class="alert-title">Success</h4>
                <div class="text-secondary">${message}</div>
            </div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    // Append the alert message to the document body
    document.body.appendChild(alertDiv);

    // Automatically remove the "show" class after a certain duration (e.g., 5 seconds)
    setTimeout(() => {
        alertDiv.classList.remove("show");
    }, 5000);

    // Automatically remove the alert message after a certain duration (e.g., 5 seconds)
    setTimeout(() => {
        alertDiv.remove();
    }, 5500); // Delay removal slightly to allow fade-out animation
}

// Function to handle the deletion of a user
async function deleteUser(username) {
    try {
        // Retrieve the logged-in user's information from sessionStorage
        const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
        if (loggedInUser && loggedInUser.username === username) {
            alert("You cannot delete yourself.");
            return; // Prevent further execution
        }

        const response = await fetch(`http://localhost:3001/users/${username}`, {
            method: "DELETE"
        });
        if (response.ok) {
            console.log(`User "${username}" deleted successfully`);
            // After successful deletion, refresh the user list
            displayUsers();
            // Display success message
            displaySuccessAlert(`User "${username}" deleted successfully`);
        } else {
            console.error("Failed to delete user");
            // Display an error message or handle the error as needed
        }
    } catch (error) {
        console.error("Error deleting user:", error);
        // Display an error message or handle the error as needed
    }
}

// Function to attach event listeners to delete buttons
function attachDeleteButtonListeners() {
    const deleteButtons = document.querySelectorAll(".delete-user-btn");
    deleteButtons.forEach(button => {
        button.addEventListener("click", async () => {
            const username = button.dataset.username;
            const confirmation = confirm(`Are you sure you want to delete the user "${username}"?`);
            if (confirmation) {
                await deleteUser(username);
            }
        });
    });
}

// Call the attachDeleteButtonListeners function when the page loads
window.addEventListener("load", attachDeleteButtonListeners);
