// Sends are awaited and failures are logged, never thrown into the event loop.
async function safeReply(message, content) {
  if (typeof content === "string" && content.trim() === "") return false;
  try { await message.reply(content); return true; }
  catch (e) { console.error("Reply failed:", e.message); return false; }
}
async function safeSend(channel, content) {
  if (typeof content === "string" && content.trim() === "") return false;
  try { await channel.send(content); return true; }
  catch (e) { console.error("Send failed:", e.message); return false; }
}
module.exports = { safeReply, safeSend };
