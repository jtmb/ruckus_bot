// randomQuote.js

const fs = require('fs');
const path = require('path');

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

module.exports = sendRandomQuote; // Export the sendRandomQuote function
