// Focused, dependency-free tests for the log explorer's pure logic.
// Run: node --test dashboard/test/logs.test.mjs (no dashboard install required).
// These cover endpoint-backed type filters, bounded paging math and defensive
// CSV escaping; they never contact an API or a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LOG_TYPES,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    MAX_EXPORT_ROWS,
    normalizeType,
    normalizeParams,
    upstreamPath,
    readTotal,
    csvCell,
    csvColumns,
    toCsv,
    exportPlan,
    pageCount,
    clampOffset,
} from '../app/logs/logic.mjs';

// Builds a URLSearchParams-like input from a plain object.
const params = (values = {}) => new URLSearchParams(values);
const headers = (value) => ({ get: (key) => (key.toLowerCase() === 'x-total-count' ? value : null) });

test('owned log explorer files resolve all relative imports', () => {
    const files = [
        '../app/logs/page.js',
        '../app/api/logs/route.js',
        '../app/api/logs/upstream.mjs',
        '../app/api/logs/export/route.js',
    ];
    for (const relative of files) {
        const file = fileURLToPath(new URL(relative, import.meta.url));
        const source = readFileSync(file, 'utf8');
        for (const [, spec] of source.matchAll(/(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g)) {
            const target = resolve(dirname(file), spec);
            const found = [target, `${target}.js`, `${target}.mjs`, `${target}.css`, resolve(target, 'index.js')]
                .some(existsSync);
            assert.ok(found, `${relative} imports unresolved ${spec}`);
        }
    }
});

test('type filters map only to the three real endpoints', () => {
    assert.deepEqual(Object.keys(LOG_TYPES), ['all', 'logins', 'interactions']);
    assert.equal(LOG_TYPES.all.path, '/bot/logs');
    assert.equal(LOG_TYPES.logins.path, '/bot/logins');
    assert.equal(LOG_TYPES.interactions.path, '/bot/interactions');
    assert.equal(normalizeType('logins'), 'logins');
    assert.equal(normalizeType('event_type'), null);
    assert.equal(normalizeType(undefined), null);
});

test('parameter normalization defaults safely and rejects malformed input', () => {
    assert.deepEqual(normalizeParams(params()).value, { type: 'all', offset: 0, limit: DEFAULT_LIMIT });
    assert.deepEqual(normalizeParams(params({ type: 'interactions', offset: '40', limit: '10' })).value,
        { type: 'interactions', offset: 40, limit: 10 });
    assert.deepEqual(normalizeParams(params({ limit: '500' })).value.limit, MAX_LIMIT);
    assert.deepEqual(normalizeParams(params({ limit: '0' })).value.limit, 1);
    assert.equal(normalizeParams(params({ type: 'guild_id' })).ok, false);
    assert.equal(normalizeParams(params({ offset: '-1' })).ok, false);
    assert.equal(normalizeParams(params({ limit: 'abc' })).ok, false);
});

test('upstream paths use only supported pagination semantics', () => {
    assert.equal(upstreamPath({ type: 'logins', offset: 20, limit: 25 }), '/bot/logins?offset=20&limit=25');
    assert.equal(upstreamPath({ type: 'interactions' }), '/bot/interactions?offset=0&limit=25');
    // Malformed values fall back to safe defaults rather than being forwarded.
    const path = upstreamPath({ type: 'all', offset: '0;DROP', limit: '1&guild_id=1' });
    assert.equal(path, '/bot/logs?offset=0&limit=25');
    assert.doesNotMatch(path, /guild_id|event_type|user_id|from=|to=|q=/);
});

test('total count header is parsed defensively', () => {
    assert.equal(readTotal(headers('42')), 42);
    assert.equal(readTotal(headers('not-a-number')), 0);
    assert.equal(readTotal(headers('-1')), 0);
    assert.equal(readTotal(headers(null)), 0);
    assert.equal(readTotal(null), 0);
});

test('CSV cells escape delimiters, quotes and spreadsheet formulas', () => {
    assert.equal(csvCell('plain'), '"plain"');
    assert.equal(csvCell(7), '"7"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    for (const value of ['=1+1', '+1+1', '-cmd()', '@SUM(A1)', '\t=1', '\r=1', '  =1']) {
        assert.match(csvCell(value), /^"'/, `expected formula guard for ${JSON.stringify(value)}`);
    }
    assert.equal(csvCell('hello'), '"hello"');
});

test('CSV columns stay deterministic and include richer fields when present', () => {
    assert.deepEqual(csvColumns([]), ['id', 'timestamp', 'event_type', 'event_data']);
    assert.deepEqual(csvColumns([{ event_data: 'x', id: 1, timestamp: 't', event_type: 'error', extra: 2 }]),
        ['id', 'timestamp', 'event_type', 'event_data', 'extra']);
    assert.deepEqual(csvColumns([{ id: 1, request_id: 'r', user_id: 'u', event_type: 'error' }]),
        ['id', 'event_type', 'user_id', 'request_id']);
});

test('CSV export renders one header and one line per row', () => {
    const csv = toCsv([
        { id: 1, timestamp: '2026-11-17T00:00:00Z', event_type: 'error', event_data: '=cmd()' },
        { id: 2, timestamp: '2026-11-17T00:00:01Z', event_type: 'command', event_data: 'ok' },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], '"id","timestamp","event_type","event_data"');
    assert.match(lines[1], /"'=cmd\(\)"/);
});

test('export plan covers the active filter within a hard row bound', () => {
    const plan = exportPlan(250, 100, MAX_EXPORT_ROWS);
    assert.deepEqual(plan.offsets, [0, 100, 200]);
    assert.equal(plan.expected, 250);
    assert.equal(plan.truncated, false);
    const bounded = exportPlan(MAX_EXPORT_ROWS + 1, 100, MAX_EXPORT_ROWS);
    assert.equal(bounded.offsets.length, MAX_EXPORT_ROWS / 100);
    assert.equal(bounded.expected, MAX_EXPORT_ROWS);
    assert.equal(bounded.truncated, true);
    assert.deepEqual(exportPlan(0, 25).offsets, []);
});

test('page math keeps offsets in range after a filter change', () => {
    assert.equal(pageCount(0, 25), 1);
    assert.equal(pageCount(51, 25), 3);
    assert.equal(clampOffset(75, 10, 25), 0);
    assert.equal(clampOffset(75, 60, 25), 50);
    assert.equal(clampOffset(0, 0, 25), 0);
});
