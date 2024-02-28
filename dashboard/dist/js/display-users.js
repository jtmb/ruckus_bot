// Function to fetch users from the API and display them in a table
async function displayUsers() {
    const usersResponse = await fetch("http://localhost:3001/users");
    const users = await usersResponse.json();
  
    const userTableBody = document.getElementById("userTableBody");
    userTableBody.innerHTML = ""; // Clear previous content
  
    // Loop through each user and generate HTML for the table row
    users.forEach(user => {
      const userTableRow = `
        <tr>
          <td>${user.username}</td>
          <td>${user.role}</td>
          <td>
            <button type="button" class="btn btn-outline-danger btn-sm">
              <i class="fe fe-trash-2"></i> Delete
            </button>
          </td>
        </tr>
      `;
      // Append the generated HTML to the table body
      userTableBody.innerHTML += userTableRow;
    });
  }
  
  // Call the displayUsers function when the page loads
  window.addEventListener("load", displayUsers);
  