// Function to get the list of available bot commands
const handleBotReady = require("./isOnline");
let botId = handleBotReady.botId;

function getHelpList(botId) {
  const queryInterval = process.env.QUERY_INTERVAL || 60; // Default interval: 60 seconds if not defined
  return (
    "## Available commands:\n" +
    "\n" +
    "- `!flipacoin HEADS_OR_TAILS` - flip a coin.\n" +
    `- \`!weather in YOUR_CITY_HERE\` or <@!${botId}> and say 'weather in YOUR_CITY_HERE' - Get weather information in your city.\n` +
    `- \`!freegames\` or <@!${botId}> and say 'free games' - Get a list of free to keep games across multiple distribution platforms.\n` +
    `- \`!joke\` or <@!${botId}> and say 'tell me a joke' - I will tell you a joke.\n` +
    "- `!help` - Display the full help dialog.\n" +
    "- `!commands` - Display only the list of available commands" +
    "\n" +
    "### 🤖 Automated Tasks:\n\n" +
    "\n" +
    "- I am logging all messages so I may respond to them properly.\n" +
    "- I am compelled to complete very special word chains.\n\n" + // Add an extra newline here
    "https://www.youtube.com/watch?v=QQbBzOvPBpc"
  ); // Direct link to the GIF
}

// Function to get the list of available bot commands
function getCommandList() {
  const queryInterval = process.env.QUERY_INTERVAL || 60; // Default interval: 60 seconds if not defined
  const botId = handleBotReady.botId;
  return (
    "## Available commands:\n" +
    "\n" +
    "- `!flipacoin HEADS_OR_TAILS` - flip a coin.\n" +
    `- \`!weather in YOUR_CITY_HERE\` or <@!${botId}> and say 'weather in YOUR_CITY_HERE' - Get weather information in your city.\n` +
    `- \`!freegames\` or <@!${botId}> and say 'free games' - Get a list of free to keep games across multiple distribution platforms.\n` +
    `- \`!joke\` or <@!${botId}> and say 'tell me a joke' - I will tell you a joke.\n` +
    "- `!help` - Display the full help dialog.\n" +
    "- `!commands` - Display only the list of available commands" +
    "\n"
  );
}

// Export the getCommandList function
module.exports = { getCommandList, getHelpList };
