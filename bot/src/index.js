// index.js
const { Client, IntentsBitField, Events } = require("discord.js");
const handleBotResponses = require("./modules/botResponses");
const handleBotReady = require("./modules/isOnline");
const { createTablesIfNotExists } = require("./modules/mysql");
const botToken = require("./modules/validateToken")();
const handleInsults = require("./modules/dontTreadOnMe");

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildVoiceStates,
  ],
});

client.on("error", (error) => console.error("Client encountered an error:", error));
client.on("shardDisconnect", (event) => console.log("Client disconnected with event:", event && event.code));

// Single ready handler (discord.js >= 14.22 names it clientReady).
client.once(Events.ClientReady, () => handleBotReady(client));
handleBotResponses(client);

// Explicit provider startup: the insult module performs no I/O at import. Prewarm and the bounded
// refresh timer start here only, so tests can import handlers without any network access.
void handleInsults.start();

process.on("unhandledRejection", (r) => console.error("Unhandled rejection:", r));

createTablesIfNotExists().finally(() => {
  client.login(botToken).catch((e) => {
    console.error("Discord login failed:", e.message);
    process.exit(1);
  });
});

const stop = () => {
  handleInsults.teardown();
  client.destroy().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
