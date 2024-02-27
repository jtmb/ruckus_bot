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
      // Check if a coin flip game is already in progress
      if (coinFlipInProgress) {
        await message.reply('A coin flip game is already in progress. Please wait for the current game to finish.');
        return;
      }
  
      // Set the flag indicating that a coin flip game is now in progress
      coinFlipInProgress = true;

      // Parse the user's command
      const content = message.content.toLowerCase();
      const choiceIndex = content.indexOf('heads') !== -1 ? content.indexOf('heads') : content.indexOf('tails');
      if (choiceIndex === -1) {
        await message.reply('Please specify either "heads" or "tails" in your command.');
        coinFlipInProgress = false;
        return;
      }

      const choice = content.substr(choiceIndex, 5); // Extract "heads" or "tails" from the message
      const result = coinFlip();
      await message.channel.send(`You chose ${choice}. The result is ${result}.`);
  
      // Reset the flag indicating that a coin flip game is in progress
      coinFlipInProgress = false;
    } catch (error) {
      console.error('Error in handleHeadsOrTails:', error);
      // Reset the flag indicating that a coin flip game is in progress in case of error
      coinFlipInProgress = false;
    }
}

module.exports = handleHeadsOrTails;
