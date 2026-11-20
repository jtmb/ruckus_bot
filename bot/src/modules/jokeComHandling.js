// Handles the two documented joke triggers. `!joke` is explicit; the natural phrase needs a bot mention.
const { fetchJoke } = require("./jokeAPI");
const { safeReply } = require("./safeSend");

// Reports whether the bot was addressed, tolerating both mentions API shapes used by the dispatcher.
function mentionsBot(message, client) {
  if (!message || !message.mentions || !client || !client.user) return false;
  if (typeof message.mentions.has === "function" && message.mentions.has(client.user)) return true;
  const users = message.mentions.users;
  return !!(users && typeof users.has === "function" && users.has(client.user.id));
}

// Returns true only when a documented trigger matched; a bare "tell me a joke" never fetches or replies.
async function handleJokeCommand(message, client) {
  const content = typeof message?.content === "string" ? message.content.toLowerCase() : "";
  const explicit = content.includes("!joke");
  const natural = content.includes("tell me a joke") && mentionsBot(message, client);
  if (!explicit && !natural) return false;
  await safeReply(message, await fetchJoke());
  return true;
}
module.exports = handleJokeCommand;
module.exports.mentionsBot = mentionsBot;
