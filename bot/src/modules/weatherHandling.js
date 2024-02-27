// weatherHandling.js
// Import node-fetch using dynamic import
async function getWeather(city) {
    try {
        const apiKey = process.env.OPENWEATHERMAP_API_KEY; // Retrieve API key from environment variable
        if (!apiKey) {
            console.error('OPENWEATHERMAP_API_KEY environment variable is not set.');
            throw new Error('API key not found.');
        }
        
        const fetch = await import('node-fetch');
        const response = await fetch.default(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
        const data = await response.json();

        console.log('API Response:', data); // Log the API response for debugging

        if (response.ok) {
            const weatherDescription = data.weather[0].description;
            const temperature = data.main.temp;
            return { description: weatherDescription, temperature: temperature, cityName: city };
        } else if (response.status === 404) {
            console.error('City not found:', city);
            return 'City not found. Please provide a valid city name.';
        } else {
            console.error('Error fetching weather data:', data.message || 'Unknown error');
            return 'Unable to fetch weather data. Please try again later.';
        }
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return 'An error occurred while fetching weather data. Please try again later.';
    }
}

async function handleWeatherCommands(message, client, repliedMessages) {
    const content = message.content.toLowerCase();

    // Check if the message mentions the bot and mentions weather without specifying the city
    if (message.mentions.has(client.user) && content.includes('weather')) {
        // Extract the city name from the command
        const cityRegex = /weather\s+(.+)/i;
        const match = content.match(cityRegex);
        if (match && match[1]) {
            const city = match[1].trim();
            try {
                // Call getWeather with the city
                const weatherData = await getWeather(city);
                // Send weather information back to the user
                if (weatherData) {
                    message.reply(`The current weather in ${weatherData.cityName} is ${weatherData.description} with a temperature of ${weatherData.temperature}°C.`);
                    // Add the message ID to the map of replied messages
                    repliedMessages.set(message.id, true);
                } else {
                    message.reply('Sorry, I could not retrieve the weather information for that city.');
                }
            } catch (error) {
                console.error('Error fetching weather information:', error.message);
                message.reply('Sorry, I encountered an error while fetching the weather information.');
            }
            return true;
        } else {
            // Extract the city name from the message content
            const city = content.replace(/<[^>]*>/g, ''); // Remove any Discord mentions
            try {
                // Call getWeather with the city
                const weatherData = await getWeather(city);
                // Send weather information back to the user
                if (weatherData) {
                    message.reply(`The current weather in ${weatherData.cityName} is ${weatherData.description} with a temperature of ${weatherData.temperature}°C.`);
                } else {
                    message.reply('Sorry, I could not retrieve the weather information for that city.');
                }
            } catch (error) {
                console.error('Error fetching weather information:', error.message);
                message.reply('Sorry, I encountered an error while fetching the weather information.');
            }
            return true;
        }
    }

    return false;
}

module.exports = {
    handleWeatherCommands
};
