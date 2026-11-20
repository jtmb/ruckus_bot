const { safeReply } = require("./safeSend");

const GENERIC = "An error occurred while fetching weather data. Please try again later.";

// Normalises a user supplied city: trims, collapses whitespace, drops a leading "in" and trailing punctuation.
function normalizeCity(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*in\s+/i, "")
    .replace(/[?!.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// Extracts a city from "!weather in X", "!weather X", or "@bot weather in X". Returns null when absent.
function parseWeatherRequest(content, mentionsBot) {
  const lower = content.toLowerCase();
  let m = /^\s*!weather\b\s*(.*)$/is.exec(content);
  if (m) return { city: normalizeCity(m[1]) };
  if (mentionsBot && lower.includes("weather")) {
    m = /weather\s+(.+)/is.exec(content);
    return { city: m ? normalizeCity(m[1]) : "" };
  }
  return null;
}

// Typed result: { ok:true, description, temperature, cityName } | { ok:false, message }
async function getWeather(city, fetchImpl = fetch) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    console.error("OPENWEATHERMAP_API_KEY environment variable is not set.");
    return { ok: false, message: GENERIC };
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(apiKey)}&units=metric`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return { ok: false, message: "City not found. Please provide a valid city name." };
    if (!response.ok) { console.error("Weather provider status:", response.status); return { ok: false, message: "Unable to fetch weather data. Please try again later." }; }
    const data = await response.json();
    const description = data && data.weather && data.weather[0] && data.weather[0].description;
    const temperature = data && data.main && data.main.temp;
    if (typeof description !== "string" || typeof temperature !== "number") return { ok: false, message: "Unable to fetch weather data. Please try again later." };
    return { ok: true, description, temperature: Math.round(temperature * 10) / 10, cityName: city };
  } catch (error) {
    console.error("Error fetching weather data:", error.message);
    return { ok: false, message: GENERIC };
  }
}

async function handleWeatherCommands(message, client, _replied, _log, fetchImpl) {
  const req = parseWeatherRequest(message.content, message.mentions.has(client.user));
  if (!req) return false;
  if (!req.city) {
    await safeReply(message, "Please provide a city, for example `!weather in London`.");
    return true;
  }
  const result = await getWeather(req.city, fetchImpl);
  await safeReply(message, result.ok
    ? `The current weather in ${result.cityName} is ${result.description} with a temperature of ${result.temperature}°C.`
    : result.message);
  return true;
}

module.exports = { handleWeatherCommands, getWeather, parseWeatherRequest, normalizeCity };
