const { Client, IntentsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Read bot token from environment variable
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
    console.error("Bot token not provided in the environment variable BOT_TOKEN");
    process.exit(1); // Exit the process if bot token is not provided
}

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ]
});

// Path to the ruckus_quotes.txt file
const quotesFilePath = path.join(__dirname, 'ruckus_quotes.txt');

// Function to read quotes from the file
function readQuotes() {
    const quotes = fs.readFileSync(quotesFilePath, 'utf-8').split('\n').filter(Boolean);
    return quotes;
}

// Function to send a random quote
function sendRandomQuote() {
    const quotes = readQuotes();
    const randomIndex = Math.floor(Math.random() * quotes.length);
    const randomQuote = quotes[randomIndex];
    return randomQuote;
}

// Function to send a random quote if 6 hours have passed since the previous message
function sendRandomQuoteIfNeeded() {
    const lastMessageTime = client.lastMessageTime || 0;
    const currentTime = Date.now();
    const elapsedTime = currentTime - lastMessageTime;
    const sixHoursInMilliseconds = 6 * 60 * 60 * 1000;

    if (elapsedTime >= sixHoursInMilliseconds) {
        const randomQuote = sendRandomQuote();
        const channel = client.channels.cache.get('954101828025450500'); // Replace 'YOUR_CHANNEL_ID' with the ID of the channel where you want to send the quotes
        if (channel) {
            channel.send(randomQuote);
            client.lastMessageTime = currentTime;
        }
    }
}

// Event listener that checks if the bot is online and sends console log when client is on.
client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online.`);
    sendRandomQuoteIfNeeded(); // Send a random quote when the bot is ready
    setInterval(sendRandomQuoteIfNeeded, 60 * 60 * 1000); // Check every hour if a random quote needs to be sent
});

// Event listener for messageCreate event
client.on('messageCreate', (message) => {
    const botMention = message.mentions.users.has(client.user.id);
    
    // Check if the bot was mentioned in the message
    if (botMention) {
        // Reply to the user who mentioned the bot with a random quote
        const randomQuote = sendRandomQuote();
        message.reply(randomQuote);
    }
});

// Event listener that logs the bot in with token from environment variable
client.login(botToken);

// Event listener that logs the bot in with token (without docker).
// client.login('TOKEN_HERE');
