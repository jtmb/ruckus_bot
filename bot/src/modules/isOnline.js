const { logEvent, writeHeartbeat } = require("./mysql");

const HEARTBEAT_MS = 30000;
let timer = null;

async function retryLogEvent(eventType, eventData, retries = 3, delay = 15000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        logEvent(eventType, eventData, (error) => (error ? reject(error) : resolve()));
      });
      console.log("Log event successful");
      return;
    } catch (error) {
      console.error(`Log event failed (attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) await new Promise((r) => setTimeout(r, delay));
      else console.error("Failed to log event after multiple attempts");
    }
  }
}

function handleBotReady(client) {
  if (!client || !client.user) {
    console.error("Error: Client object or client.user is null.");
    return;
  }
  const botId = client.user.id;
  const botName = client.user.username;
  const guilds = client.guilds.cache;
  const startedAt = new Date();

  if (guilds.size > 0) {
    console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}`);
    console.log("Connected Guilds:");
    guilds.forEach((guild) => console.log(`- ${guild.name} (ID: ${guild.id})`));
  } else {
    console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}. No connected guilds found.`);
  }

  retryLogEvent("bot_login", {
    botId,
    botName,
    guilds: guilds.map((guild) => ({ id: guild.id, name: guild.name })),
    timestamp: new Date(),
  });

  if (timer) clearInterval(timer);
  const beat = () => writeHeartbeat(client, startedAt).catch((e) => console.error("Heartbeat failed:", e.message));
  beat();
  timer = setInterval(beat, HEARTBEAT_MS);
  timer.unref();
}

module.exports = handleBotReady;
