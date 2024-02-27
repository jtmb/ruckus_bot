// Imports
const sendRandomQuote = require('./randomQuote');
const { logEvent } = require('./mysql');
const { handleWeatherCommand } = require('./weatherAPI');
const { fetchJoke } = require('./jokeAPI'); // Import fetchJoke function from jokeAPI.js

// Variable to track if 'g' has been replied to in the N chain
let gReplied = false;

// Variable to track if the bot is waiting for the city after asking
let awaitingCity = false;

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

        // Check if the bot is awaiting the city
        if (awaitingCity) {
            // Parse the city from the message content
            const city = content.trim();
            // Reset awaitingCity flag
            awaitingCity = false;
            // Call handleWeatherCommand with the city
            const weatherData = await handleWeatherCommand(city);
            // Send weather information back to the user
            if (weatherData) {
                message.reply(`The current weather in ${weatherData.cityName} is ${weatherData.description} with a temperature of ${weatherData.temperature}°C.`);
            } else {
                message.reply('Sorry, I could not retrieve the weather information for that city.');
            }
            return;
        }

        // Weather command handling
        if (content.startsWith('weather in')) {
            // Pass the city name to handleWeatherCommand instead of the message object
            const city = content.substring('weather in'.length).trim();
            await handleWeatherCommand(city);
            return;
        }

        // Check if the message mentions the bot and mentions weather without specifying the city
        if (message.mentions.users.has(client.user.id) && content.includes('weather')) {
            // Reply to the user asking for the city
            message.reply('What city you want the weather for, boy?');
            // Set awaitingCity flag to true
            awaitingCity = true;
            // Add the message ID to the map of replied messages
            repliedMessages.set(message.id, true);
            return;
        }

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
                const response = responses[content];
                message.reply(response);
                // Log the bot response to the N chain
                logEvent('bot_response', {
                    eventType: 'N_chain_response',
                    responseData: response,
                    timestamp: new Date()
                });
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

    // Event listener for bot ready event
    client.once('ready', () => {
        console.log('Bot is ready');
        logEvent('bot_login', { botId: client.user.id, timestamp: new Date() });
    });
}

module.exports = handleBotResponses;
