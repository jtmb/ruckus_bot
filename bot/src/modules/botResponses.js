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
        const weatherCommandHandled = await handleWeatherCommands(message, client, repliedMessages);
        if (weatherCommandHandled) return; // Return if a weather command was handled

        // Handle N chain responses
        handleNChainResponse(message, client, repliedMessages, logEvent);

        // Handle joke command
        const jokeCommandHandled = await handleJokeCommand(message, client, repliedMessages);
        if (jokeCommandHandled) return; // Return if a joke command was handled

        // Handle Easter egg
        handleEasterEgg(message, repliedMessages);

        // Handle heads or tails command
        if (content.includes(`<@${client.user.id}> flip a coin`)) {
            await handleHeadsOrTails(message);
            return;
        }

        // If none of the above commands are detected and the bot is mentioned
        if (message.mentions.users.has(client.user.id)) {
            // Do nothing if a weather command was detected
            return;
        }

        // If the bot is mentioned without any recognized command
        // Send a random quote
        const randomQuote = sendRandomQuote();
        await message.channel.send(randomQuote);
    });
}

module.exports = handleBotResponses;
