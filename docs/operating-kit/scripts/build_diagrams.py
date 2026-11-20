#!/usr/bin/env python3
"""Generate exact SVG diagrams for the ruckus_bot planning package.

Each diagram is a plain SVG with fixed coordinates so it can be diffed and inspected.
Run: python3 -B docs/operating-kit/scripts/build_diagrams.py
"""
from pathlib import Path

OUT = Path('/home/brajam/repos/ruckus_bot/docs/visuals/diagrams')
OUT.mkdir(parents=True, exist_ok=True)

BG = '#0f1115'
TEXT = '#e8ecf3'
MUTED = '#9aa4b2'
BORDER = '#3a4150'
ACCENT = '#ff2d78'
OK = '#3ddc97'
INFO = '#6aa9ff'
WARN = '#ffc857'
SURF = '#171a21'
SURF2 = '#1e222b'
FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'


def head(w, h, title, subtitle=''):
    t = f'<text x="32" y="38" font-family="{FONT}" font-size="20" font-weight="700" fill="{TEXT}">{title}</text>'
    s = (f'<text x="32" y="60" font-family="{FONT}" font-size="12.5" fill="{MUTED}">{subtitle}</text>'
         if subtitle else '')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{title}"><rect width="{w}" height="{h}" fill="{BG}"/>{t}{s}')


def box(x, y, w, h, title, lines=(), fill=SURF, stroke=BORDER, accent=None, dashed=False, rx=12, size=12):
    dash = ' stroke-dasharray="6 5"' if dashed else ''
    acc = f'<rect x="{x}" y="{y}" width="4" height="{h}" rx="2" fill="{accent}"/>' if accent else ''
    body = ''
    ty = y + 24
    if title:
        body += f'<text x="{x+16}" y="{ty}" font-family="{FONT}" font-size="13.5" font-weight="700" fill="{TEXT}">{title}</text>'
        ty += 19
    for ln in lines:
        body += f'<text x="{x+16}" y="{ty}" font-family="{FONT}" font-size="{size}" fill="{MUTED}">{ln}</text>'
        ty += 16
    return (f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"{dash}/>'
            f'{acc}{body}</g>')


def label(x, y, text, color=MUTED, size=11.5, anchor='start', weight='400'):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{color}" '
            f'text-anchor="{anchor}" font-weight="{weight}">{text}</text>')


def arrow(x1, y1, x2, y2, color=INFO, dashed=False, both=False, width=1.6):
    dash = ' stroke-dasharray="5 4"' if dashed else ''
    start = f' marker-start="url(#ah-{color[1:]})"' if both else ''
    return (f'<path d="M {x1} {y1} L {x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}"{dash}'
            f' marker-end="url(#ah-{color[1:]})"{start}/>')


