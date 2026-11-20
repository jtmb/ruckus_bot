const test = require("node:test");
const assert = require("node:assert/strict");

process.env.MYSQL_HOST = process.env.TEST_MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_PORT = process.env.TEST_MYSQL_PORT || "33061";
process.env.MYSQL_USER = process.env.TEST_MYSQL_USER || "bot";
process.env.MYSQL_PASSWORD = process.env.TEST_MYSQL_PASSWORD || "unset";
process.env.MYSQL_DATABASE = process.env.TEST_MYSQL_DATABASE || "ruckus";
process.env.BOT_TOKEN = "test";

const Dedupe = require("../src/modules/dedupe");
const handleNChain = require("../src/modules/nChain");
const handleHeadsOrTails = require("../src/modules/headsOrTails");
const { handleWeatherCommands, parseWeatherRequest } = require("../src/modules/weatherHandling");
const insults = require("../src/modules/dontTreadOnMe");
const { buildEmbeds } = require("../src/modules/gameGiveaways");
const { processMessage } = require("../src/modules/botResponses");
const { getCommandList, getHelpList } = require("../src/modules/commandList");

const BOT = { id: "b1" };
function msg(content, { channel = "c1", id = String(Math.random()), mention = false, author = "u1" } = {}) {
  const sent = [];
  const m = {
    id, content, author: { id: author, bot: false, username: "u" },
    channel: { id: channel, send: async (x) => sent.push(["send", x]) },
    guild: { id: "g" },
    mentions: { has: () => mention, users: { has: () => mention } },
    reply: async (x) => sent.push(["reply", x]),
  };
  return { m, sent };
}
const client = { user: BOT };
const noLog = () => {};

test("n-chain: full chain, never an empty send, per-channel", async () => {
  handleNChain._state.clear();
  const out = [];
  for (const c of ["n", "i", "g", "g", "e"]) {
    const { m, sent } = msg(c);
    assert.equal(await handleNChain(m, client, null, noLog), true);
    out.push(sent.map((s) => s[1]));
  }
  assert.deepEqual(out.flat(), ["i", "g", "g", "e", "r"]);
  const { m, sent } = msg("e", { channel: "other" });
  assert.equal(await handleNChain(m, client, null, noLog), true);
  assert.equal(sent.length, 0, "no reply (and no empty reply) when chain not in progress");
});

test("!flipacoin: handled exactly once, valid reply, prompt on missing choice", async () => {
  const a = msg("!flipacoin heads");
  assert.equal(await handleHeadsOrTails(a.m), true);
  assert.equal(a.sent.length, 1);
  assert.match(a.sent[0][1], /^You chose heads\. The result is (Heads|Tails)\.$/);
  const b = msg("!flipacoin");
  assert.equal(await handleHeadsOrTails(b.m), true);
  assert.match(b.sent[0][1], /Please specify/);
  assert.equal(await handleHeadsOrTails(msg("hello").m), false);
});

test("weather: both documented forms parse and reply", async () => {
  assert.deepEqual(parseWeatherRequest("!weather in New  York?", false), { city: "New York" });
  assert.deepEqual(parseWeatherRequest("!weather London", false), { city: "London" });
  assert.deepEqual(parseWeatherRequest("<@1> weather in Paris", true), { city: "Paris" });
  assert.equal(parseWeatherRequest("nice weather", false), null);
  process.env.OPENWEATHERMAP_API_KEY = "k";
  let url;
  const fetchOk = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ weather: [{ description: "clear sky" }], main: { temp: 21.04 } }) }; };
  const { m, sent } = msg("!weather in São Paulo");
  assert.equal(await handleWeatherCommands(m, client, null, null, fetchOk), true);
  assert.match(url, /q=S%C3%A3o%20Paulo/);
  assert.equal(sent[0][1], "The current weather in São Paulo is clear sky with a temperature of 21°C.");
  assert.doesNotMatch(sent[0][1], /undefined/);
});

test("weather: not found, 5xx, malformed, timeout, no key give strings without 'undefined'", async () => {
  process.env.OPENWEATHERMAP_API_KEY = "k";
  const cases = [
    [async () => ({ ok: false, status: 404 }), /City not found/],
    [async () => ({ ok: false, status: 503 }), /Unable to fetch/],
    [async () => ({ ok: true, status: 200, json: async () => ({}) }), /Unable to fetch/],
    [async () => { throw new Error("timeout"); }, /An error occurred/],
  ];
  for (const [f, re] of cases) {
    const { m, sent } = msg("!weather in X");
    await handleWeatherCommands(m, client, null, null, f);
    assert.match(sent[0][1], re);
    assert.doesNotMatch(sent[0][1], /undefined/);
  }
  delete process.env.OPENWEATHERMAP_API_KEY;
  const { m, sent } = msg("!weather in X");
  await handleWeatherCommands(m, client, null, null);
  assert.match(sent[0][1], /An error occurred/);
});

