// Canonical command descriptions for help/commands text.
// One registry drives both getHelpList() and getCommandList(), so a shipped command cannot be
// documented in one list and missing from the other. `{BOT}` is replaced with the live Discord
// client id at render time; no bot id is stored here (FIX-025, command-contract.md §3).
const COMMAND_REGISTRY = [
  { id: "flip", text: "- `!flipacoin HEADS_OR_TAILS` - flip a coin." },
  { id: "weather", text: "- `!weather in YOUR_CITY_HERE` or <@!{BOT}> and say `'weather in YOUR_CITY_HERE'` - Get weather information in your city." },
  { id: "freegames", text: "- `!freegames` or <@!{BOT}> and say `'free games'` - Get a list of free to keep games across multiple distribution platforms." },
  { id: "joke", text: "- `!joke` or <@!{BOT}> and say `'tell me a joke'` - I will tell you a joke." },
  { id: "help", text: "- `!help` - Display the full help dialog." },
  { id: "commands", text: "- `!commands` - Display only the list of available commands" },
];

// Id of the logged-in bot, configured from client.user.id. Input: id string; output: none;
// side effect: replaces the module default; empty/falsy ids are ignored so an unknown id is kept.
let currentBotId = "unknown";
function setBotId(botId) {
  if (botId !== undefined && botId !== null && botId !== "") currentBotId = String(botId);
}

// Resolves the id used in a render. Inputs: optional explicit id. Output: id string;
// no side effects; a null explicit id falls back to "unknown", never the removed hardcoded id.
function resolveBotId(botId) {
  if (botId === undefined) return currentBotId;
  return botId === null ? "unknown" : String(botId);
}

// Renders the shared command lines. Inputs: optional bot id. Output: newline-joined command
// lines with the `{BOT}` id placeholder inside each `<@!...>` mention filled in; no side effects.
function renderCommands(botId) {
  const id = resolveBotId(botId);
  return COMMAND_REGISTRY.map((entry) => entry.text.replace(/\{BOT\}/g, id)).join("\n");
}

// Builds the shortened `!commands` list. Inputs: optional bot id. Output: help header plus each
// registered command on its own line (including the help/commands separation fix); no side effects.
function getCommandList(botId) {
  return "## Available commands:\n\n" + renderCommands(botId) + "\n";
}

// Builds the full `!help` text. Inputs: optional bot id. Output: the same command lines plus the
// preserved Automated Tasks section and YouTube link; no side effects.
function getHelpList(botId) {
  return "## Available commands:\n\n" + renderCommands(botId) +
    "\n### 🤖 Automated Tasks:\n\n\n" +
    "- I am loggig all messages so i may respond to them properly.\n" +
    "- I am compelled to complete very special word chains.\n\n" +
    "https://www.youtube.com/watch?v=QQbBzOvPBpc";
}

module.exports = { getCommandList, getHelpList, setBotId, COMMAND_REGISTRY };
