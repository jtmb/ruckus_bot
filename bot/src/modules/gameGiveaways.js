// gameGiveaways
const axios = require('axios');
const { Client, MessageEmbed } = require('discord.js');

// Function to handle game giveaways
async function handleGameGiveaways(message) {
    // Fetch game giveaways data from the API
    try {
        const response = await axios.get('https://www.gamerpower.com/api/giveaways?platform=pc&type=game');
        const giveaways = response.data;

        // Create an embed for each giveaway
        const embeds = [];
        giveaways.forEach(giveaway => {
            const embed = {
                title: giveaway.title,
                description: `${giveaway.description}\n\n**Worth**: ${giveaway.worth}\n**Platforms**: ${giveaway.platforms}\n**End Date**: ${new Date(giveaway.end_date).toLocaleString()}`,
                fields: [
                    { name: 'Instructions', value: giveaway.instructions }
                ],
                thumbnail: { url: giveaway.thumbnail },
                image: { url: giveaway.image },
                url: giveaway.open_giveaway_url,
                color: 39423 // You can specify the color if needed
            };
            embeds.push(embed);
        });

        // Send each embed
        embeds.forEach(embed => {
            // Check if the embed contains fields
            if (embed.fields.length > 0) {
                message.channel.send({ embeds: [embed] });
            } else {
                console.error('Embed does not contain required fields:', embed);
            }
        });
    } catch (error) {
        console.error('Error fetching or sending game giveaways:', error.message);
    }
}

module.exports = handleGameGiveaways;
