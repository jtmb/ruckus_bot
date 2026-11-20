"use client";

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import '../styles/Header.css';
import { restartBot as restartBotRequest, restartBotStatus } from '../components/api_bot_restart';

// Bounded client tracking: 12 checks x 2 s = 24 s ceiling (the API target is a 20 s result).
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 12;

export default function Header() {
    const githubUrl = 'https://github.com/jtmb/ruckus_bot';
    const pathname = usePathname();
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const [restartState, setRestartState] = useState('idle'); // idle | pending | succeeded | failed
    const [restartMessage, setRestartMessage] = useState('');
    const [trackedJobId, setTrackedJobId] = useState(null);
    const profileButtonRef = useRef(null);
    const profileMenuRef = useRef(null);

    // Purpose-built client effect: bounded polling for one user-initiated restart job.
    // Input: trackedJobId (null stops it). Output: none. Side effects: a cancelled flag and one
    // chained timer, cleaned up on change/unmount; ends with a definite result or a readable timeout.
    useEffect(() => {
        if (!trackedJobId) return undefined;
        let cancelled = false;
        let timer = null;
        let attempts = 0;

        const settle = (state, message) => {
            if (cancelled) return;
            setRestartState(state);
            setRestartMessage(message);
            alert(message); // preserves the original message access on a definite result
            setTrackedJobId(null);
        };

        const poll = async () => {
            if (cancelled) return;
            attempts += 1;
            const result = await restartBotStatus(trackedJobId);
            if (cancelled) return;
            if (!result.success) {
                settle('failed', result.message || 'Could not read the restart result.');
                return;
            }
            if (result.state === 'succeeded' || result.state === 'failed') {
                settle(
                    result.state,
                    result.detail || (result.state === 'succeeded' ? 'Bot restarted successfully.' : 'Restart failed.'),
                );
                return;
            }
            if (attempts >= MAX_POLLS) {
                settle('failed', 'Timed out waiting for a definite restart result. Please check bot status.');
                return;
            }
            timer = setTimeout(poll, POLL_INTERVAL_MS);
        };

        poll();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [trackedJobId]);

    // Profile menu keyboard/outside handling: focuses the first action when opened, closes on
    // Escape or a click outside and restores focus to the trigger. Input: isDropdownVisible.
    // Output: none. Side effects: two document listeners while open, removed on close/unmount.
    // Failure: no-op when the menu markup is absent.
    useEffect(() => {
        if (!isDropdownVisible) return undefined;
        const menu = profileMenuRef.current;
        const firstItem = menu && menu.querySelector('.dropdown-item');
        if (firstItem) firstItem.focus();

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setIsDropdownVisible(false);
            if (profileButtonRef.current) profileButtonRef.current.focus();
        };
        const onPointerDown = (event) => {
            const target = event.target;
            if (profileMenuRef.current && profileMenuRef.current.contains(target)) return;
            if (profileButtonRef.current && profileButtonRef.current.contains(target)) return;
            setIsDropdownVisible(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [isDropdownVisible]);

    // Arrow/Home/End navigation inside the open profile menu. Input: React keyboard event.
    // Output: none. Side effect: focuses the selected action. Failure: no-op for empty menus.
    const onMenuKeyDown = (event) => {
        const items = profileMenuRef.current
            ? Array.from(profileMenuRef.current.querySelectorAll('.dropdown-item'))
            : [];
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = index < 0 ? 0 : (index + step + items.length) % items.length;
            items[next].focus();
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : items.length - 1].focus();
        }
    };

    // Button handler: starts one job and hands tracking to the bounded effect above.
    // Input: none. Output: none. Side effects: one POST plus UI state; keeps the original alert flow.
    const restartBot = async () => {
        if (trackedJobId) return;
        setRestartState('pending');
        setRestartMessage('Restarting bot...');
        const result = await restartBotRequest();
        if (result.success && result.jobId) {
            setTrackedJobId(result.jobId);
            return;
        }
        const message = result.message || 'Failed to restart bot. Please try again.';
        setRestartState('failed');
        setRestartMessage(message);
        alert(message);
    };

    // Flips the profile menu open/closed. Input: none. Output: none.
    // Side effect: updates isDropdownVisible; the effect above owns focus and listeners.
    const toggleDropdown = () => setIsDropdownVisible((open) => !open);

    // Closes the profile menu after an action. Input: none. Output: none.
    // Side effect: updates isDropdownVisible only; navigation/logout stay with the caller.
    const closeDropdown = () => setIsDropdownVisible(false);

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (error) {
            console.error('Error logging out:', error);
        }
        window.location.href = '/';
    };

    const busy = restartState === 'pending' || Boolean(trackedJobId);

    return (
        <header className="header">
            <a
                href={githubUrl}
                className="header-logo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ruckus Bot repository on GitHub"
            >
                <svg className="logo-img" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
            </a>
            <div className="header-actions">
                <a
                    href="/logs"
                    className="header-nav-link"
                    aria-current={pathname === '/logs' ? 'page' : undefined}
                    style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 14px', color: '#fff', textDecoration: 'none', border: '1px solid #2a2f3a', borderRadius: '8px' }}
                >
                    Logs
                </a>
                <button type="button" onClick={restartBot} className="restart-button" disabled={busy} aria-busy={busy}>
                    {busy ? 'Restarting…' : 'Restart Bot'}
                </button>
                {restartState !== 'idle' && (
                    <span
                        role="status"
                        aria-live="polite"
                        className="restart-status"
                        style={{ marginLeft: '10px', fontSize: '13px', color: restartState === 'failed' ? '#ff9a9a' : '#b6f0c0' }}
                    >
                        {restartMessage}
                    </span>
                )}
                <div className="profile-container">
                    <button
                        ref={profileButtonRef}
                        type="button"
                        onClick={toggleDropdown}
                        className="profile-button"
                        aria-label="Account menu"
                        aria-haspopup="menu"
                        aria-expanded={isDropdownVisible}
                        aria-controls="profile-menu"
                    >
                        <img src="/settings.png" alt="" className="profile-img" />
                    </button>
                    <div
                        id="profile-menu"
                        ref={profileMenuRef}
                        className="dropdown-menu"
                        role="menu"
                        aria-label="Account actions"
                        hidden={!isDropdownVisible}
                        onKeyDown={onMenuKeyDown}
                    >
                        <a href="/users" role="menuitem" className="dropdown-item" onClick={closeDropdown}>
                            User Management
                        </a>
                        <button type="button" role="menuitem" className="dropdown-item" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
