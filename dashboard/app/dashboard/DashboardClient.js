"use client";

// Client view for the live status page. Kept intact from the original page so
// polling, loading/empty/error states and document title behaviour are unchanged.
import { useEffect, useState } from 'react';
import useAuthRedirect from '../components/useAuthRedirect';
import { fetchBotStatus } from '../components/api_bot_status';
import './../styles/App.css';

const POLL_MS = 15000;

export default function DashboardClient() {
  const [botStatus, setBotStatus] = useState({ botName: '', isBotUp: false, guilds: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Secondary session check only; the server page component is the access control.
  useAuthRedirect();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const status = await fetchBotStatus();
        if (cancelled) return;
        setBotStatus(status);
        setError('');
      } catch (e) {
        if (cancelled) return;
        if (e.code === 401) window.location.href = '/';
        else setError('Could not reach the API. Showing the last known status.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    document.title = botStatus.botName ? `${botStatus.botName} Bot Dashboard` : 'Bot Dashboard';
  }, [botStatus.botName]);

  return (
    <div className="App">
      <div className="container">
        {error && <div role="alert" className="status-line down">{error}</div>}
        <div className="picture-container">
          {/* Local, dependency-free status mark: keeps the online/offline visual without a hotlink. */}
          <span
            className={`status-orb ${botStatus.isBotUp ? 'is-up' : 'is-down'}`}
            role="img"
            aria-label={botStatus.isBotUp ? 'Bot online' : 'Bot offline'}
          >
            <span aria-hidden="true">{botStatus.isBotUp ? '✅' : '❌🤖'}</span>
          </span>
        </div>
        <div className={`status-line ${botStatus.isBotUp ? 'up' : 'down'}`} aria-live="polite">
          {loading ? 'Checking bot status…' : botStatus.isBotUp ? `${botStatus.botName} is Online ✅` : `Bot is Offline ❌🤖`}
        </div>
        {!loading && typeof botStatus.heartbeatAgeSeconds === 'number' && (
          <div className="guild-name">Last heartbeat {botStatus.heartbeatAgeSeconds}s ago</div>
        )}
        <div className="guild-name">
          {botStatus.isBotUp && botStatus.guilds.length > 0 && (
            <div>
              {botStatus.guilds.map((guildName, index) => (
                <div key={index} className="guild-item">➡️ {guildName}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
