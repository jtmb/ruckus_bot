// displayLoginLogs.js

// Function to fetch login logs based on page number and display them
async function displayLoginLogs(pageNumber = 1, pageSize = 5) {
    try {
        // Calculate the offset based on page number and page size
        const offset = (pageNumber - 1) * pageSize;

        // Fetch total count of login logs from the API
        const totalCountResponse = await fetch('http://localhost:3001/bot/login_count');
        if (!totalCountResponse.ok) {
            throw new Error('Error fetching total login logs count');
        }
        const totalCountData = await totalCountResponse.json();
        const totalLoginLogsCount = totalCountData.totalCount;

        // Fetch login logs from the API
        const loginLogsResponse = await fetch(`http://localhost:3001/bot/logins?offset=${offset}&limit=${pageSize}`);
        if (!loginLogsResponse.ok) {
            throw new Error('Error fetching login logs');
        }
        const loginLogs = await loginLogsResponse.json();

        // Display login logs and pagination links
        displayLoginLogsAndPagination(pageNumber, pageSize, totalLoginLogsCount, loginLogs);
    } catch (error) {
        console.error('Error fetching login logs:', error);
    }
}

// Function to display login logs and pagination links
function displayLoginLogsAndPagination(currentPage, pageSize, totalLoginLogsCount, loginLogs) {
    console.log("Current Page (Login Logs):", currentPage);
    console.log("Page Size (Login Logs):", pageSize);
    console.log("Total Login Logs Count:", totalLoginLogsCount);

    // Display login logs in the table
    const tableBody = document.querySelector('#botLoginsTable tbody');
    tableBody.innerHTML = '';
    loginLogs.forEach(log => {
        const rowData = `
            <tr>
                <td>${log.id}</td>
                <td>${log.event_type}</td>
                <td>${log.event_data}</td>
                <td>${log.timestamp}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', rowData);
    });

    // Display pagination links for login logs
    const paginationContainer = document.querySelector('#pagination');
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalLoginLogsCount / pageSize);
    for (let page = 1; page <= totalPages; page++) {
        const paginationItem = document.createElement('li');
        paginationItem.classList.add('page-item');

        const paginationLink = document.createElement('a');
        paginationLink.href = '#';
        paginationLink.textContent = page;
        paginationLink.classList.add('page-link');
        if (page === currentPage) {
            paginationItem.classList.add('active'); // Add active class to currently selected page
            paginationLink.style.color = 'blue'; // Set color to blue for the active page
        }

        paginationLink.addEventListener('click', (event) => {
            event.preventDefault();
            const clickedPage = parseInt(event.target.textContent);
            // Pass 'logins' as the tab parameter to display login logs
            displayLoginLogs(clickedPage, pageSize, 'logins');
        });

        paginationItem.appendChild(paginationLink);
        paginationContainer.appendChild(paginationItem);
    }

    // Apply custom CSS to make pagination links horizontal
    paginationContainer.style.display = 'flex';
    paginationContainer.style.listStyle = 'none';
    paginationContainer.style.padding = '0';
    paginationContainer.style.margin = '0';
    paginationContainer.style.justifyContent = 'center';
    paginationContainer.style.alignItems = 'center';
    paginationContainer.style.gap = '5px'; // Adjust the gap between links as needed
}

// Call the function to display login logs for the first page when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM content loaded.");
    displayLoginLogs(1, 5);
});
