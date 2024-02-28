document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`http://localhost:3001/users/authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            // Authentication successful
            console.log("Authentication successful:", data.user);
            // Save logged-in user's information
            sessionStorage.setItem('loggedInUser', JSON.stringify(data.user));
            // Redirect the user to the dashboard
            window.location.href = "dashboard.html";
        } else {
            // Authentication failed
            console.error("Authentication failed:", data.error);
            displayErrorAlert("Invalid username or password");
        }
    } catch (error) {
        console.error("Error during authentication:", error);
        displayErrorAlert("Error during authentication. Please try again later.");
    }
});

function displayErrorAlert(message) {
    // Create the alert message
    const alertDiv = document.createElement("div");
    alertDiv.classList.add("alert", "alert-danger", "alert-dismissible", "position-fixed", "top-0", "end-0", "m-3", "fade", "show");
    alertDiv.setAttribute("role", "alert");
    alertDiv.style.maxWidth = "20rem"; // Adjust width as needed

    // Create the content of the alert message
    alertDiv.innerHTML = `
        <div class="d-flex">
            <div>
                <!-- You can add an SVG icon here if needed -->
            </div>
            <div>
                <h4 class="alert-title">ERROR</h4>
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
