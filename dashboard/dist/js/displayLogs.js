// displayLogs.js
// Function to fetch logs based on page number and display them
async function displayLogs(pageNumber = 1, pageSize = 5) {
    // Calculate the offset based on page number and page size
    const offset = (pageNumber - 1) * pageSize;
    const logsResponse = await fetch(`http://localhost:3001/bot/logs?offset=${offset}&limit=${pageSize}`);
    const logs = await logsResponse.json();

    const tableBody = document.querySelector('#allLogsTable tbody');

    // Clear existing table rows
    tableBody.innerHTML = '';

    // Iterate over each log and create table rows
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

    // Display pagination links
    const totalLogsCount = parseInt(logsResponse.headers.get('X-Total-Count'));
    displayPaginationLinks(pageNumber, pageSize, totalLogsCount);
}

// Function to display pagination links
function displayPaginationLinks(currentPage, pageSize, totalLogsCount) {
    // Select the pagination container
    const paginationContainer = document.querySelector('#pagination');

    // Clear existing pagination links
    paginationContainer.innerHTML = '';

    // Calculate total number of pages
    const totalPages = Math.ceil(totalLogsCount / pageSize);

    // Create pagination links for each page
    for (let page = 1; page <= totalPages; page++) {
        const paginationLink = document.createElement('a');
        paginationLink.href = '#';
        paginationLink.textContent = page;
        paginationLink.classList.add('pagination-link');

        // Highlight the current page
        if (page === currentPage) {
            paginationLink.classList.add('active');
        }

        // Add event listener to load logs for the clicked page
        paginationLink.addEventListener('click', () => {
            displayLogs(page, pageSize); // Corrected the function call
        });

        paginationContainer.appendChild(paginationLink);
    }
}

// Call the function to display logs for the first page when the page loads
window.addEventListener('DOMContentLoaded', () => {
    displayLogs(1, 5); // Change the pageSize to 10
});
