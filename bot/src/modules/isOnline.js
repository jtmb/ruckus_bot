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

    // Get the name of the first guild the bot is connected to
    let guildName = 'Unknown Guild';
    if (client.guilds.cache.size > 0) {
        const firstGuild = client.guilds.cache.first();
        guildName = firstGuild.name;
    }

    console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}, Guild Name: ${guildName}`);
    logEvent('bot_login', { botId, botName, guildName, timestamp: new Date() });
}

module.exports = handleBotReady;
