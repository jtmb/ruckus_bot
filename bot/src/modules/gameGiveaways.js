// Builds one bounded digest for the !freegames command. Provider values are sanitised before they reach
// Discord: malformed items and missing fields never produce "undefined", "null" or "Invalid Date".
const { safeSend } = require("./safeSend");

const GIVEAWAYS_URL = "https://www.gamerpower.com/api/giveaways?platform=pc&type=game";
const MAX_EMBEDS = 10;
const CHAR_BUDGET = 5500;

// Coerces a provider scalar to a bounded string; anything else becomes empty (never "undefined"/"null").
function safeText(value, max) {
  let s = "";
  if (typeof value === "string") s = value;
  else if (typeof value === "number" && Number.isFinite(value)) s = String(value);
  if (!s || /^(undefined|null)$/i.test(s.trim())) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Formats a provider end date or returns empty for malformed/missing dates (no "Invalid Date").
function formatEndDate(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

// Accepts only absolute http(s) URLs so a bad value cannot break the embed.
function safeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

// Converts a raw provider list into at most 10 embeds within the character budget.
function buildEmbeds(giveaways) {
  if (!Array.isArray(giveaways)) return [];
  const items = giveaways.filter((g) => g && typeof g === "object" && !Array.isArray(g));
  const embeds = [];
  let budget = CHAR_BUDGET;
  for (const g of items.slice(0, MAX_EMBEDS)) {
    const parts = [];
    const description = safeText(g.description, 500);
    if (description) parts.push(description);
    const worth = safeText(g.worth, 100);
    if (worth) parts.push(`**Worth**: ${worth}`);
    const platforms = safeText(g.platforms, 100);
    if (platforms) parts.push(`**Platforms**: ${platforms}`);
    const end = formatEndDate(g.end_date);
    if (end) parts.push(`**End Date**: ${end}`);

    const embed = {
      title: safeText(g.title, 200) || "Untitled giveaway",
      description: safeText(parts.join("\n\n"), 600),
      fields: [{ name: "Instructions", value: safeText(g.instructions, 300) || "See the giveaway page." }],
      color: 39423,
    };
    const url = safeUrl(g.open_giveaway_url);
    if (url) embed.url = url;
    const thumbnail = safeUrl(g.thumbnail);
    if (thumbnail) embed.thumbnail = { url: thumbnail };
    const image = safeUrl(g.image);
    if (image) embed.image = { url: image };

    const size = embed.title.length + embed.description.length + embed.fields[0].name.length + embed.fields[0].value.length;
    if (size > budget) break;
    budget -= size;
    embeds.push(embed);
  }
  return embeds;
}

// Loads axios lazily so this module is testable with an injected fetcher and no installed HTTP client.
async function fetchGiveaways(fetcher) {
  if (typeof fetcher === "function") return await fetcher();
  const axios = require("axios");
  const response = await axios.get(GIVEAWAYS_URL, { timeout: 8000 });
  return response.data;
}

// One invocation sends at most one message: a single digest, or one empty-state line.
async function handleGameGiveaways(message, _client, _replied, _log, fetcher) {
  try {
    const giveaways = await fetchGiveaways(fetcher);
    const embeds = buildEmbeds(giveaways);
    if (!embeds.length) return await safeSend(message.channel, "No free games found right now.");
    return await safeSend(message.channel, { embeds });
  } catch (error) {
    console.error("Error fetching or sending game giveaways:", error.message);
    return false;
  }
}

module.exports = handleGameGiveaways;
module.exports.buildEmbeds = buildEmbeds;
module.exports.safeText = safeText;
