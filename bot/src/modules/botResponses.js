// botResponses.js
const sendRandomQuote = require("./randomQuote");
const { logEvent } = require("./mysql");
const { handleWeatherCommands } = require("./weatherHandling");
const handleNChainResponse = require("./nChain");
const handleJokeCommand = require("./jokeComHandling");
const handleEasterEgg = require("./easterEgg");
const handleInsults = require("./dontTreadOnMe");
const handleHeadsOrTails = require("./headsOrTails");
const handleGameGiveaways = require("./gameGiveaways");
const Dedupe = require("./dedupe");
const { safeSend } = require("./safeSend");
const { getCommandList, getHelpList, setBotId } = require("./commandList");

const handlers = [handleWeatherCommands, handleNChainResponse, handleJokeCommand, handleEasterEgg, handleInsults, handleHeadsOrTails];

// Processes one message. Exported separately so it can be tested without Discord.
async function processMessage(message, client, replied, log = logEvent) {
  // Configure help text with the live Discord client id (never hardcoded) before any reply.
  setBotId(client.user && client.user.id);
  if (replied.has(message.id)) return;
  if (message.author.bot) return;
  const content = message.content.toLowerCase();
  replied.set(message.id);

  log("user_interaction", {
    userId: message.author.id,
    username: message.author.username,
    messageContent: message.content,
    timestamp: new Date(),
    channelId: message.channel.id,
    guildId: message.guild ? message.guild.id : null,
  });

  let handled = false;
  if (content.includes("!freegames") || (message.mentions.users.has(client.user.id) && content.includes("free games"))) {
    await handleGameGiveaways(message);
    handled = true;
  }
  if (!handled) {
    for (const handler of handlers) {
      if (await handler(message, client, replied, log)) { handled = true; break; }
    }
  }
  if (handled) return;

  if (content === "!commands") await safeSend(message.channel, getCommandList());
  if (content === "!help") await safeSend(message.channel, getHelpList());

  if (message.mentions.has(client.user) && !content.includes("flip a coin")) {
    await safeSend(message.channel, sendRandomQuote());
  }
}

function handleBotResponses(client) {
  const replied = new Dedupe();
  client.on("messageCreate", (message) => {
    processMessage(message, client, replied).catch((e) => console.error("Message handling failed:", e.message));
  });
}

module.exports = handleBotResponses;
module.exports.processMessage = processMessage;
