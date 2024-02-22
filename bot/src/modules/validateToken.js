function validateToken_export() {
    // Read bot token from environment variable
    const botToken = process.env.BOT_TOKEN;
    // const botToken = 'API_KEY';

    if (!botToken) {
        console.error("Bot token not provided in the environment variable BOT_TOKEN");
        process.exit(1); // Exit the process if bot token is not provided
    }

    return botToken; // Return the bot token
}

module.exports = validateToken_export;