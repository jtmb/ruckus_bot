document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('form');

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        var formData = new FormData(form);

        try {
            // Use Fetch API to send the form data to the server
            var response = await fetch('/dist/php/process_webhook.php', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            // Redirect to dashboard.php after successful file creation
            window.location.replace('./dashboard.php');
        } catch (error) {
            console.error('Error:', error);
        }
    });
});