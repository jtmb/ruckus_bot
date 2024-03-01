// displayLogs.js

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
    if (!paginationContainer) {
        console.error('Pagination container not found.');
        return;
    }
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
            paginationLink.style.color = 'none'; // Set color to blue for the active page
        }

        paginationLink.addEventListener('click', (event) => {
            event.preventDefault();
            const clickedPage = parseInt(event.target.textContent);
            displayLogs(clickedPage, pageSize);

            // Retrieve the selected event type
            const selectedEventType = localStorage.getItem('selectedEventType');
            // Apply the filter for the selected event type
            filterLogsByEventType(selectedEventType);
        });

        paginationItem.appendChild(paginationLink);
        paginationContainer.appendChild(paginationItem);
    }

    // Apply custom CSS class to pagination container
    paginationContainer.classList.add('pagination');

    // Apply custom CSS to make pagination links horizontal
    paginationContainer.style.display = 'flex';
    paginationContainer.style.listStyle = 'none';
    paginationContainer.style.padding = '0';
    paginationContainer.style.margin = '0';
    paginationContainer.style.justifyContent = 'center';
    paginationContainer.style.alignItems = 'center';
    paginationContainer.style.gap = '5px'; // Adjust the gap between links as needed
}

// Function to hide pagination container for logs
function hideLoginPagination() {
    const paginationContainer = document.querySelector('#pagination');
    if (!paginationContainer) {
        console.error('Pagination container not found.');
        return;
    }
    paginationContainer.style.display = 'none';
}

// Function to show pagination container for logs
function showPagination() {
    const paginationContainer = document.querySelector('#pagination');
    if (!paginationContainer) {
        console.error('Pagination container not found.');
        return;
    }
    paginationContainer.style.display = 'flex';
}

// Call the function to display logs for the first page when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM content loaded for Logs.");
    displayLogs(1, 10); // Change pageSize to 10 to display 10 logs per page

    // Add event listener for tab clicks
    const allLogsTab = document.querySelector('#tab-all');
    allLogsTab.addEventListener('click', () => {
        showPagination();
        hideLoginPagination();
    });
});

