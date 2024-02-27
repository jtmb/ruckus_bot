// Imports
const { handleWeatherCommand } = require('./weatherAPI');

// Variable to track if the bot is waiting for the city after asking
let awaitingCity = false;

// Function to handle weather commands
async function handleWeatherCommands(message, client, repliedMessages) {
    const content = message.content.toLowerCase();

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
}

module.exports = handleWeatherCommands;
