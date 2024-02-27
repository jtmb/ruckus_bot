// Imports
const sendRandomQuote = require('./randomQuote');
const { logEvent } = require('./mysql');
const { fetchJoke } = require('./jokeAPI'); // Import fetchJoke function from jokeAPI.js
const handleWeatherCommands = require('./weatherComHandling');
const handleNChainResponse = require('./nChain'); // Import handleNChainResponse function from nChain.js

// Function to handle bot responses
async function handleBotResponses(client) {
    // Map to track messages the bot has replied to
    const repliedMessages = new Map();

    // Event listener for messageCreate event
    client.on('messageCreate', async (message) => {
        const content = message.content.toLowerCase();

        // Log the message object for debugging
        console.log('Received message:', message);

        // Check if the message author is the bot itself
        if (message.author.bot) return;

        // Check if the bot was mentioned or replied to
        if (message.mentions.users.has(client.user.id) || repliedMessages.has(message.id)) {
            // Log user interactions
            logEvent('user_interaction', {
                userId: message.author.id,
                messageContent: message.content,
                timestamp: new Date()
            });
        }

        // Handle weather commands
        await handleWeatherCommands(message, client, repliedMessages);

        // Handle N chain responses
        handleNChainResponse(message, client, repliedMessages, logEvent);

        // Check if the message mentions the bot and mentions a joke
        if (message.mentions.users.has(client.user.id) && (content.includes('joke') || content.includes('tell me a joke'))) {
            // Fetch a joke from the JokeAPI
            const joke = await fetchJoke();
            // Reply to the user with the fetched joke
            message.reply(joke);
            // Add the message ID to the map of replied messages
            repliedMessages.set(message.id, true);
            return;
        }

        // Check if the message author's ID matches the specified ID and the message content matches the specific phrase
        if (message.author.id === '151170388708032512' && content === 'hello my child') {
            // Check if the bot has already replied to this message
            if (!repliedMessages.has(message.id)) {
                // Reply with a specific response
                message.reply('Hello Father.');
                // Add the message ID to the map of replied messages
                repliedMessages.set(message.id, true);
            }
        }
    });

    // Event listener for bot ready event
    client.once('ready', () => {
        console.log('Bot is ready');
        logEvent('bot_login', { botId: client.user.id, timestamp: new Date() });
    });
}

module.exports = handleBotResponses;
