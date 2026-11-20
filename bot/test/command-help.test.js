// Focused regression tests for the help/commands text (FIX-025, REG-002).
// Pure/offline: imports only commandList.js, so no Discord, provider or DB calls occur.
const test = require("node:test");
const assert = require("node:assert/strict");
const { getHelpList, getCommandList, setBotId, COMMAND_REGISTRY } = require("../src/modules/commandList");

// Counts non-overlapping occurrences of needle in haystack. Inputs: strings; output: number;
// no side effects; returns 0 for an empty needle.
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

// The exact publicly shipped command wording (from the baseline), with a stand-in bot id.
const SNAPSHOT_ID = "snapshot-id";
const SNAPSHOT_MENTION = `<@!${SNAPSHOT_ID}>`;
const EXPECTED_LINES = [
  "- `!flipacoin HEADS_OR_TAILS` - flip a coin.",
  "- `!weather in YOUR_CITY_HERE` or " + SNAPSHOT_MENTION + " and say `'weather in YOUR_CITY_HERE'` - Get weather information in your city.",
  "- `!freegames` or " + SNAPSHOT_MENTION + " and say `'free games'` - Get a list of free to keep games across multiple distribution platforms.",
  "- `!joke` or " + SNAPSHOT_MENTION + " and say `'tell me a joke'` - I will tell you a joke.",
  "- `!help` - Display the full help dialog.",
  "- `!commands` - Display only the list of available commands",
];
const HEADER = "## Available commands:\n\n";

test("help and commands render the live bot id, never the removed hardcoded id", () => {
  const id = "live-client-id-123";
  for (const text of [getHelpList(id), getCommandList(id)]) {
    assert.ok(text.includes(`<@!${id}>`), "contains the supplied client id mention");
    assert.ok(!text.includes("922579269639618640"), "no hardcoded bot id");
  }
});

test("every registered command appears exactly once in both lists", () => {
  const id = "once-id";
  for (const text of [getHelpList(id), getCommandList(id)]) {
    for (const entry of COMMAND_REGISTRY) {
      const rendered = entry.text.replace(/\{BOT\}/g, id);
      assert.equal(countOccurrences(text, rendered), 1, `${entry.id} appears once`);
    }
  }
  assert.equal(COMMAND_REGISTRY.length, 6);
  assert.equal(new Set(COMMAND_REGISTRY.map((entry) => entry.id)).size, COMMAND_REGISTRY.length);
});

test("help/commands line separation is repaired", () => {
  const text = getCommandList("sep-id");
  assert.ok(text.includes("- `!help` - Display the full help dialog.\n- `!commands` - Display only the list of available commands"));
  assert.ok(!text.includes("dialog.- `!commands`"));
});

test("help keeps its sections and link; commands stays minimal", () => {
  const help = getHelpList("sections-id");
  const commands = getCommandList("sections-id");
  for (const part of [
    "### 🤖 Automated Tasks:",
    "- I am loggig all messages so i may respond to them properly.",
    "- I am compelled to complete very special word chains.",
    "https://www.youtube.com/watch?v=QQbBzOvPBpc",
  ]) assert.ok(help.includes(part), part);
  assert.ok(!commands.includes("Automated Tasks"));
  assert.ok(!commands.includes("youtube"));
});

test("public wording is preserved byte-for-byte apart from the id and the newline fix", () => {
  const expectedCommands = HEADER + EXPECTED_LINES.join("\n") + "\n";
  const expectedHelp = HEADER + EXPECTED_LINES.join("\n") +
    "\n### 🤖 Automated Tasks:\n\n\n" +
    "- I am loggig all messages so i may respond to them properly.\n" +
    "- I am compelled to complete very special word chains.\n\n" +
    "https://www.youtube.com/watch?v=QQbBzOvPBpc";
  assert.equal(getCommandList(SNAPSHOT_ID), expectedCommands);
  assert.equal(getHelpList(SNAPSHOT_ID), expectedHelp);
});

test("no-arg render uses the id configured from the Discord client (botResponses path)", () => {
  setBotId("client-user-id");
  assert.ok(getHelpList().includes("<@!client-user-id>"));
  assert.ok(getCommandList().includes("<@!client-user-id>"));
});
