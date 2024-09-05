"use client";

import React, { useState } from 'react';
import '../styles/Header.css';

export default function Header() {
    const githubUrl = 'https://github.com/jtmb/ruckus_bot';
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);

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

    const toggleDropdown = () => {
        setIsDropdownVisible(!isDropdownVisible);
    };

    const handleLogout = () => {
        try {
            // Clear authentication status from localStorage
            localStorage.removeItem('authenticated');

            // Redirect to the login page
            window.location.href = '/';
        } catch (error) {
            console.error('Error logging out:', error);
            alert('An error occurred. Please try again.');
        }
    };

    return (
        <header className="header">
            <a href={githubUrl} className="header-logo" target="_blank" rel="noopener noreferrer">
                <img src="https://cdn0.iconfinder.com/data/icons/free-social-media-set/24/github-512.png" alt="GitHub" className="logo-img" />
            </a>
            <div className="header-actions">
                <button onClick={restartBot} className="restart-button">Restart Bot</button>
                <div className="profile-container">
                    <button onClick={toggleDropdown} className="profile-button">
                        <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" alt="Profile" className="profile-img" />
                    </button>
                    {isDropdownVisible && (
                        <div className="dropdown-menu">
                            <button onClick={() => alert('Navigating to User Management')} className="dropdown-item">
                                User Management
                            </button>
                            <button onClick={handleLogout} className="dropdown-item">
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
