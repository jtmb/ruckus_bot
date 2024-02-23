function updateCardStatus(filename, isSuccess) {
    const cardSelector = `[data-filename="${filename}"] .card-status-start`;

    // Remove existing status classes
    $(cardSelector).removeClass('bg-success bg-danger');

    // Add the new status class
    const newStatusClass = isSuccess ? 'bg-success' : 'bg-danger';
    $(cardSelector).addClass(newStatusClass);

    // Reload the page after a successful webhook trigger
    if (isSuccess) {
        setTimeout(function () {
            window.location.reload(true);
        }, 1000); // Adjust the delay as needed (5000 milliseconds = 5 seconds)
    }
}
