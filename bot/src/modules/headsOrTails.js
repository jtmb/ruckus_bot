const { safeReply, safeSend } = require("./safeSend");

const coinFlip = () => (Math.random() < 0.5 ? "Heads" : "Tails");

async function handleHeadsOrTails(message) {
  const content = message.content.toLowerCase();
  if (!content.includes("!flipacoin")) return false;
  const heads = content.indexOf("heads");
  const choiceIndex = heads !== -1 ? heads : content.indexOf("tails");
  if (choiceIndex === -1) {
    await safeReply(message, 'Please specify either "heads" or "tails" in your command.');
    return true;
  }
  const choice = content.slice(choiceIndex, choiceIndex + 5);
  await safeSend(message.channel, `You chose ${choice}. The result is ${coinFlip()}.`);
  return true;
}
module.exports = handleHeadsOrTails;
module.exports.coinFlip = coinFlip;
