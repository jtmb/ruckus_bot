#!/usr/bin/env python3
"""Check planning package integrity: links, IDs, coverage, workbooks, visuals.

Read-only. Prints a summary and exits non-zero on a failing check.
Run: python3 -B docs/operating-kit/scripts/check_planning_package.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
errors = []
warnings = []
checks = []


def ok(name, detail=''):
    checks.append((name, 'pass', detail))


def fail(name, detail):
    checks.append((name, 'FAIL', detail))
    errors.append(f'{name}: {detail}')


# ------------------------------------------------------------------ 1. required files
required = [
    'AGENTS.md', 'MEMORY.md', 'readme.md', 'docs/README.md',
    'docs/planning/README.md', 'docs/planning/validation-report.md',
    'docs/planning/operations/00_START_HERE.md',
    'docs/planning/operations/01_MASTER_PLAN.md',
    'docs/planning/operations/02_DOMAIN_AND_PRODUCT_CONTRACTS.md',
    'docs/planning/operations/03_ARCHITECTURE_AND_REPOSITORY.md',
    'docs/planning/operations/04_SKILL_AND_AGENT_DESIGNS.md',
    'docs/planning/operations/05_DESIGN_AND_ACCESSIBILITY.md',
    'docs/planning/operations/06_SECURITY_AND_OPERATIONS.md',
    'docs/planning/operations/07_IMPLEMENTATION_ROADMAP.md',
    'docs/memory/08_FRESH_CHAT_HANDOFF.txt',
    'docs/planning/contracts/command-contract.md',
    'docs/planning/contracts/api-contract.md',
    'docs/planning/contracts/data-model.md',
    'docs/planning/contracts/session-contract.md',
    'docs/planning/evidence/2026-11-16-baseline-review.md',
    'docs/operating-kit/RULES.md',
    'docs/operating-kit/roles/integrator.md',
    'docs/operating-kit/roles/implementer.md',
    'docs/operating-kit/roles/reviewer.md',
    'docs/operating-kit/roles/operator.md',
    'docs/operating-kit/skill-designs/ruckus-command-change/SKILL.md',
    'docs/operating-kit/skill-designs/ruckus-api-change/SKILL.md',
    'docs/operating-kit/skill-designs/ruckus-dashboard-change/SKILL.md',
    'docs/operating-kit/skill-designs/ruckus-release-verify/SKILL.md',
    'docs/operating-kit/skill-designs/ruckus-ops-recovery/SKILL.md',
    'docs/operating-kit/feature-guides/bot-area.AGENTS.md',
    'docs/operating-kit/feature-guides/api-area.AGENTS.md',
    'docs/operating-kit/feature-guides/dashboard-area.AGENTS.md',
    'docs/research/stack-and-providers.md',
    'docs/visuals/manifest.json',
    'docs/visuals/diagrams/context.svg',
    'docs/visuals/diagrams/architecture.svg',
    'docs/visuals/diagrams/command-flow.svg',
    'docs/visuals/diagrams/data-model.svg',
    'docs/visuals/mockups/dashboard-1440.png',
    'docs/visuals/mockups/logs-1440.png',
    'docs/visuals/mockups/users-1440.png',
    'docs/visuals/mockups/mobile-390.png',
    'data/requirements.json', 'data/decisions.json', 'data/dependencies.json',
    'data/assumptions.json', 'data/sources.json', 'data/scope-history.json',
    'data/gates.json', 'data/work-packages.json',
    'data/acceptance_tracker.xlsx', 'data/cost-model.xlsx',
]
missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    fail('required files', f'missing {missing}')
else:
    ok('required files', f'{len(required)} present')

# ------------------------------------------------------------------ 2. markdown links
link_re = re.compile(r'\[[^\]]+\]\(([^)]+)\)')
broken = []
count = 0
# Links that are broken in the baseline revision itself and are recorded as work to do.
# Keeping them explicit avoids hiding a new regression behind a passing check.
KNOWN_BASELINE = {
    'readme.md -> LICENSE': 'LICENSE is absent in main@711ff12; FIX-028 / ASM-008 (owner must confirm GPLv3).',
}
for md in list(ROOT.glob('*.md')) + list((ROOT / 'docs').rglob('*.md')):
    text = md.read_text(encoding='utf-8', errors='ignore')
    for target in link_re.findall(text):
        t = target.strip().split('#')[0].strip()
        if not t or t.startswith(('http://', 'https://', 'mailto:', 'tel:')):
            continue
        count += 1
        resolved = (md.parent / t).resolve()
        if not resolved.exists():
            key = f'{md.relative_to(ROOT)} -> {target}'
            if key in KNOWN_BASELINE:
                warnings.append(f'known baseline defect: {key} ({KNOWN_BASELINE[key]})')
            else:
                broken.append(key)
if broken:
    fail('markdown links', f'{len(broken)} broken: {broken[:5]}')
else:
    ok('markdown links', f'{count} relative links resolve')

# ------------------------------------------------------------------ 3. records
reqs = json.loads((ROOT / 'data/requirements.json').read_text())
wps = json.loads((ROOT / 'data/work-packages.json').read_text())
gates = json.loads((ROOT / 'data/gates.json').read_text())
decisions = json.loads((ROOT / 'data/decisions.json').read_text())
ids = [r['id'] for r in reqs['requirements']]
if len(ids) != len(set(ids)):
    fail('requirement ids', 'duplicate ids')
else:
    ok('requirement ids', f'{len(ids)} unique')

wp_ids = {w['id'] for w in wps['work_packages']}
bad_wp = [r['id'] for r in reqs['requirements'] if r['work_package'] not in wp_ids]
if bad_wp:
    fail('requirement work packages', f'unknown: {bad_wp}')
else:
    ok('requirement work packages', 'all resolve')

bad_dep = [(r['id'], d) for r in reqs['requirements'] for d in r['depends_on'] if d not in set(ids)]
if bad_dep:
    fail('requirement dependencies', f'unknown: {bad_dep}')
else:
    ok('requirement dependencies', 'all resolve')

wp_dep = [(w['id'], d) for w in wps['work_packages'] for d in w['depends_on'] if d not in wp_ids]
if wp_dep:
    fail('work package dependencies', f'unknown: {wp_dep}')
else:
    ok('work package dependencies', 'all resolve')

# every requirement appears in exactly its declared work package list
mismatch = []
for w in wps['work_packages']:
    listed = set(w['requirement_ids'])
    actual = {r['id'] for r in reqs['requirements'] if r['work_package'] == w['id']}
    if listed != actual:
        mismatch.append((w['id'], sorted(listed ^ actual)))
if mismatch:
    fail('work package coverage', f'mismatch {mismatch}')
else:
    ok('work package coverage', 'requirement lists match')

# sequence order respects dependencies
seq = {w['id']: w['sequence'] for w in wps['work_packages']}
order_bad = [(w['id'], d) for w in wps['work_packages'] for d in w['depends_on'] if seq[d] > seq[w['id']]]
if order_bad:
    fail('work package order', f'dependency after dependent: {order_bad}')
else:
    ok('work package order', 'dependencies precede dependents')

# spec paths resolve
spec_missing = sorted({r['spec'] for r in reqs['requirements'] if not (ROOT / r['spec']).exists()})
if spec_missing:
    fail('requirement spec links', f'missing {spec_missing}')
else:
    ok('requirement spec links', 'all specification documents exist')

# decisions have required fields
incomplete = [d['id'] for d in decisions['decisions']
              if not all(d.get(k) for k in ('title', 'decision', 'rationale', 'reconsideration_trigger'))]
if incomplete:
    fail('decision records', f'incomplete {incomplete}')
else:
    ok('decision records', f"{len(decisions['decisions'])} complete")

# gate dependency: every WP gate exists
gate_ids = {g['id'] for g in gates['gates']}
bad_gate = [w['id'] for w in wps['work_packages'] if w['gate'] not in gate_ids]
if bad_gate:
    fail('work package gates', f'unknown gate {bad_gate}')
else:
    ok('work package gates', 'all resolve')

# ------------------------------------------------------------------ 4. visuals manifest
manifest = json.loads((ROOT / 'docs/visuals/manifest.json').read_text())
vis_missing = [e['file'] for e in manifest['entries']
               if not (ROOT / 'docs/visuals' / e['file']).resolve().exists()]
if vis_missing:
    fail('visual manifest files', f'missing {vis_missing}')
else:
    ok('visual manifest files', f"{len(manifest['entries'])} entries resolve")

# diagrams parse as XML
import xml.etree.ElementTree as ET
for svg in sorted((ROOT / 'docs/visuals/diagrams').glob('*.svg')):
    try:
        ET.parse(svg)
    except ET.ParseError as exc:
        fail('diagram xml', f'{svg.name}: {exc}')
else:
    ok('diagram xml', 'all diagrams parse')

# ------------------------------------------------------------------ 5. workbooks
from openpyxl import load_workbook

wb = load_workbook(ROOT / 'data/acceptance_tracker.xlsx')
sheets = set(wb.sheetnames)
need = {'README', 'Requirements', 'Work Packages', 'Gates', 'Summary'}
if not need.issubset(sheets):
    fail('tracker sheets', f'missing {need - sheets}')
else:
    ok('tracker sheets', ', '.join(wb.sheetnames))

req_sheet = wb['Requirements']
sheet_ids = [req_sheet.cell(row=r, column=1).value for r in range(5, 5 + len(ids))]
if sheet_ids != ids:
    fail('tracker ids', 'row order differs from requirements.json')
else:
    ok('tracker ids', f'{len(ids)} rows in canonical order')

cost = load_workbook(ROOT / 'data/cost-model.xlsx')
need_cost = {'README', 'Assumptions', 'Scenarios', 'Price sources', 'Unknowns'}
if not need_cost.issubset(set(cost.sheetnames)):
    fail('cost model sheets', f'missing {need_cost - set(cost.sheetnames)}')
else:
    ok('cost model sheets', ', '.join(cost.sheetnames))

# ------------------------------------------------------------------ 6. measured baseline claims still match evidence
review = (ROOT / 'docs/planning/evidence/2026-11-16-baseline-review.md').read_text()
for claim in ['5,290', '205', '12 giveaways', 'ECONNREFUSED', '50006']:
    if claim not in review:
        warnings.append(f'evidence text lacks expected measurement marker: {claim}')
if warnings:
    ok('evidence markers', f'{len(warnings)} warning(s)')
else:
    ok('evidence markers', 'key measurements present')

# ------------------------------------------------------------------ report
width = max(len(c[0]) for c in checks)
for name, state, detail in checks:
    print(f'{name.ljust(width)}  {state:4}  {detail}')
for w in warnings:
    print('warning:', w)
print()
print(f'{len(checks)} checks, {len(errors)} failure(s)')
sys.exit(1 if errors else 0)
