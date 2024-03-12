// jokeComHandling.js

const { fetchJoke } = require('./jokeAPI');

async function handleJokeCommand(message, client, repliedMessages) {
    const content = message.content.toLowerCase();

    // Check if the message mentions the bot and mentions a joke
    if (content.includes('!joke') || (message.mentions.users.has(client.user.id) && (content.includes('!joke')) || content.includes('tell me a joke'))) {
        // Fetch a joke from the JokeAPI
        const joke = await fetchJoke();
        // Reply to the user with the fetched joke
        message.reply(joke);
        // Add the message ID to the map of replied messages
        repliedMessages.set(message.id, true);
        return true; // Indicate that the joke command was handled
    }

    return false; // Indicate that the joke command was not handled
}

module.exports = handleJokeCommand;
