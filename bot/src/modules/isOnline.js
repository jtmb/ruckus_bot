// isOnline.js

const { logEvent } = require('./mysql');

function handleBotReady(client) {
    console.log('Checking client object:', client);
    if (!client || !client.user) {
        console.error('Error: Client object or client.user is null.');
        return;
    }

    const botId = client.user.id;
    const botName = client.user.username;

    console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}`);
    logEvent('bot_login', { botId, botName, timestamp: new Date() });
}

module.exports = handleBotReady;
