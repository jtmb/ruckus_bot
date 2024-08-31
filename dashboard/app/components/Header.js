"use client";

import React from 'react';
import '../styles/Header.css';

export default function Header() {
    const githubUrl = 'https://github.com/jtmb/ruckus_bot';

    const restartBot = async () => {
        try {
            const response = await fetch('/api/restart-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();
            alert(result.message);
        } catch (error) {
            console.error('Error calling restart API:', error);
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
