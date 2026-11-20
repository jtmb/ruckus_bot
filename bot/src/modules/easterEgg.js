const { safeReply } = require("./safeSend");
async function handleEasterEgg(message) {
  const content = message.content.toLowerCase();
  if (message.author.id === "151170388708032512" && content === "hello my child") {
    await safeReply(message, "Hello Father.");
    return true;
  }
  return false;
}
module.exports = handleEasterEgg;
