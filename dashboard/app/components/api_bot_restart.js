// components/api_bot_restart.js

export async function restartBot(apiEndpoint) {
    try {
        const response = await fetch(`${apiEndpoint}/bot/restart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            return { success: true, message: 'Bot is restarting...' };
        } else {
            return { success: false, message: 'Failed to restart bot. Please try again.' };
        }
    } catch (error) {
        console.error('Error restarting bot:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}
