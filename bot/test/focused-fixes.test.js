// Focused, dependency-free regression fixtures for the three remaining bot-module defects.
// Providers are mocked and no Discord/network live service is contacted.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const handleJoke = require("../src/modules/jokeComHandling");
const insults = require("../src/modules/dontTreadOnMe");
const handleGiveaways = require("../src/modules/gameGiveaways");
const { buildEmbeds } = handleGiveaways;

// Minimal Discord-like message that records every reply/send instead of touching a gateway.
function msg(content, mention = false) {
  const sent = [];
  return {
    m: {
      id: String(Math.random()), content,
      author: { id: "u1", bot: false, username: "u" },
      channel: { id: "c1", send: async (x) => { sent.push(x); } },
      guild: { id: "g" },
      mentions: { has: () => mention, users: { has: () => mention } },
      reply: async (x) => { sent.push(x); },
    },
    sent,
  };
}
const CLIENT = { user: { id: "b1" } };

test("joke: !joke works without a mention; natural phrase requires one", async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ type: "single", joke: "A joke." }) };
  };
  try {
    const explicit = msg("!joke", false);
    assert.equal(await handleJoke(explicit.m, CLIENT), true);
    assert.deepEqual(explicit.sent, ["A joke."]);

    const bare = msg("my friend said tell me a joke yesterday", false);
    assert.equal(await handleJoke(bare.m, CLIENT), false, "unsolicited natural phrase must not fire");
    assert.equal(bare.sent.length, 0);
    assert.equal(calls, 1, "no provider call without a documented trigger");

    const natural = msg("<@b1> tell me a joke", true);
    assert.equal(await handleJoke(natural.m, CLIENT), true);
    assert.deepEqual(natural.sent, ["A joke."]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = realFetch;
  }
});

test("profanity: an ordinary message makes zero provider calls and no reply", async () => {
  insults._reset();
  insults._providers.fetchList = async () => { throw new Error("list must not be fetched on a message"); };
  insults._providers.fetchInsult = async () => { throw new Error("insult must not be fetched on a message"); };
  const { m, sent } = msg("just chatting about lunch", false);
  assert.equal(await insults(m), false);
  assert.equal(sent.length, 0);
});

test("profanity: prewarm, match-only-on-trigger, cooldown, last-known-good", async () => {
  insults._reset();
  let listCalls = 0;
  let insultCalls = 0;
  insults._providers.fetchList = async () => { listCalls++; return ["badword"]; };
  insults._providers.fetchInsult = async () => { insultCalls++; return "That was rude."; };

  await insults.prewarmInsults();
  assert.equal(listCalls, 1, "prewarm performs the only list fetch");
  assert.equal(await insults.getInsultRegex(Date.now()), insults.getCachedRegex(), "served from cache within TTL");

  const plain = msg("hello world", false);
  assert.equal(await insults(plain.m), false);
  assert.equal(insultCalls, 0, "ordinary message never fetches an insult");

  const hit = msg("you badword", false);
  assert.equal(await insults(hit.m), true);
  assert.deepEqual(hit.sent, ["That was rude."]);
  assert.equal(insultCalls, 1);

  const again = msg("you badword", false);
  assert.equal(await insults(again.m), false, "cooldown suppresses repeat");
  assert.equal(insultCalls, 1);

  const stale = await insults.getInsultRegex(Date.now() + 7 * 3600 * 1000, async () => { throw new Error("down"); });
  assert.equal(stale, insults.getCachedRegex(), "last-known-good survives failed refresh");
});

test("profanity: malformed list entries cannot create an empty/global match", () => {
  assert.equal(insults.constructInsultRegex([]), null);
  assert.equal(insults.constructInsultRegex([null, undefined, 1, {}, "  "]), null);
  const re = insults.constructInsultRegex(["a.b", "bad word"]);
  assert.ok(re.test("a.b"));
  assert.ok(re.test("bad word"));
  assert.ok(!re.test("axb"), "regex metacharacters are escaped");
});

test("giveaway: malformed items and missing fields never emit undefined/null/Invalid Date", () => {
  const raw = [
    null, undefined, "string", 42, [],
    {},
    { title: "undefined", description: "null", worth: undefined, platforms: {}, end_date: undefined, instructions: null, open_giveaway_url: undefined, thumbnail: 1, image: {} },
    { title: "Good", description: "Desc", worth: "$0", platforms: "PC", end_date: "2030-01-01", instructions: "Do it", open_giveaway_url: "https://x.test", thumbnail: "https://t.test", image: "https://i.test" },
  ];
  const embeds = buildEmbeds(raw);
  assert.equal(embeds.length, 3, "only object items become embeds");
  assert.ok(!/undefined|null|Invalid Date/i.test(JSON.stringify(embeds)), "no malformed string reaches Discord");
  assert.equal(embeds[2].title, "Good");
  assert.equal(embeds[2].url, "https://x.test");
  assert.match(embeds[2].description, /End Date/);
  assert.deepEqual(buildEmbeds(null), []);
});

