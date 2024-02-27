// dontTreadOnMe.js

const axios = require('axios');
const cheerio = require('cheerio');
const sendRandomQuote = require('./randomQuote');

// Function to fetch insults from the Wikipedia page
async function fetchInsultsFromWikipedia() {
    try {
        const response = await axios.get('https://en.wikipedia.org/wiki/Category:English_profanity');
        const $ = cheerio.load(response.data);
        const insultElements = $('.mw-category li a'); // Assuming insults are listed as links within list items
        const insults = insultElements.map((index, element) => $(element).text().trim()).get();
        return insults;
    } catch (error) {
        console.error('Error fetching insults from Wikipedia:', error.message);
        return [];
    }
}

// Function to construct a regular expression pattern from the list of insults
function constructInsultRegex(insults) {
    const escapedInsults = insults.map(insult => escapeRegExp(insult));
    const pattern = `\\b(?:${escapedInsults.join('|')})\\b`;
    return new RegExp(pattern, 'i');
}

// Function to escape special characters in a string for use in a regular expression
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to handle insults in messages
async function handleInsults(message) {
    const insults = await fetchInsultsFromWikipedia();
    const insultRegex = constructInsultRegex(insults);
    const content = message.content;

    // Check if the message content contains an insult using the constructed regular expression
    if (insultRegex.test(content)) {
        // Fetch an insult and reply with it
        const insult = insults[Math.floor(Math.random() * insults.length)];
        message.reply(insult);
    } else {
        // If the message is not an insult, respond with a random quote
        const randomQuote = sendRandomQuote();
        message.reply(randomQuote);
    }
}

module.exports = handleInsults;
