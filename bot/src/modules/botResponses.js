// botResponses.js
// Imports
const sendRandomQuote = require('./randomQuote');
const { logEvent } = require('./mysql');
const { fetchJoke } = require('./jokeAPI'); // Import fetchJoke function from jokeAPI.js
const handleWeatherCommands = require('./weatherComHandling');
const handleNChainResponse = require('./nChain');
const handleJokeCommand = require('./jokeComHandling');
const handleEasterEgg = require('./easterEgg'); // Import handleEasterEgg function from easterEgg.js
const handleBotReady = require('./isOnline'); // Import handleBotReady function from isOnline.js
const handleInsults = require('./dontTreadOnMe'); // Import handleInsults function from dontTreadOnMe.js
const handleHeadsOrTails = require('./headsOrTails'); // Import handleHeadsOrTails function from headsOrTails.js

// Function to handle bot responses
async function handleBotResponses(client) {
    // Map to track messages the bot has replied to
    const repliedMessages = new Map();

    // Event listener for bot ready event
    client.once('ready', () => {
        handleBotReady(client);
    });

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

        // Handle insults in messages
        const insultReplied = await handleInsults(message, repliedMessages); // Pass repliedMessages here
        if (insultReplied) return; // Return if an insult was replied

        // Handle weather commands
        await handleWeatherCommands(message, client, repliedMessages);

        // Handle N chain responses
        handleNChainResponse(message, client, repliedMessages, logEvent);

        // Handle joke command
        if (await handleJokeCommand(message, client, repliedMessages)) {
            return; // If the joke command was handled, return early
        }

        // Handle Easter egg
        handleEasterEgg(message, repliedMessages);

        // Handle heads or tails command
        if (content.includes(`<@${client.user.id}> flip a coin`)) {
            await handleHeadsOrTails(message);
        }
    });
}

module.exports = handleBotResponses;
