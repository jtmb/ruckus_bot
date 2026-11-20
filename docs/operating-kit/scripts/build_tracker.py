#!/usr/bin/env python3
"""Build the derived acceptance tracker workbook from the canonical planning records.

Source of truth: data/requirements.json, data/work-packages.json, data/gates.json.
Reviewers may edit only the Status, Verification and Reviewer columns in the workbook;
the integrator imports those three columns by requirement ID before regenerating.

Run: python3 -B docs/operating-kit/scripts/build_tracker.py
"""
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'data'

HEADER_FILL = PatternFill('solid', fgColor='171A21')
HEADER_FONT = Font(color='E8ECF3', bold=True, size=10)
TITLE_FONT = Font(color='E8ECF3', bold=True, size=14)
MUTED = Font(color='9AA4B2', size=10)
THIN = Side(style='thin', color='D9DEE7')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical='top')


def sheet_header(ws, title, subtitle, widths):
    """Writes a title block and returns the header row index."""
    ws['A1'] = title
    ws['A1'].font = TITLE_FONT
    ws['A1'].fill = HEADER_FILL
    ws['A2'] = subtitle
    ws['A2'].font = MUTED
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    return 4


def write_table(ws, header_row, headers, rows):
    """Writes a header row plus data rows with consistent styling."""
    for c, name in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=c, value=name)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.border = BORDER
        cell.alignment = Alignment(vertical='center', wrap_text=True)
    for r, row in enumerate(rows, start=header_row + 1):
        for c, value in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=value)
            cell.border = BORDER
            cell.alignment = WRAP
            cell.font = Font(size=9)
    return header_row + len(rows)


