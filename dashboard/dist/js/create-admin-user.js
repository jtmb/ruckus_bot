// create-admin-user.js

// Function to create a new user with the role "admin"
async function createAdminUser() {
    try {
        // Define the username and password (you can adjust these as needed)
        const username = "admin";
        const password = "changeme";
        const role = "admin";

        // Send a POST request to the create user endpoint
        const response = await fetch("http://localhost:3001/users", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, role })
        });

        // Check if the request was successful
        if (response.ok) {
            console.log("Admin user created successfully");
            // Display a success message
            displaySuccessAlert("Default Admin user created successfully");
            // Display the username and password in blue
            displayBlueMessage(`Username: ${username}<br>Password: ${password}`);
        } else {
            console.error("Failed to create admin user");
            // Display an error message
            displayErrorAlert("Failed to create admin user: ALREADY EXISTS");
        }
    } catch (error) {
        console.error("Error creating admin user:", error);
        // Display an error message
        displayErrorAlert("Error creating admin user");
    }
}

// Function to display an error alert message
function displayErrorAlert(message) {
    // Create the alert message
    const alertDiv = createAlert("ERROR", message, "alert-danger");
    document.body.appendChild(alertDiv);
    // Automatically remove the error message after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove("show");
        setTimeout(() => {
            alertDiv.remove();
        }, 500);
    }, 5000);
}

// Function to display a success alert message
function displaySuccessAlert(message) {
    // Create the alert message
    const alertDiv = createAlert("SUCCESS", message, "alert-success");
    document.body.appendChild(alertDiv);
    // Automatically remove the success message after half a second
    setTimeout(() => {
        alertDiv.classList.remove("show");
        setTimeout(() => {
            alertDiv.remove();
        }, 500);
    }, 500);
}

// Function to display a blue message
function displayBlueMessage(message) {
    // Create the alert message
    const alertDiv = createAlert("INFO", message, "alert-primary");
    // Append the blue message after the success or error message
    const successAlert = document.querySelector(".alert-success");
    const errorAlert = document.querySelector(".alert-danger");
    const parentElement = document.body;
    parentElement.insertBefore(alertDiv, successAlert || errorAlert.nextSibling);
}

// Function to create an alert message
function createAlert(title, message, alertClass) {
    // Create the alert message
    const alertDiv = document.createElement("div");
    alertDiv.classList.add("alert", "alert-dismissible", "position-fixed", "top-0", "end-0", "m-3", "fade", "show", alertClass);
    alertDiv.setAttribute("role", "alert");
    alertDiv.style.maxWidth = "20rem"; // Adjust width as needed

    // Create the content of the alert message
    alertDiv.innerHTML = `
        <div class="d-flex">
            <div>
                <!-- You can add an SVG icon here if needed -->
            </div>
            <div>
                <h4 class="alert-title">${title}</h4>
                <div class="text-secondary">${message}</div>
            </div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    return alertDiv;
}

// Call the createAdminUser function when the page loads
window.addEventListener('load', () => {
    // Find the link element by its ID and attach a click event listener
    const link = document.getElementById('createAdminUserLink');
    link.addEventListener('click', async (event) => {
        // Prevent the default behavior of the link (i.e., navigating to the URL)
        event.preventDefault();
        // Call the createAdminUser function to create an admin user
        await createAdminUser();
    });
});
