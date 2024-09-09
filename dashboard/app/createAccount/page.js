"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import './../styles/Login.css';

export default function CreateAccountPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState(""); // Confirm password state
    const [role, setRole] = useState("user"); // Default role
    const [adminExists, setAdminExists] = useState(false); // Track whether an admin exists
    const [error, setError] = useState(null); // Error message state
    const [notification, setNotification] = useState(null); // Notification message state

    // Fetch whether an admin exists
    useEffect(() => {
        const checkAdmin = async () => {
            try {
                const response = await fetch('/api/check-admin', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                setAdminExists(data.adminExists);
            } catch (error) {
                console.error('Error checking for existing admin:', error);
            }
        };
        checkAdmin();
    }, []);

    const handleCreateAccount = async (event) => {
        event.preventDefault();
        setError(null); // Reset error message on new attempt

        // Check if passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        try {
            const response = await fetch('/api/create-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role }) // Send role as selected
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to create account');
            }

            const result = await response.json();
            console.log('Account creation result:', result);

            // Show success notification
            setNotification('Account created successfully!');

            // Redirect to login page on success
            setTimeout(() => {
                window.location.href = '/';
            }, 2000); // Delay redirection to allow notification to be visible
        } catch (error) {
            console.error('Error creating account:', error);
            setError(error.message); // Set error message to display to the user
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1 className="login-title">Create Account</h1>

                {/* Error message should be here */}
                {error && <p className="error-message">{error}</p>}

                {/* Notification message */}
                {notification && (
                    <div className="notification">
                        {notification}
                    </div>
                )}

                <form onSubmit={handleCreateAccount} className="login-form">
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="confirm-password">Confirm Password</label>
                        <input
                            type="password"
                            id="confirm-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="login-button">
                        Create Account
                    </button>
                </form>
                <p className="text-center">
                    Already have an account?{' '}
                    <Link href="/" className="text-link">
                        Login
                    </Link>
                </p>
            </div>

            <style jsx>{`
                .notification {
                    background-color: #4caf50;
                    color: white;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 5px;
                    text-align: center;
                }
                .error-message {
                    background-color: #f44336;
                    color: white;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 5px;
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