def main():
    reqs = json.loads((DATA / 'requirements.json').read_text())
    wps = json.loads((DATA / 'work-packages.json').read_text())
    gates = json.loads((DATA / 'gates.json').read_text())

    wb = Workbook()

    # ---------------------------------------------------------------- README
    ws = wb.active
    ws.title = 'README'
    ws.column_dimensions['A'].width = 26
    ws.column_dimensions['B'].width = 96
    rows = [
        ('Artifact', 'Derived acceptance tracker for ruckus_bot'),
        ('Generated', '2026-11-16'),
        ('Baseline revision', 'main@711ff12'),
        ('Canonical sources', 'data/requirements.json, data/work-packages.json, data/gates.json'),
        ('Regeneration', 'python3 -B docs/operating-kit/scripts/build_tracker.py'),
        ('Editable columns', 'Status, Verification, Reviewer (Requirements sheet only)'),
        ('Import rule', 'Integrator imports those three columns by ID before regenerating; conflicts are '
                        'resolved in favour of the JSON and quoted in the task record.'),
        ('State semantics', 'not_started = work not begun; planned = accepted for a later phase; '
                            'preserved = existing behaviour that must keep working.'),
        ('Verification', 'not_verified until an evidence file records an observed check.'),
        ('Warning', 'Planning completion is not implementation completion. No gate here is passed by this '
                    'workbook.'),
    ]
    for r, (k, v) in enumerate(rows, start=1):
        ws.cell(row=r, column=1, value=k).font = Font(bold=True, size=10)
        ws.cell(row=r, column=2, value=v).alignment = WRAP
        ws.cell(row=r, column=2).font = Font(size=10)

    # ---------------------------------------------------------------- Requirements
    ws = wb.create_sheet('Requirements')
    headers = ['ID', 'Kind', 'Priority', 'Phase', 'Status', 'Title', 'Acceptance', 'Work package',
               'Owner', 'Depends on', 'Specification', 'Evidence', 'Verification', 'Reviewer']
    header_row = sheet_header(ws, 'Requirements', 'One row per canonical requirement. Edit only Status, '
                               'Verification and Reviewer.', [10, 12, 9, 9, 13, 38, 60, 13, 18, 22, 46, 34, 13, 12])
    rows = []
    for r in reqs['requirements']:
        rows.append([
            r['id'], r['kind'], r['priority'], r['phase'], r['status'], r['title'],
            '\n'.join(r['acceptance']) if isinstance(r['acceptance'], list) else r['acceptance'],
            r['work_package'], r['owner'], ', '.join(r['depends_on']), r['spec'],
            r['evidence'] or '—', r['verification'], r['reviewer'],
        ])
    last = write_table(ws, header_row, headers, rows)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=2)
    ws.auto_filter.ref = f'A{header_row}:N{last}'

    status_dv = DataValidation(type='list', formula1='"not_started,in_progress,blocked,done,preserved,planned"',
                               allow_blank=False)
    ver_dv = DataValidation(type='list', formula1='"not_verified,verified,failed"', allow_blank=False)
    ws.add_data_validation(status_dv)
    ws.add_data_validation(ver_dv)
    status_dv.add(f'E{header_row+1}:E{last}')
    ver_dv.add(f'M{header_row+1}:M{last}')

    green = PatternFill('solid', fgColor='D9F2E6')
    red = PatternFill('solid', fgColor='FBDDE1')
    amber = PatternFill('solid', fgColor='FFF1CC')
    ws.conditional_formatting.add(f'M{header_row+1}:M{last}',
                                  CellIsRule(operator='equal', formula=['"verified"'], fill=green))
    ws.conditional_formatting.add(f'M{header_row+1}:M{last}',
                                  CellIsRule(operator='equal', formula=['"failed"'], fill=red))
    ws.conditional_formatting.add(f'E{header_row+1}:E{last}',
                                  CellIsRule(operator='equal', formula=['"blocked"'], fill=amber))

    # ---------------------------------------------------------------- Work packages
    ws = wb.create_sheet('Work Packages')
    headers = ['ID', 'Sequence', 'Title', 'Owner', 'Depends on', 'Gate', 'Objective',
               'Exit criteria', 'Stop condition', 'Requirement IDs', 'State']
    header_row = sheet_header(ws, 'Work packages', 'Execution order and bounded scope.',
                              [8, 9, 34, 18, 18, 7, 52, 40, 40, 46, 13])
    rows = []
    for w in wps['work_packages']:
        rows.append([w['id'], w['sequence'], w['title'], w['owner'], ', '.join(w['depends_on']),
                     w['gate'], w['objective'], '\n'.join(w['exit_criteria']), w['stop_condition'],
                     ', '.join(w['requirement_ids']) or '(enabling work)', w['state']])
    last = write_table(ws, header_row, headers, rows)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    ws.auto_filter.ref = f'A{header_row}:K{last}'

    # ---------------------------------------------------------------- Gates
    ws = wb.create_sheet('Gates')
    headers = ['ID', 'Title', 'State', 'Owner', 'Criteria', 'Evidence']
    header_row = sheet_header(ws, 'Release gates', 'A gate is passed only with observed evidence.',
                              [7, 42, 12, 18, 70, 48])
    rows = [[g['id'], g['title'], g['state'], g['owner'], g['criteria'], g['evidence']]
            for g in gates['gates']]
    last = write_table(ws, header_row, headers, rows)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    ws.conditional_formatting.add(f'C{header_row+1}:C{last}',
                                  CellIsRule(operator='equal', formula=['"passed"'], fill=green))
    ws.conditional_formatting.add(f'C{header_row+1}:C{last}',
                                  CellIsRule(operator='equal', formula=['"not_passed"'], fill=amber))

    # ---------------------------------------------------------------- Summary
    ws = wb.create_sheet('Summary')
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 12
    ws.column_dimensions['C'].width = 12
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 12
    ws['A1'] = 'Summary (formulas over the Requirements and Gates sheets)'
    ws['A1'].font = TITLE_FONT
    ws['A1'].fill = HEADER_FILL
    headers = ['Measure', 'Value', '', '', '']
    ws['A3'] = 'Measure'
    ws['B3'] = 'Value'
    for c in ('A3', 'B3'):
        ws[c].fill = HEADER_FILL
        ws[c].font = HEADER_FONT
    metrics = [
        ('Total requirements', "=COUNTA(Requirements!A5:A200)"),
        ('Preserve', '=COUNTIF(Requirements!B5:B200,"preserve")'),
        ('Fix', '=COUNTIF(Requirements!B5:B200,"fix")'),
        ('Security', '=COUNTIF(Requirements!B5:B200,"security")'),
        ('Feature', '=COUNTIF(Requirements!B5:B200,"feature")'),
        ('Operations', '=COUNTIF(Requirements!B5:B200,"operations")'),
        ('Documentation', '=COUNTIF(Requirements!B5:B200,"documentation")'),
        ('P0', '=COUNTIF(Requirements!C5:C200,"P0")'),
        ('Launch phase', '=COUNTIF(Requirements!D5:D200,"launch")'),
        ('Later phase', '=COUNTIF(Requirements!D5:D200,"later")'),
        ('Preserved baseline behaviour', '=COUNTIF(Requirements!E5:E200,"preserved")'),
        ('In progress', '=COUNTIF(Requirements!E5:E200,"in_progress")'),
        ('Done', '=COUNTIF(Requirements!E5:E200,"done")'),
        ('Blocked', '=COUNTIF(Requirements!E5:E200,"blocked")'),
        ('Verified', '=COUNTIF(Requirements!M5:M200,"verified")'),
        ('Gates passed', '=COUNTIF(Gates!C5:C200,"passed")'),
        ('Gates not passed', '=COUNTIF(Gates!C5:C200,"not_passed")'),
        ('Work packages', "=COUNTA('Work Packages'!A5:A200)"),
    ]
    for i, (k, v) in enumerate(metrics, start=4):
        ws.cell(row=i, column=1, value=k).font = Font(size=10)
        ws.cell(row=i, column=2, value=v).font = Font(size=10, bold=True)
    ws['A25'] = ('Note: rows beyond the generated range are ignored by these formulas; regenerate the '
                 'workbook after importing reviewer edits.')
    ws['A25'].font = MUTED

    out = DATA / 'acceptance_tracker.xlsx'
    wb.save(out)
    print('wrote', out, 'requirements:', len(reqs['requirements']))


if __name__ == '__main__':
    main()
