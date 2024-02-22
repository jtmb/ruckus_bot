// isOnline.js

// Event listener that logs a message when the bot is online
function isOnline(client) {
    client.on('ready', () => {
        console.log(`✅ ${client.user.tag} is online.`);
    });
}

module.exports = isOnline; // Export the function
