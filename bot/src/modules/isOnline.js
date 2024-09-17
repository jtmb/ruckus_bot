const { logEvent } = require("./mysql");

// Helper function to retry logging
async function retryLogEvent(eventType, eventData, retries = 3, delay = 15000) {
  let attempt = 0;

  while (attempt < retries) {
    try {
      await new Promise((resolve, reject) => {
        logEvent(eventType, eventData, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      console.log("Log event successful");
      return; // Exit if logEvent is successful
    } catch (error) {
      attempt++;
      console.error(`Log event failed (attempt ${attempt}/${retries}):`, error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      } else {
        console.error("Failed to log event after multiple attempts");
      }
    }
  }
}

function handleBotReady(client) {
  console.log("Checking client object:", client);
  if (!client || !client.user) {
    console.error("Error: Client object or client.user is null.");
    return;
  }

  const botId = client.user.id;
  const botName = client.user.username;

  // Get all guilds the bot is connected to
  const guilds = client.guilds.cache;
  if (guilds.size > 0) {
    console.log(`Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}`);
    console.log("Connected Guilds:");

    guilds.forEach((guild) => {
      console.log(`- ${guild.name} (ID: ${guild.id})`);
    });

    // Log event with all guilds
    retryLogEvent("bot_login", {
      botId,
      botName,
      guilds: guilds.map((guild) => ({ id: guild.id, name: guild.name })),
      timestamp: new Date(),
    });
  } else {
    console.log(
      "Bot is Online ✅ Bot ID: ${botId}, Bot Name: ${botName}. No connected guilds found."
    );
    // Log event with no guilds
    retryLogEvent("bot_login", {
      botId,
      botName,
      guilds: [],
      timestamp: new Date(),
    });
  }
}

module.exports = handleBotReady;
