const { Client, IntentsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

// Variable to track if 'g' has been replied to in the N chain
let gReplied = false;

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

// Event listener for messageCreate event
client.on('messageCreate', (message) => {
    const content = message.content.toLowerCase(); // Convert message content to lowercase for case-insensitive matching

    // Define message-response pairs for the N chain
    const responses = {
        'n': 'i',
        'i': 'g',
        'g': 'e',
        'e': 'r',
    };

    // Check if the message author is the bot itself
    if (message.author.bot) return;

    // Check if the message content matches any key in the responses object
    if (responses.hasOwnProperty(content)) {
        // If the content is 'g' and 'g' has not been replied to yet
        if (content === 'g' && !gReplied) {
            message.reply('g'); // Send 'g' a second time
            gReplied = true; // Set gReplied to true to indicate that 'g' has been replied to
        } else {
            // Respond with the corresponding value from the responses object
            message.reply(responses[content]);
        }
    }

    // Check if the bot was mentioned in the message
    if (message.mentions.users.has(client.user.id)) {
        // Reply to the user who mentioned the bot with a random quote
        const randomQuote = sendRandomQuote();
        message.reply(randomQuote);
    }

    // Check if the message author's ID matches the specified ID and the message content matches the specific phrase
    if (message.author.id === '151170388708032512' && content === 'hello my child') {
        // Reply with a specific response
        message.reply('Hello Father.');
    }
});

// Event listener that checks if the bot is online and sends console log when client is on.
client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online.`);
    sendRandomQuoteIfNeeded(); // Send a random quote when the bot is ready
    setInterval(sendRandomQuoteIfNeeded, 60 * 60 * 1000); // Check every hour if a random quote needs to be sent
});


// Event listener that logs the bot in with token from environment variable
// client.login(botToken);

// Event listener that logs the bot in with token (without docker).
client.login('OTIyNTc5MjY5NjM5NjE4NjQw.Ge2dfm.bj3QXqydEIf5H9eNopLZUWq9qELRR54UFnL3aE');
