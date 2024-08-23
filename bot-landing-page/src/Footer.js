// Footer.js
import React from 'react';
import './Footer.css'; // Ensure you have this file with the appropriate styles

function Footer() {
    const releaseVersion = 'v1.0.0'; // Replace with your actual release version
    const githubUrl = 'https://github.com/jtmb/ruckus_bot'; // Replace with your actual GitHub URL

    return (
        <footer className="footer">
            <a href={githubUrl} className="footer-link" target="_blank" rel="noopener noreferrer">
                <span className="footer-text">Release {releaseVersion} 🚀</span>
            </a>
        </footer>
    );
}

export default Footer;
