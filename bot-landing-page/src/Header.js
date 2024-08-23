// Header.js
import React from 'react';
import './Header.css';

function Header() {
    const githubUrl = 'https://github.com/jtmb/ruckus_bot'; // Replace with your actual GitHub URL

    return (
        <header className="header">
            <a href={githubUrl} className="header-logo" target="_blank" rel="noopener noreferrer">
                <img src="https://cdn0.iconfinder.com/data/icons/free-social-media-set/24/github-512.png" alt="GitHub" className="logo-img" />
            </a>
        </header>
    );
}

export default Header;