test("giveaway: at most 10 embeds within the 5500 character budget", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    title: "T" + i, description: "d".repeat(2000), worth: "$1", platforms: "PC",
    end_date: "2030-01-01", instructions: "i".repeat(2000), open_giveaway_url: "https://x.test",
  }));
  const embeds = buildEmbeds(many);
  assert.ok(embeds.length >= 1 && embeds.length <= 10);
  const total = embeds.reduce((n, e) => n + e.title.length + e.description.length + e.fields[0].name.length + e.fields[0].value.length, 0);
  assert.ok(total <= 5500);
  assert.deepEqual(buildEmbeds([]), []);
});

test("giveaway: one digest message, empty-state line, mocked provider", async () => {
  const ok = msg("!freegames", false);
  assert.equal(await handleGiveaways(ok.m, null, null, null, async () => [{ title: "G", open_giveaway_url: "https://x.test" }]), true);
  assert.equal(ok.sent.length, 1, "one invocation sends exactly one message");
  assert.ok(Array.isArray(ok.sent[0].embeds));

  const empty = msg("!freegames", false);
  assert.equal(await handleGiveaways(empty.m, null, null, null, async () => []), true);
  assert.deepEqual(empty.sent, ["No free games found right now."]);

  const down = msg("!freegames", false);
  assert.equal(await handleGiveaways(down.m, null, null, null, async () => { throw new Error("down"); }), false);
  assert.equal(down.sent.length, 0);
});

// Fresh-process probe: stubs axios/cheerio and counts timers, then imports the module. Proves that
// importing alone performs zero provider calls and starts no timer (network/lifecycle must be explicit).
test("profanity: module import has no provider call and starts no timer", () => {
  const modulePath = path.resolve(__dirname, "../src/modules/dontTreadOnMe.js");
  const script = [
    'const Module = require("node:module");',
    'const origLoad = Module._load;',
    'let gets = 0, intervals = 0;',
    'Module._load = function (request) {',
    '  if (request === "axios") return { get: async () => { gets++; throw new Error("network blocked"); } };',
    '  if (request === "cheerio") return { load: () => ({}) };',
    '  return origLoad.apply(this, arguments);',
    '};',
    'const realSetInterval = global.setInterval;',
    'global.setInterval = function () { intervals++; return realSetInterval.apply(this, arguments); };',
    'require(process.argv[1]);',
    'process.stdout.write(JSON.stringify({ gets, intervals }));',
  ].join("\n");
  const out = execFileSync(process.execPath, ["-e", script, modulePath], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(out), { gets: 0, intervals: 0 });
});

test("profanity: start is idempotent, awaits one prewarm, and teardown stops the timer", async () => {
  insults._reset();
  let listCalls = 0;
  insults._providers.fetchList = async () => { listCalls++; return ["badword"]; };
  const first = insults.start();
  const second = insults.start();
  await Promise.all([first, second]);
  assert.equal(listCalls, 1, "repeat start() must not trigger a second fetch");
  assert.ok(insults.getCachedRegex(), "prewarm populated the cache");
  insults.teardown();
  insults.teardown();
});

test("profanity: concurrent refreshes coalesce into a single in-flight fetch", async () => {
  insults._reset();
  let calls = 0;
  let finish;
  insults._providers.fetchList = () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const a = insults.getInsultRegex();
  const b = insults.getInsultRegex();
  const c = insults.getInsultRegex();
  assert.equal(calls, 1, "all callers share one pending fetch");
  finish(["sharedword"]);
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.equal(ra, rb);
  assert.equal(rb, rc);
  assert.ok(ra.test("sharedword"));
  assert.equal(calls, 1);
});

test("profanity: concurrent messages on one channel send exactly one reply", async () => {
  insults._reset();
  insults._providers.fetchList = async () => ["badword"];
  await insults.prewarmInsults();
  let insultCalls = 0;
  let finish;
  insults._providers.fetchInsult = () => {
    insultCalls++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const one = msg("you badword", false);
  const two = msg("you badword", false);
  const first = insults(one.m);
  const second = insults(two.m);
  assert.equal(insultCalls, 1, "second message suppressed while the first fetch is in flight");
  finish("Rude.");
  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.deepEqual(one.sent, ["Rude."]);
  assert.equal(two.sent.length, 0);
  assert.equal(insultCalls, 1);
});

test("profanity: provider input is bounded and malformed entries cannot fail open", async () => {
  const huge = Array.from({ length: 5000 }, (_, i) => "word" + i);
  const re = insults.constructInsultRegex(huge);
  assert.ok(re instanceof RegExp);
  assert.ok(re.source.length < 100000, "regex source stays bounded");
  assert.equal(insults.constructInsultRegex(["a".repeat(65)]), null, "overlong word rejected");
  assert.equal(insults.constructInsultRegex("not an array"), null);

  const bounded = insults.sanitizeInsult("x".repeat(1000));
  assert.ok(bounded.length <= 500, "insult reply is bounded");
  assert.equal(insults.sanitizeInsult({ insult: "x" }), null, "malformed insult fails closed");
  assert.equal(insults.sanitizeInsult("   "), null, "empty insult cannot produce an empty reply");
});

