import React from 'react';
import '../styles/Footer.css';

const Footer = () => {
    const releaseVersion = 'v1.0.0';
    const githubUrl = 'https://github.com/jtmb/ruckus_bot';

    return (
        <footer className="footer">
            <a href={githubUrl} className="footer-link" target="_blank" rel="noopener noreferrer">
                <span className="footer-text">Release {releaseVersion} 🚀</span>
            </a>
        </footer>
    );
}

export default Footer;
