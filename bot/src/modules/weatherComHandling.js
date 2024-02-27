// weatherComHandling.js
// Imports
const { getWeather } = require('./weatherAPI');

// Variable to track if the bot is waiting for the city after asking
let awaitingCity = false;

// Function to handle weather commands
async function handleWeatherCommands(message, client, repliedMessages) {
    const content = message.content.toLowerCase();

    // Check if the bot is awaiting the city
    if (awaitingCity) {
        // Extract the city name from the message content
        const city = content.trim();
        try {
            // Call getWeather with the city
            const weatherData = await getWeather(city);
            // Send weather information back to the user
            if (weatherData && weatherData.description && weatherData.temperature && weatherData.cityName) {
                message.reply(`The current weather in ${weatherData.cityName} is ${weatherData.description} with a temperature of ${weatherData.temperature}°C.`);
            } else {
                message.reply('Sorry, I could not retrieve the weather information for that city.');
            }
        } catch (error) {
            console.error('Error fetching weather information:', error.message);
            message.reply('Sorry, I encountered an error while fetching the weather information.');
        }
        // Reset awaitingCity flag
        awaitingCity = false;
        return;
    }

    // Check if the message mentions the bot and mentions weather without specifying the city
    if (message.mentions.has(client.user) && content.includes('weather')) {
        // Reply to the user asking for the city
        message.reply('What city do you want the weather for?');
        // Set awaitingCity flag to true
        awaitingCity = true;
        // Add the message ID to the map of replied messages
        repliedMessages.set(message.id, true);
        return;
    }
}

module.exports = handleWeatherCommands;
