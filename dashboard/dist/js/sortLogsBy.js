// sortLogsBy.js

// Function to show or hide table rows based on the selected event type
function filterLogsByEventType(eventType) {
  console.log('Selected Event Type:', eventType);
  const tableRows = document.querySelectorAll('#allLogsTable tbody tr');

  tableRows.forEach(row => {
    const eventTypeCell = row.querySelector('td:nth-child(2)');
    if (eventType === 'All' || (eventTypeCell && eventTypeCell.textContent.trim().toUpperCase() === eventType.trim().toUpperCase())) {
      row.style.display = 'table-row';
    } else {
      row.style.display = 'none';
    }
  });

  // Store the selected event type in localStorage
  localStorage.setItem('selectedEventType', eventType);
}

// Function to retrieve the selected event type from localStorage
function retrieveSelectedEventType() {
  return localStorage.getItem('selectedEventType') || 'All';
}

// Initialize the filter based on the stored event type
const storedEventType = retrieveSelectedEventType();
filterLogsByEventType(storedEventType);

// Add event listener to the dropdown items
document.querySelectorAll('#eventTypeDropdown .dropdown-item').forEach(item => {
  item.addEventListener('click', function() {
    console.log('Dropdown item clicked');
    const selectedEventType = this.textContent.trim();
    filterLogsByEventType(selectedEventType);
    console.log('Filtered logs:', document.querySelectorAll('#allLogsTable tbody tr'));
  });
});

// Add event listener to pagination links to reapply the filter
document.querySelectorAll('.pagination-link').forEach(link => {
  link.addEventListener('click', function() {
    const storedEventType = retrieveSelectedEventType();
    filterLogsByEventType(storedEventType);
  });
});
