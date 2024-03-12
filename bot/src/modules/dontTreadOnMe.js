const axios = require('axios');
const cheerio = require('cheerio');

// Function to fetch insults from the provided URL
async function fetchInsultsFromURL() {
    try {
        const response = await axios.get('https://www.purgomalum.com/profanitylist.html');
        const $ = cheerio.load(response.data);
        const insultElements = $('ul li'); // Assuming insults are listed as list items within an unordered list
        const insults = insultElements.map((index, element) => $(element).text().trim()).get();
        // console.log("Insults:", insults); // Commented out console.log() statement
        return insults;
    } catch (error) {
        console.error('Error fetching insults from URL:', error.message);
        return [];
    }
}

// Function to fetch an insult from the Evil Insult API
async function fetchInsultFromAPI() {
    try {
        const response = await axios.get('https://evilinsult.com/generate_insult.php?lang=en&type=json');
        const insultData = response.data;
        return insultData.insult;
    } catch (error) {
        console.error('Error fetching insult from API:', error.message);
        return null;
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
async function handleInsults(message, repliedMessages) {
    const insults = await fetchInsultsFromURL();
    const insultRegex = constructInsultRegex(insults);
    const content = message.content;

    // Check if the message content contains an insult using the constructed regular expression
    if (insultRegex.test(content)) {
        // Fetch an insult from the Evil Insult API and reply with it
        const apiInsult = await fetchInsultFromAPI();
        if (apiInsult) {
            await message.reply(apiInsult);
            return true; // Indicate that an insult was replied
        } else {
            console.error("Error fetching insult from API or no insult returned.");
            return false; // Indicate that no insult was replied
        }
    } else {
        return false; // Indicate that no insult was replied
    }
}

module.exports = handleInsults;
