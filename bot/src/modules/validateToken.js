function validateToken_export() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error("Bot token not provided in the environment variable BOT_TOKEN");
    process.exit(1);
  }
  return botToken;
}
module.exports = validateToken_export;
