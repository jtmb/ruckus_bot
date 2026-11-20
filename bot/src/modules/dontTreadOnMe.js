// Profanity insult matcher. Import is side-effect free: no provider I/O and no timers start here.
// The explicit start()/teardown() lifecycle is wired from the bot entrypoint; the message path only
// reads an in-memory regex, so an ordinary message never makes an outbound call.
const { safeReply } = require("./safeSend");

const LIST_URL = "https://www.purgomalum.com/profanitylist.html";
const INSULT_URL = "https://evilinsult.com/generate_insult.php?lang=en&type=json";
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

// Bounds on untrusted provider input so a hostile/malformed response cannot build a huge regex or reply.
const MAX_LIST_ENTRIES = 1000;
const MAX_WORD_LENGTH = 64;
const MAX_INSULT_LENGTH = 500;

let cache = { regex: null, at: 0 };
const lastReply = new Map(); // channelId -> ms of last successful reply
const inFlightInsult = new Map(); // channelId -> true while its insult fetch is pending (cooldown guard)

let refreshTimer = null; // single unref'd background timer, created only by start()
let refreshPromise = null; // single in-flight list fetch shared by all callers

// Loads HTTP clients only when a refresh actually runs, so importing this module needs no dependencies.
function fetchInsultsFromURL() {
  const axios = require("axios");
  const cheerio = require("cheerio");
  return axios.get(LIST_URL, { timeout: 5000 }).then((response) => {
    const $ = cheerio.load(response.data);
    // Cap provider output before it reaches regex construction.
    return $("ul li").map((_i, el) => $(el).text().trim()).get().slice(0, MAX_LIST_ENTRIES);
  });
}

// Coerces a provider insult to a bounded non-empty string, or null when absent/malformed.
function sanitizeInsult(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  return text.length > MAX_INSULT_LENGTH ? `${text.slice(0, MAX_INSULT_LENGTH - 1)}…` : text;
}

// Fetches one insult after a match; returns a bounded string or null so no empty/oversized reply is sent.
async function fetchInsultFromAPI() {
  try {
    const axios = require("axios");
    const response = await axios.get(INSULT_URL, { timeout: 5000 });
    return sanitizeInsult(response && response.data && response.data.insult);
  } catch (error) {
    console.error("Error fetching insult from API:", error.message);
    return null;
  }
}

// Exposed providers let tests inject mocks without changing the dispatcher call signature.
const providers = { fetchList: fetchInsultsFromURL, fetchInsult: fetchInsultFromAPI };

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Builds a bounded word-boundary regex; ignores malformed entries and returns null for an empty list (no fail-open).
function constructInsultRegex(words) {
  if (!Array.isArray(words)) return null;
  const cleaned = [...new Set(words
    .filter((w) => typeof w === "string")
    .map((w) => w.trim())
    .filter((w) => w && w.length <= MAX_WORD_LENGTH)
    .slice(0, MAX_LIST_ENTRIES))];
  if (!cleaned.length) return null;
  return new RegExp(`\\b(?:${cleaned.map(escapeRegExp).join("|")})\\b`, "i");
}

// Synchronous, provider-free read used by handleInsults; a stale last-known-good list is still usable.
function getCachedRegex() {
  return cache.regex;
}

// Refresh-capable read: coalesces concurrent callers into one in-flight fetch and keeps last-known-good
// on failure. Returns a promise resolving to the usable regex (or null when none exists).
function getInsultRegex(now = Date.now(), fetcher = providers.fetchList) {
  if (cache.regex && now - cache.at < TTL_MS) return Promise.resolve(cache.regex);
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const regex = constructInsultRegex(await fetcher());
      if (regex) {
        cache = { regex, at: now };
        return regex;
      }
    } catch (error) {
      console.error("Error fetching insults from URL:", error.message);
    }
    // No list yet: retry sooner. With a prior list: retain it as last-known-good.
    cache = { regex: cache.regex, at: now - TTL_MS + RETRY_MS };
    return cache.regex;
  })();
  // Clear the in-flight marker on settlement without creating a rejected side chain.
  refreshPromise.then(() => { refreshPromise = null; }, () => { refreshPromise = null; });
  return refreshPromise;
}

// Populates the cache ahead of traffic; safe to call from startup wiring or tests with an injected fetcher.
async function prewarmInsults(fetcher = providers.fetchList) {
  try { return await getInsultRegex(Date.now(), fetcher); }
  catch (error) { console.error("Insult prewarm failed:", error.message); return null; }
}

// Idempotent explicit startup: one prewarm plus one bounded, unref'd refresh timer. Returns the prewarm
// promise so callers may await it; repeat calls while running are no-ops.
function start() {
  if (refreshTimer) return Promise.resolve();
  refreshTimer = setInterval(() => { void getInsultRegex().catch(() => {}); }, RETRY_MS);
  if (typeof refreshTimer.unref === "function") refreshTimer.unref();
  return prewarmInsults();
}

// Idempotent teardown: stops the background timer so shutdown/tests leave no live handle.
function teardown() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// Matches a cached term, then replies once per channel per cooldown. A per-channel in-flight guard
// prevents two messages from both clearing the cooldown before the first reply is sent. Never fetches
// the list on a message.
async function handleInsults(message) {
  const content = message && message.content;
  if (typeof content !== "string" || !content || content.length > 2000) return false;
  const regex = getCachedRegex();
  if (!regex || !regex.test(content)) return false;
  const channelId = message.channel ? message.channel.id : "dm";
  const now = Date.now();
  if (now - (lastReply.get(channelId) || 0) < COOLDOWN_MS) return false;
  if (inFlightInsult.has(channelId)) return false;
  inFlightInsult.set(channelId, true);
  try {
    const insult = await providers.fetchInsult();
    if (!insult) return false;
    lastReply.set(channelId, Date.now());
    if (lastReply.size > 1000) lastReply.delete(lastReply.keys().next().value);
    await safeReply(message, insult);
    return true;
  } finally {
    inFlightInsult.delete(channelId);
  }
}

// Test helper: clears cache, cooldown state, in-flight guards and the background timer.
handleInsults._reset = () => {
  teardown();
  cache = { regex: null, at: 0 };
  lastReply.clear();
  inFlightInsult.clear();
  refreshPromise = null;
};
module.exports = handleInsults;
module.exports.constructInsultRegex = constructInsultRegex;
module.exports.getInsultRegex = getInsultRegex;
module.exports.getCachedRegex = getCachedRegex;
module.exports.prewarmInsults = prewarmInsults;
module.exports.sanitizeInsult = sanitizeInsult;
module.exports.start = start;
module.exports.teardown = teardown;
module.exports._providers = providers;
