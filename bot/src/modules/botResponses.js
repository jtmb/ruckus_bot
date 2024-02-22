// botResponses.js
// Imports
const sendRandomQuote = require('./randomQuote'); // Import the sendRandomQuote function from randomQuote module
const { handleWeatherCommand } = require('./weatherAPI'); // Import the handleWeatherCommand function from weatherAPI module

// Variable to track if 'g' has been replied to in the N chain
let gReplied = false;

// Function to handle bot responses
function handleBotResponses(client) {
    // Map to track messages the bot has replied to
    const repliedMessages = new Map();

    // Event listener for messageCreate event
    client.on('messageCreate', async (message) => {
        const content = message.content.toLowerCase(); // Convert message content to lowercase for case-insensitive matching

        // Check if the message author is the bot itself
        if (message.author.bot) return;

        // Weather command handling
        if (content.startsWith('weather in')) {
            await handleWeatherCommand(message);
            return;
        }

        // Define message-response pairs for the N chain
        const responses = {
            'n': 'i',
            'i': 'g',
            'g': 'e',
            'e': 'r',
        };

        // Check if the message content matches any key in the responses object
        if (responses.hasOwnProperty(content)) {
            // If the content is 'g' and 'g' has not been replied to yet
            if (content === 'g' && !gReplied) {
                message.reply('g'); // Send 'g' a second time
                gReplied = true; // Set gReplied to true to indicate that 'g' has been replied to
            } else {
                // Respond with the corresponding value from the responses object
                message.reply(responses[content]);
            }
        }

        // Check if the bot was mentioned in the message
        if (message.mentions.users.has(client.user.id)) {
            // Reply to the user who mentioned the bot with a random quote
            const randomQuote = sendRandomQuote(); // Call the sendRandomQuote function
            message.reply(randomQuote);
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
}

// Export the function
module.exports = handleBotResponses;
