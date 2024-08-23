const { logEvent } = require('./mysql');

function handleBotReady(client) {
    console.log('Checking client object:', client);
    if (!client || !client.user) {
        console.error('Error: Client object or client.user is null.');
        return;
    }

    const botId = client.user.id;
    const botName = client.user.username;

    // Get all guilds the bot is connected to
    const guilds = client.guilds.cache;
    if (guilds.size > 0) {
        console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}`);
        console.log('Connected Guilds:');

        guilds.forEach(guild => {
            console.log(`- ${guild.name} (ID: ${guild.id})`);
        });

        // Log event with all guilds
        logEvent('bot_login', {
            botId,
            botName,
            guilds: guilds.map(guild => ({ id: guild.id, name: guild.name })),
            timestamp: new Date()
        });
    } else {
        console.log('Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}. No connected guilds found.');
        // Log event with no guilds
        logEvent('bot_login', {
            botId,
            botName,
            guilds: [],
            timestamp: new Date()
        });
    }
}

module.exports = handleBotReady;
