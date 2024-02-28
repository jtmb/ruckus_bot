document.getElementById("addUserForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    const username = document.getElementById("name").value; // Changed to "username"
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    try {
        const response = await fetch(`http://localhost:3001/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, role }) // Changed to "username"
        });
        const data = await response.json();

        if (response.ok) {
            // User created successfully
            console.log("User created successfully:", data);
            displaySuccessAlert("User created successfully");
            // Clear the form fields
            document.getElementById("name").value = "";
            document.getElementById("password").value = "";
            document.getElementById("role").value = "";
        } else {
            // Error creating user
            console.error("Error creating user:", data.error);
            displayErrorAlert("Error: User already exists" + data.error);
        }
    } catch (error) {
        console.error("Error creating user:", error);
        displayErrorAlert("Error creating user. Please try again later.");
    }
});

function displaySuccessAlert(message) {
    const alertDiv = document.createElement("div");
    alertDiv.classList.add("alert", "alert-success", "alert-dismissible", "position-fixed", "top-0", "end-0", "m-3", "fade", "show");
    alertDiv.setAttribute("role", "alert");
    alertDiv.style.maxWidth = "20rem";

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

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.classList.remove("show");
    }, 5000);

    setTimeout(() => {
        alertDiv.remove();
    }, 5500);
}

function displayErrorAlert(message) {
    const alertDiv = document.createElement("div");
    alertDiv.classList.add("alert", "alert-danger", "alert-dismissible", "position-fixed", "top-0", "end-0", "m-3", "fade", "show");
    alertDiv.setAttribute("role", "alert");
    alertDiv.style.maxWidth = "20rem";

    alertDiv.innerHTML = `
        <div class="d-flex">
            <div>
                <!-- You can add an SVG icon here if needed -->
            </div>
            <div>
                <h4 class="alert-title">Error</h4>
                <div class="text-secondary">${message}</div>
            </div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.classList.remove("show");
    }, 5000);

    setTimeout(() => {
        alertDiv.remove();
    }, 5500);
}
