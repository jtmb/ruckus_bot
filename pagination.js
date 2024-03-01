// here are my two files. All i want is for them to share the same pagination postion and not overlap on eachother when moving through tabs.

// CURRENTLY THIS DOES NOT WORK tHE PAGINATION LINKS ARE STACKED ON EACHOTHER.

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
    if (!tableBody) {
        console.error('Login logs table body not found.');
        return;
    }
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
    const paginationContainer = document.querySelector('#loginPagination');
    if (!paginationContainer) {
        console.error('Login pagination container not found.');
        return;
    }
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
            displayLoginLogs(clickedPage, pageSize);
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


// displayLogs.js

// Call the function to display logs for the first page when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM content loaded.");
    displayLogs(1, 5);
    displayLoginLogs(1, 5);
    
    // Add event listeners for tab clicks
    const tabLinks = document.querySelectorAll('.nav-tabs .nav-link');
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Remove active class from all tab links
            tabLinks.forEach(tabLink => {
                tabLink.classList.remove('active');
            });
            // Add active class to the clicked tab link
            link.classList.add('active');
            // Hide all pagination containers
            const paginationContainers = document.querySelectorAll('.pagination-container');
            paginationContainers.forEach(container => {
                container.style.display = 'none';
            });
            // Show pagination container for the active tab
            const activeTab = link.getAttribute('href').substring(1);
            const activePaginationContainer = document.querySelector(`#${activeTab} .pagination-container`);
            activePaginationContainer.style.display = 'flex';
        });
    });
});

// Function to fetch logs based on page number and display them
async function displayLogs(pageNumber = 1, pageSize = 5) {
    try {
        // Calculate the offset based on page number and page size
        const offset = (pageNumber - 1) * pageSize;

        // Fetch total count of logs from the API
        const totalCountResponse = await fetch('http://localhost:3001/bot/count');
        if (!totalCountResponse.ok) {
            throw new Error('Error fetching total logs count');
        }
        const totalCountData = await totalCountResponse.json();
        const totalLogsCount = totalCountData.totalCount;

        // Fetch logs from the API
        const logsResponse = await fetch(`http://localhost:3001/bot/logs?offset=${offset}&limit=${pageSize}`);
        if (!logsResponse.ok) {
            throw new Error('Error fetching logs');
        }
        const logs = await logsResponse.json();

        // Display logs and pagination links
        displayLogsAndPagination(pageNumber, pageSize, totalLogsCount, logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Function to display logs and pagination links
function displayLogsAndPagination(currentPage, pageSize, totalLogsCount, logs) {
    console.log("Current Page:", currentPage);
    console.log("Page Size:", pageSize);
    console.log("Total Logs Count:", totalLogsCount);

    // Display logs in the table
    const tableBody = document.querySelector('#allLogsTable tbody');
    tableBody.innerHTML = '';
    logs.forEach(log => {
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

    // Display pagination links for logs
    const paginationContainer = document.querySelector('#pagination');
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalLogsCount / pageSize);
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
            displayLogs(clickedPage, pageSize);
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
