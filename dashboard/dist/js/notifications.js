// notifications.js

function playWebhook(filename) {
    fetch('/dist/php/play-webhook.php?filename=' + encodeURIComponent(filename))
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('success', 'Webhook triggered successfully!', 'Your message has been sent!');
            } else {
                showToast('danger', 'Failed to trigger webhook.', 'Please try again. —');
            }
        })
        .catch(error => {
            showToast('danger', 'An error occurred while triggering the webhook.', ' Please try again. —');
            console.error('Error:', error);
        });
}

function showToast(type, title, message) {
    // Create the alert div
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-4`;

    // Create the alert content based on type
    if (type === 'success') {
        alert.innerHTML = `
            <strong>${title}</strong> ${message}
        `;
    } else if (type === 'danger') {
        alert.innerHTML = `
            <strong>${title}</strong> ${message} <a href="#" class="alert-link">Check it out</a>!
        `;
    }

    // Create the toast div and append the alert
    const toast = new bootstrap.Toast(alert);
    toast.show();

    // Append the toast to the body
    document.body.appendChild(alert);
}
