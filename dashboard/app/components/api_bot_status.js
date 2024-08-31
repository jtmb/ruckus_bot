export async function fetchBotStatus(apiEndpoint) {
    try {
        const response = await fetch(`${apiEndpoint}/bot/logins`); // Assuming /bot/logins is the correct endpoint
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const result = await response.json();
        console.log('Fetched bot status:', result); // Debugging line

        // Extract and transform the data based on the actual response
        if (result.length > 0) {
            const latestStatus = result[0];
            const eventData = JSON.parse(latestStatus.event_data);

            return {
                botName: eventData.botName || '',
                isBotUp: eventData.botId ? true : false, // Determine if bot is up
                guilds: eventData.guilds ? eventData.guilds.map(guild => guild.name) : []
            };
        }

        return {
            botName: '',
            isBotUp: false,
            guilds: []
        };
    } catch (error) {
        console.error('Error fetching bot status:', error);
        return {
            botName: '',
            isBotUp: false,
            guilds: []
        };
    }
}
