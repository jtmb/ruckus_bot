const axios = require('axios');
const { MessageEmbed } = require('discord.js');

// Function to fetch game giveaways from the provided API
async function fetchGameGiveaways() {
    try {
        const response = await axios.get('https://www.gamerpower.com/api/giveaways?platform=pc&type=game');
        return response.data;
    } catch (error) {
        console.error('Error fetching game giveaways:', error.message);
        return [];
    }
}

// Function to handle game giveaway command
async function handleGameGiveaways(message) {
    const content = message.content.toLowerCase();

    // Check if the message contains the trigger phrase
    if (content.includes('game giveaways')) {
        // Fetch game giveaways from the API
        const giveaways = await fetchGameGiveaways();

        // Check if there are any giveaways
        if (giveaways.length > 0) {
            // Create an embed for each giveaway
            giveaways.forEach(giveaway => {
                const embed = new MessageEmbed()
                    .setTitle(giveaway.title)
                    .setURL(giveaway.open_giveaway_url)
                    .setDescription(giveaway.description)
                    .setColor('#0099ff')
                    .addField('Ends At', giveaway.end_date);

                message.channel.send({ embeds: [embed] });
            });
        } else {
            message.channel.send('No game giveaways found.');
        }
    }
}

module.exports = handleGameGiveaways;
