// nChain.js — per-channel chain state with 10 minute expiry. Never sends an empty message.
const { safeReply } = require("./safeSend");

const responses = { n: "i", i: "g", g: "e", e: "r" };
const EXPIRY_MS = 10 * 60 * 1000;
const state = new Map(); // channelId -> { gReplied, at }

function getState(channelId, now) {
  const s = state.get(channelId);
  if (!s || now - s.at > EXPIRY_MS) { state.delete(channelId); return { gReplied: false, at: now }; }
  return s;
}

async function handleNChainResponse(message, client, repliedMessages, logEvent) {
  const content = message.content.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(responses, content)) return false;

  const now = Date.now();
  const channelId = message.channel ? message.channel.id : "dm";
  const s = getState(channelId, now);

  if (content === "g" && !s.gReplied) {
    await safeReply(message, "g");
    state.set(channelId, { gReplied: true, at: now });
    if (state.size > 1000) state.delete(state.keys().next().value);
  } else if (content === "e" && !s.gReplied) {
    // Chain not in progress for this channel: stay silent rather than send an empty message.
  } else {
    const response = responses[content];
    await safeReply(message, response);
    if (content === "e") state.delete(channelId);
    logEvent("bot_response", { eventType: "N_chain_response", responseData: response, timestamp: new Date() });
  }
  return true;
}

handleNChainResponse._state = state;
module.exports = handleNChainResponse;
