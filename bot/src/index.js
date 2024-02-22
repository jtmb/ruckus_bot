// index.js

const { Client, IntentsBitField } = require('discord.js');
const handleBotResponses = require('./modules/botResponses');
const isOnline = require('./modules/isOnline');
const botToken = require('./modules/validateToken')();

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildVoiceStates,
    ]
});

// Add event listeners for error and disconnect events
client.on('error', (error) => {
    console.error('Client encountered an error:', error);
});

client.on('disconnect', (event) => {
    console.log('Client disconnected with event:', event);
});

handleBotResponses(client);
isOnline(client);
client.login(botToken);
