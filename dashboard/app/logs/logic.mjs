// Pure helpers for the log explorer. No framework or network imports, so the same
// rules can be exercised by node:test without installing dashboard dependencies.
// Inputs: plain values / URLSearchParams-like objects. Outputs: normalized values,
// upstream paths and CSV text. No side effects; invalid input is reported, never
// turned into an unsupported upstream query parameter.

// The only event-type filters backed by real endpoints today. The API contract
// also describes event_type/guild_id/user_id/from/to/q on /bot/logs, but the
// implementation does not parse them; inventing those queries would silently
// return unfiltered data, so they are deliberately not exposed here.
export const LOG_TYPES = Object.freeze({
    all: { path: '/bot/logs', label: 'All events' },
    logins: { path: '/bot/logins', label: 'Bot logins' },
    interactions: { path: '/bot/interactions', label: 'User interactions' },
});

export const DEFAULT_TYPE = 'all';
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const MAX_EXPORT_ROWS = 5000;

const INT = /^\d{1,9}$/;

// Returns the canonical key for a supported type, or null for unknown input.
export function normalizeType(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOG_TYPES, value)
        ? value
        : null;
}

// Validates/clamps the UI's paging inputs to what the real API accepts.
// Returns { ok: true, value: { type, offset, limit } } or { ok: false, error }.
export function normalizeParams(params, { defaultLimit = DEFAULT_LIMIT } = {}) {
    const get = (key) => (params && typeof params.get === 'function' ? params.get(key) : null);
    const rawType = get('type');
    const type = rawType === null || rawType === '' ? DEFAULT_TYPE : normalizeType(rawType);
    if (!type) return { ok: false, error: 'Unknown log type' };

    const rawOffset = get('offset');
    const rawLimit = get('limit');
    if (rawOffset !== null && !INT.test(rawOffset)) return { ok: false, error: 'offset must be a non-negative integer' };
    if (rawLimit !== null && !INT.test(rawLimit)) return { ok: false, error: 'limit must be a non-negative integer' };

    const offset = rawOffset === null ? 0 : Number(rawOffset);
    const limit = rawLimit === null
        ? Math.max(1, Math.min(MAX_LIMIT, defaultLimit))
        : Math.max(1, Math.min(MAX_LIMIT, Number(rawLimit)));
    return { ok: true, value: { type, offset, limit } };
}

// Builds an upstream path using only supported pagination parameters.
export function upstreamPath({ type, offset = 0, limit = DEFAULT_LIMIT }) {
    const key = normalizeType(type) || DEFAULT_TYPE;
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit) || DEFAULT_LIMIT));
    return `${LOG_TYPES[key].path}?offset=${safeOffset}&limit=${safeLimit}`;
}

// Reads the API's X-Total-Count header, defaulting to 0 when absent or invalid.
export function readTotal(headers) {
    const raw = headers && typeof headers.get === 'function' ? headers.get('x-total-count') : null;
    const total = Number(raw);
    return raw !== null && raw !== '' && Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

// Escapes one CSV cell: always quoted, doubled quotes, and a leading apostrophe
// for spreadsheet-formula triggers (= + - @, leading tab/CR, or whitespace then
// a trigger). NULs are dropped because they break common CSV parsers.
export function csvCell(value) {
    if (value === null || value === undefined) return '""';
    let text = (typeof value === 'string' ? value : String(value)).replace(/\u0000/g, '');
    const probe = text.replace(/^[\s\uFEFF]+/, '');
    if (/^[=+\-@]/.test(probe) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

// Preferred column order; extra keys from a richer API schema are appended sorted.
const PREFERRED = ['id', 'timestamp', 'event_type', 'guild_id', 'user_id', 'request_id', 'event_data'];
const BASE = ['id', 'timestamp', 'event_type', 'event_data'];

export function csvColumns(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [...BASE];
    const present = new Set(rows.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : [])));
    const ordered = PREFERRED.filter((key) => present.has(key));
    const extra = [...present].filter((key) => !PREFERRED.includes(key)).sort();
    return [...ordered, ...extra];
}

// Serializes rows using the active filter's result set (already fetched by caller).
export function toCsv(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const columns = csvColumns(list);
    const lines = [columns.map(csvCell).join(',')];
    for (const row of list) lines.push(columns.map((key) => csvCell(row && row[key])).join(','));
    return `${lines.join('\r\n')}\r\n`;
}

// Page offsets that cover the whole active filter up to a hard row bound.
// Returns { offsets, pageSize, expected, truncated }.
export function exportPlan(total, limit = MAX_LIMIT, bound = MAX_EXPORT_ROWS) {
    const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
    const pageSize = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit) || MAX_LIMIT));
    const expected = Math.min(Math.max(0, bound), safeTotal);
    const offsets = [];
    for (let offset = 0; offset < expected; offset += pageSize) offsets.push(offset);
    return { offsets, pageSize, expected, truncated: safeTotal > expected };
}

export function pageCount(total, limit) {
    return Math.max(1, Math.ceil((Number.isSafeInteger(total) && total > 0 ? total : 0) / Math.max(1, limit)));
}

// Keeps the current offset inside range after a filter or row-count change.
export function clampOffset(offset, total, limit) {
    const last = (pageCount(total, limit) - 1) * Math.max(1, limit);
    return Math.max(0, Math.min(Math.trunc(offset) || 0, last));
}
