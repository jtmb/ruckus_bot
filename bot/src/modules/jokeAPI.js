// jokeAPI.js

async function fetchJoke() {
    try {
        // Import node-fetch dynamically
        const fetch = await import('node-fetch');
        
        const response = await fetch.default('https://v2.jokeapi.dev/joke/Any');
        const data = await response.json();

        if (response.ok) {
            if (data.type === 'twopart') {
                return `${data.setup}\n${data.delivery}`;
            } else {
                return data.joke;
            }
        } else {
            console.error('Error fetching joke:', data.error || 'Unknown error');
            return 'Sorry, I could not fetch a joke at the moment. Please try again later.';
        }
    } catch (error) {
        console.error('Error fetching joke:', error);
        return 'Sorry, I could not fetch a joke at the moment. Please try again later.';
    }
}

module.exports = {
    fetchJoke
};