test("profanity: empty/failed list matches nothing; cache and last-known-good", async () => {
  insults._reset();
  assert.equal(insults.constructInsultRegex([]), null);
  assert.equal(await insults.getInsultRegex(1000, async () => { throw new Error("down"); }), null);
  insults._reset();
  const good = await insults.getInsultRegex(1000, async () => ["badword"]);
  assert.ok(good.test("you badword"));
  assert.ok(!good.test("hello world"));
  let calls = 0;
  const again = await insults.getInsultRegex(2000, async () => { calls++; return ["x"]; });
  assert.equal(calls, 0, "served from cache within TTL");
  assert.equal(again, good);
  const stale = await insults.getInsultRegex(1000 + 7 * 3600 * 1000, async () => { throw new Error("down"); });
  assert.equal(stale, good, "last known good survives a failed refresh");
});

test("ordinary message: no outbound call, no reply, no handler fires", async () => {
  insults._reset();
  const realFetch = global.fetch;
  let outbound = 0;
  global.fetch = async () => { outbound++; throw new Error("no network"); };
  const { m, sent } = msg("just chatting about lunch");
  await processMessage(m, client, new Dedupe(), noLog);
  global.fetch = realFetch;
  assert.equal(outbound, 0);
  assert.equal(sent.length, 0);
});

test("!help and !commands list each registered command; help text unchanged in intent", async () => {
  const a = msg("!commands"); await processMessage(a.m, client, new Dedupe(), noLog);
  const b = msg("!help"); await processMessage(b.m, client, new Dedupe(), noLog);
  assert.equal(a.sent[0][1], getCommandList());
  assert.equal(b.sent[0][1], getHelpList());
  for (const c of ["!flipacoin", "!weather", "!freegames", "!joke", "!help", "!commands"]) assert.ok(getHelpList().includes(c), c);
});

test("duplicate message ids are handled once", async () => {
  const d = new Dedupe();
  const a = msg("!flipacoin tails", { id: "same" });
  await processMessage(a.m, client, d, noLog);
  await processMessage(a.m, client, d, noLog);
  assert.equal(a.sent.length, 1);
});

test("dedupe cache stays bounded under 50,000 messages", () => {
  const d = new Dedupe();
  for (let i = 0; i < 50000; i++) d.set(String(i));
  assert.ok(d.size <= 5000);
  assert.equal(d.has("0"), false);
  assert.equal(d.has("49999"), true);
});

test("dedupe entries expire after the TTL", () => {
  let t = 0;
  const d = new Dedupe(1000, 10, () => t);
  d.set("a"); t = 1500;
  assert.equal(d.has("a"), false);
});

test("freegames: at most 10 embeds in one budgeted message", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: "T" + i, description: "d".repeat(2000), worth: "$1", platforms: "PC", end_date: "2030-01-01", instructions: "i".repeat(2000), open_giveaway_url: "https://x", thumbnail: "https://t", image: "https://i" }));
  const embeds = buildEmbeds(many);
  assert.ok(embeds.length >= 1 && embeds.length <= 10);
  const total = embeds.reduce((n, e) => n + e.title.length + e.description.length + e.fields[0].value.length, 0);
  assert.ok(total <= 5500);
  assert.deepEqual(buildEmbeds([]), []);
});

test("send failures are caught, not thrown", async () => {
  const { m } = msg("!flipacoin heads");
  m.channel.send = async () => { throw new Error("Missing Permissions"); };
  await assert.doesNotReject(processMessage(m, client, new Dedupe(), noLog));
});

test("logEvent: callback exactly once, writes a row, heartbeat upserts", { skip: process.env.TEST_MYSQL_PASSWORD ? false : "needs TEST_MYSQL_PASSWORD" }, async () => {
  const { logEvent, createTablesIfNotExists, writeHeartbeat, getPool } = require("../src/modules/mysql");
  await createTablesIfNotExists();
  let calls = 0;
  await logEvent("bot_login", { a: 1 }, () => { calls++; });
  assert.equal(calls, 1);
  const [rows] = await getPool().promise().query("SELECT COUNT(*) n FROM bot_logs WHERE event_type='bot_login'");
  assert.ok(rows[0].n >= 1);
  const c = { user: { id: "1", username: "R" }, guilds: { cache: { map: (f) => [{ id: "1", name: "G" }].map(f) } } };
  await writeHeartbeat(c, new Date()); await writeHeartbeat(c, new Date());
  const [hb] = await getPool().promise().query("SELECT COUNT(*) n FROM bot_heartbeat");
  assert.equal(hb[0].n, 1);
  await getPool().promise().end();
});
