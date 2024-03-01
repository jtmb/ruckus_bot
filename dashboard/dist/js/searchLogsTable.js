// searchLogsTable.js
// Function to handle search button click
document.getElementById('searchButton').addEventListener('click', function() {
    // Get the search input value
    const searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
    
    // Get all the rows in the table body
    const tableRows = document.querySelectorAll('#allLogsTable tbody tr');
    
    // Loop through each row and check if the event data contains the search query
    tableRows.forEach(row => {
        // Get the event data cell content
        const eventDataCellContent = row.querySelector('td:nth-child(3)').textContent.toLowerCase();
        
        // If the event data contains the search query, display the row, otherwise hide it
        if (eventDataCellContent.includes(searchQuery)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});
