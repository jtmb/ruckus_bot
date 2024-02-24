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


// Function to handle weather commands
async function handleWeatherCommand(messageContent) {
    // Extract city name from message content
    const cityRegex = /(?:\bin\b\s+)?(.+)/i;
    const match = messageContent.match(cityRegex);
    let city = '';

    if (match && match[1]) {
        city = match[1].trim().toLowerCase();
    }

    if (!city) {
        console.error('City name is missing.');
        return 'City name is missing.';
    }

    try {
        const weatherData = await getWeather(city);
        if (weatherData.description && weatherData.temperature && weatherData.cityName) {
            // Weather data retrieved successfully
            return { cityName: weatherData.cityName, description: weatherData.description, temperature: weatherData.temperature };
        } else {
            // Weather data is incomplete
            console.error('Incomplete weather data:', weatherData);
            return null;
        }
    } catch (error) {
        console.error('Error fetching weather:', error.message);
        // Check if the error message indicates city not found
        if (error.message.includes('city not found')) {
            return 'City not found. Please provide a valid city name.';
        } else {
            return 'An error occurred while fetching weather data. Please try again later.';
        }
    }
}


// Export the handleWeatherCommand function
module.exports = {
    handleWeatherCommand
};