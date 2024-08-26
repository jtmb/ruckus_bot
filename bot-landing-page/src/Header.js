import React from 'react';
import './Header.css';

function Header() {
    const githubUrl = 'https://github.com/jtmb/ruckus_bot'; // Replace with your actual GitHub URL

    const restartBot = async () => {
        try {
            const response = await fetch('http://127.0.0.1:3003/bot/restart', {
                method: 'POST', // Assuming POST is used for triggering the restart
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                alert('Bot is restarting...');
            } else {
                alert('Failed to restart bot. Please try again.');
            }
        } catch (error) {
            console.error('Error restarting bot:', error);
            alert('An error occurred. Please try again.');
        }
    };

    return (
        <header className="header">
            <a href={githubUrl} className="header-logo" target="_blank" rel="noopener noreferrer">
                <img src="https://cdn0.iconfinder.com/data/icons/free-social-media-set/24/github-512.png" alt="GitHub" className="logo-img" />
            </a>
            <button onClick={restartBot} className="restart-button">Restart Bot</button>
        </header>
    );
}

export default Header;
