// headsOrTails.js

// Import the necessary modules
const { MessageCollector } = require('discord.js');

// Function to generate a random number between 0 and 1
function getRandomNumber() {
    return Math.random();
}

// Function to determine the result of the coin flip
function coinFlip() {
    const randomNumber = getRandomNumber();
    return randomNumber < 0.5 ? 'Heads' : 'Tails';
}

// Define a global variable to track if a coin flip game is in progress
let coinFlipInProgress = false;

async function handleHeadsOrTails(message) {
    try {
        // Check if the message contains the "flip a coin" command
        if (message.content.toLowerCase().includes('!flipacoin')) {
            // Parse the user's command
            const content = message.content.toLowerCase();
            const choiceIndex = content.indexOf('heads') !== -1 ? content.indexOf('heads') : content.indexOf('tails');
            if (choiceIndex === -1) {
                await message.reply('Please specify either "heads" or "tails" in your command.');
                return;
            }
            const choice = content.substr(choiceIndex, 5); // Extract "heads" or "tails" from the message
            const result = coinFlip();
            await message.channel.send(`You chose ${choice}. The result is ${result}.`);
        } else {
            // If the message is not a "flip a coin" command, do nothing
            return;
        }
    } catch (error) {
        console.error('Error in handleHeadsOrTails:', error);
    }
}

module.exports = handleHeadsOrTails;

