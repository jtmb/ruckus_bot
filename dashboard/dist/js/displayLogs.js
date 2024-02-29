// displayLogs.js
// Function to fetch logs based on page number and display them
async function displayLogs(pageNumber = 1, pageSize = 5) {
    try {
        // Calculate the offset based on page number and page size
        const offset = (pageNumber - 1) * pageSize;
        
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `http://localhost:3001/bot/logs?offset=${offset}&limit=${pageSize}`, true);
        xhr.withCredentials = false;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    const logs = JSON.parse(xhr.responseText);
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
                    const totalLogsCountHeader = xhr.getResponseHeader('X-Total-Count');
                    console.log('X-Total-Count header:', totalLogsCountHeader);

                    if (totalLogsCountHeader === null) {
                        console.error('X-Total-Count header is null.');
                        return;
                    }

                    const totalLogsCount = parseInt(totalLogsCountHeader);

                    if (isNaN(totalLogsCount)) {
                        console.error('Invalid X-Total-Count header:', totalLogsCountHeader);
                        return;
                    }

                    displayPaginationLinks(pageNumber, pageSize, totalLogsCount);
                } else {
                    console.error('Error fetching logs. Status:', xhr.status);
                }
            }
        };
        xhr.send();
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}


function displayPaginationLinks(currentPage, pageSize, totalLogsCount) {
    console.log("Current Page:", currentPage);
    console.log("Page Size:", pageSize);
    console.log("Total Logs Count:", totalLogsCount);

    // Select the pagination container
    const paginationContainer = document.querySelector('#pagination');
    console.log("Pagination Container:", paginationContainer);

    // Clear existing pagination links
    paginationContainer.innerHTML = '';

    // Calculate total number of pages
    const totalPages = Math.ceil(totalLogsCount / pageSize);
    console.log("Total Pages:", totalPages);

    // Create pagination links for each page
    for (let page = 1; page <= totalPages; page++) {
        const paginationItem = document.createElement('li');
        paginationItem.classList.add('page-item');

        const paginationLink = document.createElement('a');
        paginationLink.href = '#';
        paginationLink.textContent = page;
        paginationLink.classList.add('page-link');

        // Highlight the current page
        if (page === currentPage) {
            paginationItem.classList.add('active');
        }

        // Add event listener to load logs for the clicked page
        paginationLink.addEventListener('click', (event) => {
            event.preventDefault();
            const clickedPage = parseInt(event.target.textContent);
            displayLogs(clickedPage, pageSize);
        });

        paginationItem.appendChild(paginationLink);
        paginationContainer.appendChild(paginationItem);
    }
}

// Call the function to display logs for the first page when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM content loaded.");
    displayLogs(1, 5); // Change the pageSize to 10 if needed
    
    // Append pagination container after tab content
    const tabContent = document.querySelector('.tab-content');
    const paginationContainer = document.querySelector('#pagination');
    tabContent.insertAdjacentElement('afterend', paginationContainer);
});
