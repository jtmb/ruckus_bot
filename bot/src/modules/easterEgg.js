// easterEgg.js

async function handleEasterEgg(message, repliedMessages) {
    const content = message.content.toLowerCase();

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
}

module.exports = handleEasterEgg;
