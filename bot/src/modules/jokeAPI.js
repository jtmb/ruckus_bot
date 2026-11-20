const FALLBACK = "Sorry, I could not fetch a joke at the moment. Please try again later.";

async function fetchJoke() {
  try {
    const response = await fetch("https://v2.jokeapi.dev/joke/Any", { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (!response.ok) { console.error("Error fetching joke:", data.error || "Unknown error"); return FALLBACK; }
    const text = data.type === "twopart" ? `${data.setup}\n${data.delivery}` : data.joke;
    return typeof text === "string" && text.trim() ? text : FALLBACK;
  } catch (error) {
    console.error("Error fetching joke:", error.message);
    return FALLBACK;
  }
}
module.exports = { fetchJoke, FALLBACK };
