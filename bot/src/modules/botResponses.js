// botResponses.js

// Imports
const sendRandomQuote = require('./randomQuote');
const { logEvent } = require('./mysql');
const { fetchJoke } = require('./jokeAPI');
const { handleWeatherCommands } = require('./weatherHandling');
const handleNChainResponse = require('./nChain');
const handleJokeCommand = require('./jokeComHandling');
const handleEasterEgg = require('./easterEgg');
const handleBotReady = require('./isOnline');
const handleInsults = require('./dontTreadOnMe');
const handleHeadsOrTails = require('./headsOrTails');

async function handleBotResponses(client) {
    // Map to track messages the bot has replied to
    const repliedMessages = new Map();

    // Event listener for bot ready event
    client.once('ready', () => {
        handleBotReady(client);
    });

    // Event listener for messageCreate event
    client.on('messageCreate', async (message) => {
        // Check if the message has already been processed
        if (repliedMessages.has(message.id)) return;

        // Log the received message
        console.log('Message received:', message.content);

        const content = message.content.toLowerCase();

        // Check if the message author is the bot itself
        if (message.author.bot) return;

        // Log user interactions
        logEvent('user_interaction', {
            userId: message.author.id,
            username: message.author.username,
            messageContent: message.content,
            timestamp: new Date(),
            channelId: message.channel.id,
            guildId: message.guild ? message.guild.id : null, // Check if message.guild exists to avoid errors
        });


        // Flag to track if the message contains a known command
        let containsCommand = false;

        // Array of handler functions
        const handlers = [
            handleWeatherCommands,
            handleNChainResponse,
            handleJokeCommand,
            handleEasterEgg,
            handleInsults, // Add handleInsults to the list of handlers
            handleHeadsOrTails
        ];

        // Loop through handler functions
        for (const handler of handlers) {
            // Execute handler and check if it was triggered
            const result = await handler(message, client, repliedMessages);
            if (result) {
                containsCommand = true;
                break;
            }
        }

        // If the message contains a known command, do not send a random quote
        if (containsCommand) {
            // Mark the message as processed
            repliedMessages.set(message.id, true);
            return;
        }

        // If no specific commands are detected and the bot is mentioned
        // Send a random quote
        if (message.mentions.has(client.user) && !content.includes('flip a coin')) {
            const randomQuote = sendRandomQuote();
            await message.channel.send(randomQuote);
        }

        // Mark the message as processed
        repliedMessages.set(message.id, true);
    });
}

module.exports = handleBotResponses;