def path(d, color=INFO, dashed=False, both=False):
    dash = ' stroke-dasharray="5 4"' if dashed else ''
    start = f' marker-start="url(#ah-{color[1:]})"' if both else ''
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6"{dash} marker-end="url(#ah-{color[1:]})"{start}/>'


def markers():
    out = '<defs>'
    for c in (INFO, OK, WARN, ACCENT, MUTED):
        out += (f'<marker id="ah-{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{c}"/></marker>')
    out += '</defs>'
    return out


# ------------------------------------------------------------------ 1. context
w, h = 1320, 780
s = [head(w, h, 'System context — trust boundaries',
          'Who calls what. The private host exposes only the dashboard port; the API and database stay internal.')]
s.append(markers())
s.append(box(40, 130, 200, 88, 'Guild member', ['Discord client', 'message commands'], fill=SURF2))
s.append(box(40, 260, 200, 88, 'Bot operator', ['dashboard user', 'viewer/operator/admin'], fill=SURF2))
s.append(box(40, 390, 200, 88, 'Maintainer / agent', ['code, tests, docs'], fill=SURF2))
s.append(box(40, 520, 200, 88, 'Owner', ['token, hosting, decisions'], fill=SURF2))

s.append(f'<rect x="300" y="96" width="700" height="600" rx="18" fill="none" stroke="{ACCENT}" stroke-dasharray="8 6"/>')
s.append(label(316, 122, 'PRIVATE HOST — Docker network, no public api:3003 or mysql:3306', ACCENT, 11, weight='700'))

s.append(box(330, 150, 300, 150, 'bot/  (discord.js)', [
    'gateway, dispatch, providers', 'writes events + heartbeat', 'non-root process under supervisor'], accent=OK))
s.append(box(330, 340, 300, 150, 'api/  (Express)', [
    'sessions, RBAC, validation', 'SQL, restart jobs, metrics', 'migrations + retention'], accent=INFO))
s.append(box(330, 530, 300, 130, 'dashboard/  (Next.js)', [
    'server components', 'thin proxies to the api', 'session cookie forwarding'], accent=ACCENT))
s.append(box(700, 340, 250, 130, 'MySQL 8.4', [
    'bot_logs  credentials', 'sessions  bot_heartbeat', 'guild_settings  quotes'], accent=WARN))

s.append(box(1060, 150, 230, 90, 'Discord API / gateway', ['events, messages, embeds'], fill=SURF2))
s.append(box(1060, 270, 230, 90, 'Provider APIs', ['gamerpower, jokeapi,', 'openweather, insult list'], fill=SURF2))
s.append(box(1060, 400, 230, 90, 'Browser', ['HTTPS to dashboard only'], fill=SURF2))
s.append(box(1060, 560, 230, 90, 'Host volume / backups', ['mysql data, dumps, logs'], fill=SURF2))

s.append(arrow(240, 174, 330, 196))
s.append(arrow(240, 304, 330, 380))
s.append(arrow(630, 210, 1060, 200, INFO, both=True))
s.append(label(660, 192, 'discord.js gateway + REST', MUTED, 10.5))
s.append(path('M 630 270 L 660 270 L 660 315 L 1060 315', INFO))
s.append(label(672, 305, 'HTTPS calls from the bot only', MUTED, 10.5))
s.append(arrow(630, 405, 700, 405))
s.append(label(638, 395, 'SQL', MUTED, 10))
s.append(arrow(400, 530, 400, 490))
s.append(label(410, 512, 'HTTP + cookie', MUTED, 10.5))
s.append(path('M 1060 490 L 1040 490 L 1040 720 L 400 720 L 400 660', INFO))
s.append(label(700, 712, 'browser → dashboard :8080 (HTTPS)', MUTED, 10.5))
s.append(path('M 950 440 L 1060 590', WARN, dashed=True))
s.append(label(1040, 620, 'backup / restore', WARN, 10.5, anchor='end'))

s.append(label(32, 760, 'Bot never calls the API. The dashboard never touches MySQL. The browser never reaches api:3003 or mysql:3306.', MUTED, 12))
s.append('</svg>')
(OUT / 'context.svg').write_text(''.join(s), encoding='utf-8')

# ------------------------------------------------------------------ 2. architecture
w, h = 1200, 780
s = [head(w, h, 'Component architecture — allowed dependency direction',
          'Solid arrows are runtime calls. The band is shared knowledge, not a service. No cycles.')]
s.append(markers())

s.append(f'<rect x="40" y="88" width="1120" height="52" rx="12" fill="{SURF2}" stroke="{BORDER}" stroke-dasharray="6 5"/>')
s.append(label(56, 110, 'Shared contracts (docs/planning/contracts)', TEXT, 12.5, weight='700'))
s.append(label(56, 128, 'event payload shapes · configuration variable names · error envelope + request id · command registry ids', MUTED, 11.5))

s.append(box(40, 180, 330, 150, 'bot/', [
    'index.js — config, client, shutdown',
    'core/dispatcher.js — pipeline, dedupe, cooldown',
    'core/registry.js — command metadata',
    'modules/commands/*  modules/providers/*',
    'modules/db/ — event queue, heartbeat'], accent=OK))
s.append(box(40, 400, 330, 150, 'api/', [
    'api.js — middleware order, server',
    'middleware/ — requestId, session, csrf, roles',
    'routes/ — auth, status, logs, users, guilds',
    'modules/ — parameterised SQL per aggregate',
    'migrations/ — numbered forward-only'], accent=INFO))
s.append(box(40, 620, 330, 120, 'dashboard/', [
    'app/(auth) — login',
    'app/(app) — status, logs, users, settings',
    'app/api/* — thin server proxies',
    'lib/api-client.js — cookie forwarding',
    'styles/ — tokens + responsive rules'], accent=ACCENT))

s.append(box(520, 180, 240, 104, 'Discord', ['gateway events', 'REST sends'], fill=SURF2))
s.append(box(520, 400, 240, 130, 'MySQL 8.4', [
    'bot_logs  credentials',
    'sessions  bot_heartbeat',
    'guild_settings  quotes',
    'schema_migrations'], accent=WARN))
s.append(box(520, 610, 240, 104, 'Providers', ['gamerpower  jokeapi', 'openweather  insult list'], fill=SURF2))

s.append(box(880, 400, 280, 170, 'Local verification', [
    'npm run verify',
    'lint + unit + HTTP contract tests',
    'hermetic dashboard build',
    'migration dry-run'], fill=SURF2, dashed=True))

s.append(arrow(370, 232, 520, 232, INFO, both=True))
s.append(label(384, 214, 'discord.js', MUTED, 10.5))
s.append(arrow(370, 465, 520, 465, INFO, both=True))
s.append(label(382, 455, 'SQL (pool)', MUTED, 10.5))
s.append(arrow(200, 620, 200, 550, INFO))
s.append(label(210, 592, 'HTTP + cookie', MUTED, 10.5))
s.append(path('M 370 300 L 420 300 L 420 660 L 520 660', INFO))
s.append(label(430, 640, 'HTTPS fetch', MUTED, 10.5))
s.append(label(896, 524, 'reads the same contracts;', MUTED, 11))
s.append(label(896, 542, 'runs against a scratch DB', MUTED, 11))

s.append(label(40, 756, 'Every process reads configuration through its own validated config module. The single image runs all three processes under supervisor and publishes only 8080.', MUTED, 12))
s.append('</svg>')
(OUT / 'architecture.svg').write_text(''.join(s), encoding='utf-8')

# ------------------------------------------------------------------ 3. command flow
w, h = 980, 900
s = [head(w, h, 'Command dispatch — one message, at most one reply',
          'Fixed ordering from the command contract. Every exit path is explicit.')]
s.append(markers())
steps = [
    ('messageCreate', 'author is a bot or self → exit', SURF2, None),
    ('resolve guild settings', 'prefix, disabled features, quiet channels', SURF2, None),
    ('duplicate message id?', 'yes → exit silently (TTL 10 min, cap 5,000)', SURF2, WARN),
    ('log interaction event', 'queued; content only when enabled', SURF2, None),
    ('explicit command match', 'registry: flip, weather, joke, freegames, help…', SURF, OK),
    ('passive hooks', 'easter egg → chain → profanity (skipped in quiet channels)', SURF, WARN),
    ('bot mentioned?', 'yes → one random quote, then exit', SURF, INFO),
    ('nothing matched', 'no reply', SURF2, None),
]
y = 100
coords = []
for title, sub, fill, accent in steps:
    s.append(box(100, y, 520, 62, title, [sub], fill=fill, accent=accent))
    coords.append(y)
    y += 90
for i in range(len(coords) - 1):
    s.append(arrow(360, coords[i] + 62, 360, coords[i + 1]))
s.append(arrow(620, coords[4] + 31, 740, coords[4] + 31, OK))
s.append(box(740, coords[4] + 6, 200, 50, 'handler → reply', ['returns true'], fill=SURF2, accent=OK))
s.append(label(748, coords[4] + 80, 'cooldown → one warning', WARN, 11))
s.append(arrow(620, coords[3] + 31, 740, coords[3] + 31, INFO, dashed=True))
s.append(box(740, coords[3] + 6, 200, 50, 'bounded log queue', ['drop oldest, count'], fill=SURF2, dashed=True))
s.append(label(100, 850, 'Invariants: no empty message · one reply per message · every send awaited · provider called only after a trigger matched.', MUTED, 12))
s.append('</svg>')
(OUT / 'command-flow.svg').write_text(''.join(s), encoding='utf-8')

# ------------------------------------------------------------------ 4. data model
w, h = 1200, 600
s = [head(w, h, 'Data model after migrations 0001–0008',
          'MySQL 8.4, utf8mb4. Primary keys in bold; arrows show foreign keys.')]
s.append(markers())


def table(x, y, name, cols, wcol=330):
    hh = 46 + 20 * len(cols)
    parts = [f'<rect x="{x}" y="{y}" width="{wcol}" height="{hh}" rx="10" fill="{SURF}" stroke="{BORDER}"/>',
             f'<rect x="{x}" y="{y}" width="{wcol}" height="30" rx="10" fill="{SURF2}"/>',
             f'<text x="{x+12}" y="{y+20}" font-family="{MONO}" font-size="12.5" font-weight="700" fill="{TEXT}">{name}</text>']
    for i, c in enumerate(cols):
        col = TEXT if c.startswith('*') else MUTED
        parts.append(f'<text x="{x+12}" y="{y+50+i*20}" font-family="{MONO}" font-size="11.5" fill="{col}">{c.lstrip("*")}</text>')
    return ''.join(parts), hh


s.append(table(40, 100, 'credentials', [
    '*id  INT PK', 'username  VARCHAR(32) UNIQUE', 'password_hash  VARCHAR(255)',
    "role  ENUM('admin','operator','viewer')", 'disabled  TINYINT(1)', 'created_at, updated_at', 'last_login_at'])[0])
s.append(table(40, 300, 'sessions', [
    '*id  CHAR(64) PK (hash of cookie)', '*credential_id  FK → credentials.id',
    'created_at, expires_at', 'last_seen_at', 'ip_hash, user_agent'])[0])
s.append(table(420, 100, 'bot_logs', [
    '*id  BIGINT PK', 'event_type  VARCHAR(64)', 'event_data  JSON', 'guild_id, user_id',
    'request_id', 'timestamp  TIMESTAMP(3)'])[0])
s.append(table(420, 290, 'bot_heartbeat', [
    '*id  TINYINT PK (=1)', 'bot_id, bot_name', 'started_at', 'heartbeat_at',
    'latency_ms', 'guilds  JSON'])[0])
s.append(table(800, 100, 'schema_migrations', ['*version  VARCHAR(64) PK', 'checksum  CHAR(64)', 'applied_at'])[0])
s.append(table(800, 240, 'guild_settings', [
    '*guild_id  VARCHAR(32) PK', 'prefix  VARCHAR(8)', 'disabled_features  JSON',
    'quiet_channels  JSON', 'units  ENUM', 'owner_user_id'])[0])
s.append(table(800, 440, 'quotes', [
    '*id  INT PK', 'text  VARCHAR(500) UNIQUE', 'category', 'added_by, created_at'])[0])

s.append(arrow(200, 300, 200, 274, INFO))
s.append(label(212, 292, '1:n sessions', MUTED, 10.5))
s.append(path('M 370 120 L 420 120', MUTED, dashed=True))
s.append(label(395, 140, 'no FK', MUTED, 10, anchor='middle'))

s.append(label(40, 470, 'Indexes: bot_logs(event_type,timestamp), (guild_id,timestamp), (user_id,timestamp), (timestamp).', MUTED, 12))
s.append(label(40, 492, 'Retention: interaction 30 d · error 90 d · aggregate 180 d (DEC-016), pruned in 5,000-row batches.', MUTED, 12))
s.append(label(40, 514, 'Heartbeat is a single upserted row; online state is derived in the API (age > 90 s → offline).', MUTED, 12))
s.append(label(40, 536, 'Migrations are forward-only; 0001 adopts an existing pre-migration schema instead of failing.', MUTED, 12))
s.append('</svg>')
(OUT / 'data-model.svg').write_text(''.join(s), encoding='utf-8')

print('wrote', sorted(p.name for p in OUT.glob('*.svg')))
