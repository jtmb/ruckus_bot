// weatherAPI.js

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

        if (response.ok) {
            const weatherDescription = data.weather[0].description;
            const temperature = data.main.temp;
            return { description: weatherDescription, temperature: temperature, cityName: city };
        } else {
            console.error('Error fetching weather data:', data.message || 'Unknown error');
            return 'Unable to fetch weather data. Please try again later.';
        }
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return 'An error occurred while fetching weather data. Please try again later.';
    }
}

// Function to handle weather commands
async function handleWeatherCommand(message) {
    const content = message.content.toLowerCase();
    const match = content.match(/weather\s+in\s+(\w+)/);
    if (match) {
        const city = match[1];
        try {
            const weatherData = await getWeather(city); // Correct function call
            // Include additional weather information in the response
            message.reply(`The current weather in ${weatherData.cityName} is ${weatherData.description} with a temperature of ${weatherData.temperature}°C.`);
        } catch (error) {
            console.error('Error fetching weather:', error.message);
            message.reply('Sorry, I could not retrieve the weather information for that city.');
        }
    }
}

// Export the getWeather and handleWeatherCommand functions
module.exports = {
    getWeather,
    handleWeatherCommand
};
