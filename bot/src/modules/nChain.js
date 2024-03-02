// nChain.js

// Variable to track if 'g' has been replied to in the N chain
let gReplied = false;

// Define message-response pairs for the N chain
const responses = {
    'n': 'i',
    'i': 'g',
    'g': 'e',
    'e': 'r',
};

// Function to handle N chain responses
function handleNChainResponse(message, client, repliedMessages, logEvent) {
    const content = message.content.toLowerCase();

    // Check if the message content matches any key in the responses object
    if (responses.hasOwnProperty(content)) {
        // If the content is 'g' and 'g' has not been replied to yet
        if (content === 'g' && !gReplied) {
            message.reply('g'); // Send 'g' a second time
            gReplied = true; // Set gReplied to true to indicate that 'g' has been replied to
        } else if (content === 'e' && !gReplied) {
            // If 'g' has not been replied to yet, do not reply with 'e'
            message.reply(''); // Send an empty message
        } else {
            // Respond with the corresponding value from the responses object
            const response = responses[content];
            message.reply(response);
            // Log the bot response to the N chain
            logEvent('bot_response', {
                eventType: 'N_chain_response',
                responseData: response,
                timestamp: new Date()
            });
        }
    }

    // Mark the message as processed
    repliedMessages.set(message.id, true);
}

module.exports = handleNChainResponse;
