"use client";

// Client view for the log explorer. Kept intact from the original page so filters,
// paging, retry, CSV export and all accessibility states are unchanged.
// Imports from ./logic.mjs and ./logs.css keep their original relative paths.
import { useCallback, useEffect, useState } from 'react';
import useAuthRedirect from '../components/useAuthRedirect';
import { LOG_TYPES, DEFAULT_LIMIT, MAX_EXPORT_ROWS } from './logic.mjs';
import './logs.css';

const PAGE_SIZES = [10, 25, 50, 100];
const TYPE_KEYS = Object.keys(LOG_TYPES);
const BADGE_CLASS = {
    bot_login: 'badge-info',
    user_interaction: 'badge-ok',
    error: 'badge-danger',
};

function displayTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').slice(0, 19);
}

// Renders string payloads directly and JSON objects as readable text.
function displayData(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
}

export default function LogsClient() {
    // Secondary session check only; the server page component is the access control.
    useAuthRedirect();

    const [type, setType] = useState('all');
    const [limit, setLimit] = useState(DEFAULT_LIMIT);
    const [offset, setOffset] = useState(0);
    const [data, setData] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [notice, setNotice] = useState('');

    // Loads one page from the dashboard's authenticated proxy route.
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError('');
        fetch(`/api/logs?type=${encodeURIComponent(type)}&offset=${offset}&limit=${limit}`, {
            cache: 'no-store',
            signal: controller.signal,
        })
            .then(async (res) => {
                if (res.status === 401) {
                    window.location.href = '/';
                    return null;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    throw new Error(body?.error || `Request failed (${res.status})`);
                }
                return res.json();
            })
            .then((payload) => { if (active && payload) setData(payload); })
            .catch((e) => { if (active && e.name !== 'AbortError') setError(e.message || 'Could not load logs'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [type, offset, limit, retryKey]);

    useEffect(() => { document.title = 'Logs — Ruckus Bot Dashboard'; }, []);

    // Pull the page back into range if the active filter shrank underneath us.
    useEffect(() => {
        if (loading) return;
        const pages = Math.max(1, Math.ceil((data.total || 0) / limit));
        const last = (pages - 1) * limit;
        if (offset > last) setOffset(last);
    }, [data.total, limit, offset, loading]);

    const chooseType = (next) => { setType(next); setOffset(0); setNotice(''); };
    const chooseLimit = (event) => { setLimit(Number(event.target.value)); setOffset(0); setNotice(''); };
    const clearFilters = () => { setType('all'); setLimit(DEFAULT_LIMIT); setOffset(0); setNotice(''); };

    // Downloads the full active filter as CSV; a bounded export is reported.
    const download = useCallback(async () => {
        setExporting(true);
        setNotice('');
        try {
            const res = await fetch(`/api/logs/export?type=${encodeURIComponent(type)}`, { cache: 'no-store' });
            if (res.status === 401) { window.location.href = '/'; return; }
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Export failed');
            }
            const rows = Number(res.headers.get('X-Log-Export-Rows') || '0');
            const total = Number(res.headers.get('X-Log-Export-Total') || '0');
            const truncated = res.headers.get('X-Log-Export-Truncated') === '1';
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `logs-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            setNotice(truncated
                ? `Exported ${rows} of ${total} rows (${MAX_EXPORT_ROWS} row limit).`
                : `Exported ${rows} rows.`);
        } catch (e) {
            setNotice(`Export failed: ${e.message || 'unknown error'}`);
        } finally {
            setExporting(false);
        }
    }, [type]);

    const total = data.total || 0;
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.floor(offset / limit) + 1;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const first = total === 0 ? 0 : offset + 1;
    const last = Math.min(offset + rows.length, total);

    return (
        <main className="logs-page" id="logs-main">
            <a className="skip-link" href="#logs-table">Skip to log table</a>
            <div className="logs-head">
                <div>
                    <h1>Event logs</h1>
                    <p className="logs-sub">Newest events first. Filters use the available log endpoints.</p>
                </div>
                <button type="button" className="logs-button logs-export" onClick={download} disabled={exporting}>
                    {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            </div>

            <div className="logs-filters">
                <fieldset>
                    <legend>Event type</legend>
                    <div className="chip-row">
                        {TYPE_KEYS.map((key) => (
                            <label key={key} className={`chip${type === key ? ' chip-active' : ''}`}>
                                <input
                                    type="radio"
                                    name="log-type"
                                    value={key}
                                    checked={type === key}
                                    onChange={() => chooseType(key)}
                                />
                                <span>{LOG_TYPES[key].label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <label className="logs-size">
                    Rows per page
                    <select value={limit} onChange={chooseLimit}>
                        {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                </label>
            </div>
            <p className="logs-hint">
                Guild, user, date and text filters need API query support; they are not offered here.
                CSV exports up to {MAX_EXPORT_ROWS} rows of the current filter.
            </p>

            {notice && <p className="logs-notice" role="status" aria-live="polite">{notice}</p>}
            {error && (
                <div className="logs-banner" role="alert">
                    <span>Could not load logs: {error}</span>
                    <button type="button" className="logs-button" onClick={() => setRetryKey((n) => n + 1)}>Retry</button>
                </div>
            )}

            <div className="logs-table-wrap" aria-busy={loading}>
                <table id="logs-table" className="logs-table">
                    <caption className="sr-only">Log events for the selected event type, newest first</caption>
                    <thead>
                        <tr>
                            <th scope="col">Time (UTC)</th>
                            <th scope="col">Type</th>
                            <th scope="col">ID</th>
                            <th scope="col">Event data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0
                            ? [0, 1, 2, 3, 4].map((n) => (
                                <tr key={n} className="log-skeleton" aria-hidden="true">
                                    <td data-label="Time"><span className="skeleton-bar" /></td>
                                    <td data-label="Type"><span className="skeleton-bar" /></td>
                                    <td data-label="ID"><span className="skeleton-bar" /></td>
                                    <td data-label="Event data"><span className="skeleton-bar" /></td>
                                </tr>
                            ))
                            : rows.map((row) => (
                                <tr key={row.id ?? `${row.timestamp}-${row.event_type}`}>
                                    <td data-label="Time (UTC)"><time dateTime={row.timestamp ?? undefined}>{displayTime(row.timestamp)}</time></td>
                                    <td data-label="Type">
                                        <span className={`badge ${BADGE_CLASS[row.event_type] || 'badge-neutral'}`}>
                                            {row.event_type || 'unknown'}
                                        </span>
                                    </td>
                                    <td data-label="ID">{row.id ?? '—'}</td>
                                    <td data-label="Event data" className="log-data">{displayData(row.event_data)}</td>
                                </tr>
                            ))}
                        {!loading && rows.length === 0 && !error && (
                            <tr>
                                <td colSpan={4} className="logs-empty">
                                    No events match this filter.
                                    <button type="button" className="logs-button" onClick={clearFilters}>Clear filter</button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="logs-pager">
                <span role="status" aria-live="polite">
                    {total === 0 ? 'No rows' : `Showing ${first}–${last} of ${total}`} · Page {page} of {pages}
                </span>
                <div className="pager-buttons">
                    <button type="button" className="logs-button" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
                        Previous
                    </button>
                    <button type="button" className="logs-button" onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>
                        Next
                    </button>
                </div>
            </div>
        </main>
    );
}
