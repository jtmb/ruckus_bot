#!/usr/bin/env python3
"""Build the editable cost/resource model workbook.

Currency: EUR. Quoted prices carry the access date; estimates are labelled and unknowns are
never turned into zero. Run: python3 -B docs/operating-kit/scripts/build_cost_model.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'data' / 'cost-model.xlsx'

FILL = PatternFill('solid', fgColor='171A21')
WHITE = Font(color='E8ECF3', bold=True, size=10)
TITLE = Font(color='E8ECF3', bold=True, size=14)
MUTED = Font(color='9AA4B2', size=10)
BOLD = Font(bold=True, size=10)
WRAP = Alignment(wrap_text=True, vertical='top')


def header(ws, row, values, widths=None):
    for i, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=i, value=v)
        c.fill = FILL
        c.font = WHITE
        c.alignment = Alignment(vertical='center', wrap_text=True)
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w


def main():
    wb = Workbook()

    # ------------------------------------------------------------ README
    ws = wb.active
    ws.title = 'README'
    ws.column_dimensions['A'].width = 28
    ws.column_dimensions['B'].width = 100
    rows = [
        ('Purpose', 'Editable low/base/high cost model for one self-hosted ruckus_bot deployment.'),
        ('Currency', 'EUR (€), excluding VAT unless a source says otherwise.'),
        ('Quoted prices on', '2026-11-16'),
        ('Scope', 'One Linux host with Docker Compose, one MySQL instance, one domain, backups, provider APIs, '
                  'implementation and operating labour. No revenue is modelled.'),
        ('Not included', 'Paid support contracts, legal review, marketing, hardware purchase, Kubernetes, '
                         'multi-region failover.'),
        ('Unknowns', 'See the Unknowns sheet. They are not zeroed; the high scenario carries a placeholder.'),
        ('Editing', 'Change the Assumptions sheet and the unit prices on Scenarios. Totals are formulas.'),
        ('Basis', 'Host price is the Hetzner Cloud "from €5.49/month excl. VAT" Regular Performance quote '
                  '(hetzner.com/cloud, accessed 2026-11-16). Other unit prices are estimates and are labelled.'),
    ]
    for r, (k, v) in enumerate(rows, start=1):
        ws.cell(row=r, column=1, value=k).font = BOLD
        c = ws.cell(row=r, column=2, value=v)
        c.alignment = WRAP
        c.font = Font(size=10)

    # ------------------------------------------------------------ Assumptions
    ws = wb.create_sheet('Assumptions')
    ws['A1'] = 'Assumptions'
    ws['A1'].font = TITLE
    ws['A1'].fill = FILL
    header(ws, 3, ['Assumption', 'Value', 'Unit', 'Basis'], [46, 14, 12, 62])
    data = [
        ('Labour rate (internal, estimate)', 45, 'EUR/hour', 'Owner must replace with the real internal rate.'),
        ('Implementation hours — low', 80, 'hours', 'Estimate: launch scope only, no later features.'),
        ('Implementation hours — base', 140, 'hours', 'Estimate: launch scope + the five new launch features.'),
        ('Implementation hours — high', 220, 'hours', 'Estimate: includes Next 16 migration friction and rework.'),
        ('Operations hours per month — low', 1, 'hours/month', 'Estimate: patching and backups only.'),
        ('Operations hours per month — base', 2, 'hours/month', 'Estimate: plus incident review and updates.'),
        ('Operations hours per month — high', 4, 'hours/month', 'Estimate: plus dependency churn and drills.'),
        ('Host unit price', 5.49, 'EUR/month', 'Hetzner Cloud Regular Performance, from-price, excl. VAT, 2026-11-16.'),
        ('Host units — low', 1, 'count', 'One small host.'),
        ('Host units — base', 2, 'count', 'Headroom assumption (2x the entry price).'),
        ('Host units — high', 4, 'count', 'Higher tier for growth or staging.'),
        ('Domain (annual, estimate)', 15, 'EUR/year', 'Estimate; registration price varies by TLD.'),
        ('Backup storage — low', 0, 'EUR/month', 'Local volume only; risky, listed as a low-case choice.'),
        ('Backup storage — base', 2.5, 'EUR/month', 'Estimate for a small off-host object store.'),
        ('Backup storage — high', 5, 'EUR/month', 'Estimate with longer retention.'),
        ('Provider API cost — low/base', 0, 'EUR/month', 'Discord, JokeAPI, gamerpower, purgomalum, evilinsult are free.'),
        ('Provider API cost — high', 40, 'EUR/month', 'Unknown paid weather plan placeholder (see Unknowns).'),
    ]
    for r, row in enumerate(data, start=4):
        for c, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.alignment = WRAP
            cell.font = Font(size=10)

    # ------------------------------------------------------------ Scenarios
    ws = wb.create_sheet('Scenarios')
    ws['A1'] = 'Scenarios (EUR, formulas reference Assumptions)'
    ws['A1'].font = TITLE
    ws['A1'].fill = FILL
    header(ws, 3, ['Line item', 'Unit', 'Low', 'Base', 'High', 'Note'], [40, 14, 12, 12, 12, 52])
    A = 'Assumptions!'
    rows = [
        ('Host', 'EUR/month', f'={A}B12*{A}B11', f'={A}B13*{A}B11', f'={A}B14*{A}B11', 'Units × host unit price'),
        ('Domain', 'EUR/month', f'={A}B15/12', f'={A}B15/12', f'={A}B15/12', 'Annual estimate / 12'),
        ('Backup storage', 'EUR/month', f'={A}B16', f'={A}B17', f'={A}B18', 'Off-host storage estimate'),
        ('Provider APIs', 'EUR/month', f'={A}B19', f'={A}B19', f'={A}B20', 'Free tiers; high case = unknown paid plan'),
        ('Alerting', 'EUR/month', 0, 0, 0, 'Discord webhook to an existing channel'),
    ]
    for r, (name, unit, low, base, high, note) in enumerate(rows, start=4):
        ws.cell(row=r, column=1, value=name).font = Font(size=10)
        ws.cell(row=r, column=2, value=unit).font = Font(size=10)
        for c, v in ((3, low), (4, base), (5, high)):
            ws.cell(row=r, column=c, value=v).number_format = '#,##0.00'
        ws.cell(row=r, column=6, value=note).font = MUTED

    ws.cell(row=9, column=1, value='Infrastructure subtotal').font = BOLD
    for c in (3, 4, 5):
        cell = ws.cell(row=9, column=c, value=f'=SUM({get_column_letter(c)}4:{get_column_letter(c)}8)')
        cell.number_format = '#,##0.00'
        cell.font = BOLD

    ws.cell(row=10, column=1, value='Labour rate (EUR/h)').font = Font(size=10)
    for c in (3, 4, 5):
        ws.cell(row=10, column=c, value=f'={A}B4').number_format = '#,##0.00'

    ws.cell(row=11, column=1, value='Implementation labour (one-off)').font = Font(size=10)
    for c, src in ((3, 'B5'), (4, 'B6'), (5, 'B7')):
        cell = ws.cell(row=11, column=c, value=f'={A}{src}*C10'.replace('C10', f'{get_column_letter(c)}10'))
        cell.number_format = '#,##0.00'

    ws.cell(row=12, column=1, value='Operations labour (EUR/month)').font = Font(size=10)
    for c, src in ((3, 'B8'), (4, 'B9'), (5, 'B10')):
        cell = ws.cell(row=12, column=c, value=f'={A}{src}*C10'.replace('C10', f'{get_column_letter(c)}10'))
        cell.number_format = '#,##0.00'

    ws.cell(row=13, column=1, value='Monthly run cost (infra + ops labour)').font = BOLD
    for c in (3, 4, 5):
        cell = ws.cell(row=13, column=c, value=f'={get_column_letter(c)}9+{get_column_letter(c)}12')
        cell.number_format = '#,##0.00'
        cell.font = BOLD

    ws.cell(row=14, column=1, value='Year one total (12 months + implementation)').font = BOLD
    for c in (3, 4, 5):
        cell = ws.cell(row=14, column=c, value=f'={get_column_letter(c)}13*12+{get_column_letter(c)}11')
        cell.number_format = '#,##0.00'
        cell.font = BOLD

    ws.cell(row=16, column=1, value='Reading the result').font = BOLD
    ws.cell(row=17, column=1, value='Infrastructure alone is small (single-digit to low double-digit EUR per month). '
                                    'Labour dominates the year-one figure. The high case is a ceiling for planning, '
                                    'not a quote.').alignment = WRAP
    ws.merge_cells('A17:F19')

    # ------------------------------------------------------------ Price sources
    ws = wb.create_sheet('Price sources')
    header(ws, 1, ['Item', 'Price', 'Unit', 'Kind', 'Source', 'Accessed'], [26, 14, 12, 12, 66, 12])
    src = [
        ('Hetzner Cloud Regular Performance', 5.49, 'EUR/month excl. VAT', 'quoted',
         'https://www.hetzner.com/cloud/ — "starting from €5.49 per month, excl. VAT"', '2026-11-16'),
        ('Domain registration', 15, 'EUR/year', 'estimate', 'Typical registrar price; not quoted in this session', '—'),
        ('Off-host backup storage', 2.5, 'EUR/month', 'estimate', 'Small object-store bucket; provider not selected', '—'),
        ('Labour rate', 45, 'EUR/hour', 'estimate', 'Planning placeholder; owner must supply', '—'),
        ('Discord Bot API', 0, 'EUR/month', 'quoted-free', 'Discord developer platform, no charge for bot traffic', '2026-11-16'),
        ('OpenWeatherMap', 0, 'EUR/month', 'unknown', 'Free plan exists; quota and paid tier not verified (ASM-006)', '—'),
        ('JokeAPI, gamerpower, purgomalum, evilinsult', 0, 'EUR/month', 'quoted-free', 'Public free endpoints used by the bot', '2026-11-16'),
    ]
    for r, row in enumerate(src, start=2):
        for c, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.alignment = WRAP
            cell.font = Font(size=10)

    # ------------------------------------------------------------ Unknowns
    ws = wb.create_sheet('Unknowns')
    header(ws, 1, ['Unknown', 'Why it matters', 'Placeholder used', 'Resolution'], [34, 50, 24, 52])
    unk = [
        ('OpenWeatherMap plan/quota', 'Weather command may need a paid plan at volume', 'High case 40 EUR/month',
         'Owner inspects the provider dashboard at activation'),
        ('Owner labour rate', 'Dominates year-one cost', '45 EUR/hour estimate', 'Owner supplies the real rate'),
        ('Off-host backup availability', 'Determines RPO and whether backup cost is zero', '2.50 EUR/month',
         'Confirm existing storage or provision a bucket'),
        ('Staging host', 'Adds a second host and database if required', 'Not included',
         'Owner decides whether staging is required'),
        ('Growth beyond 50 guilds', 'May require a bigger host or managed database', 'Not included',
         'Re-price after the WP8 capacity measurement'),
    ]
    for r, row in enumerate(unk, start=2):
        for c, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.alignment = WRAP
            cell.font = Font(size=10)

    wb.save(OUT)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
