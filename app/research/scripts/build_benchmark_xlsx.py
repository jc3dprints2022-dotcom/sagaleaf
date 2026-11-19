"""Competitive benchmarking workbook. Every total is a live formula over the
Weights and Scores sheets, so changing a weight or a score re-ranks everything."""
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment
from openpyxl.formatting.rule import ColorScaleRule

R = 'research/'
weights = json.load(open(R + 'reader_scores.json'))['weights']
sc = json.load(open(R + 'reader_scores.json'))
matrix = json.load(open(R + 'reader_matrix.json'))
econ = json.load(open(R + 'unit_economics.json'))
bench = json.load(open('bench/results.json')); bb = json.load(open('bench/browser-results.json')); e2e = json.load(open('e2e/results.json'))
cats = list(weights.keys())

F = 'Arial'
H = Font(name=F, bold=True, color='FFFFFF'); HF = PatternFill('solid', fgColor='1F2A30')
B = Font(name=F); BB = Font(name=F, bold=True); BLUE = Font(name=F, color='0000FF'); GREEN = Font(name=F, color='008000')
T = Font(name=F, bold=True, size=14); IT = Font(name=F, italic=True, color='57646A')
SAGA_FILL = PatternFill('solid', fgColor='D5E7E1'); PLAN_FILL = PatternFill('solid', fgColor='F1DFD2'); YEL = PatternFill('solid', fgColor='FFFF00')
thin = Border(bottom=Side(style='thin', color='D2D7D0'))
wrap = Alignment(wrap_text=True, vertical='top')

def header(ws, row, vals, widths=None):
    for i, v in enumerate(vals, 1):
        c = ws.cell(row=row, column=i, value=v); c.font = H; c.fill = HF; c.alignment = Alignment(wrap_text=True, vertical='center')
    if widths:
        for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=2)

wb = Workbook()
# ---------------------------------------------------------------- Read me
ws = wb.active; ws.title = 'Read me'
lines = [
    ('SAGA competitive benchmarking', T),
    ('Built 2026-11-17 from research/reader_scores.json, reader_matrix.json, unit_economics.json and the measured results in bench/ and e2e/.', IT),
    ('', B),
    ('How to use', BB),
    ('Blue numbers are inputs. Change a weight on Weights or a score on Scores and every total, rank and chart-ready column updates.', B),
    ('Competitor scores (0-10) come from published evidence only (reviews, docs, user reports); none were tested hands-on. See research/reader_summary.md.', B),
    ('SAGA is scored twice and kept separate: "SAGA (built and tested)" credits only what passes automated tests today; "SAGA (planned)" is the roadmap target and must not be quoted as current.', B),
    ('Weights reflect the user research (what people cite when they stay, switch or complain), tilted toward SAGA’s ownership-first audience. A mass-market weighting would rank Kindle higher.', B),
    ('Measured goals compares targets with numbers measured on this prototype (dev server, Chrome, simulated Leaf). They are not production numbers.', B),
    ('', B),
    ('Sheets', BB), ('Weights · Scores · Feature matrix · Measured goals · Unit economics', B),
]
for i, (t, f) in enumerate(lines, 1): c = ws.cell(row=i, column=1, value=t); c.font = f; c.alignment = Alignment(wrap_text=True)
ws.column_dimensions['A'].width = 120

# ---------------------------------------------------------------- Weights
ws = wb.create_sheet('Weights')
header(ws, 1, ['Category', 'Weight (%)', 'Why this weight (from the research)'], [26, 12, 110])
why = {
 'Reading quality': 'Typography and layout drive most love and hate across Kobo, KOReader and Kindle reviews.',
 'Ease of use': 'KOReader and Calibre complexity complaints show power alone does not win.',
 'Library management': 'Series and sorting gaps on Kindle; Calibre is loved for exactly this.',
 'Synchronization': 'Whispersync is the top reason people stay; no sync for sideloaded books is the top unmet need.',
 'Offline functionality': 'Sideload-deletion and captive-portal stories; cloud-first readers need pre-caching.',
 'Annotation quality': 'Clipping limits, awkward export and lost highlights; Readwise is loved for its pipeline.',
 'Format compatibility': 'Send-to-Kindle conversion failures and EPUB errors recur.',
 'Device integration': 'Kobo/Calibre openness and Kindle hardware are major choice drivers; SAGA Leaf depends on it.',
 'Accessibility': 'TTS gaps and NFB criticism; a smaller but high-impact audience.',
 'Privacy & ownership': 'USB download removal, telemetry, Pocket deletion; SAGA’s core differentiator.',
 'Performance': 'Firmware lag and slow PDFs come up, less often than the categories above.',
 'Cost': 'Readwise price and ad tiers draw complaints, but most readers are free or buy hardware once.',
}
for i, c in enumerate(cats, 2):
    ws.cell(row=i, column=1, value=c).font = B
    w = ws.cell(row=i, column=2, value=weights[c]); w.font = BLUE
    ws.cell(row=i, column=3, value=why[c]).font = B
n = len(cats) + 1
ws.cell(row=n + 1, column=1, value='Total (must be 100)').font = BB
ws.cell(row=n + 1, column=2, value=f'=SUM(B2:B{n})').font = BB
ws.cell(row=n + 1, column=3, value=f'=IF(B{n+1}=100,"OK","Weights do not sum to 100")').font = B

# ---------------------------------------------------------------- Scores
ws = wb.create_sheet('Scores')
cols = ['Product'] + cats + ['Weighted score (0-10)', 'Rank', 'Basis', 'Rationale']
header(ws, 1, cols, [30] + [11] * len(cats) + [13, 7, 30, 80])
ws.row_dimensions[1].height = 48
saga_now = {'Reading quality': 6, 'Ease of use': 6, 'Library management': 6, 'Synchronization': 6, 'Offline functionality': 7, 'Annotation quality': 7, 'Format compatibility': 4, 'Device integration': 3, 'Accessibility': 5, 'Privacy & ownership': 9, 'Performance': 7, 'Cost': 9}
saga_plan = {'Reading quality': 8, 'Ease of use': 8, 'Library management': 8, 'Synchronization': 9, 'Offline functionality': 9, 'Annotation quality': 9, 'Format compatibility': 7, 'Device integration': 8, 'Accessibility': 8, 'Privacy & ownership': 9, 'Performance': 8, 'Cost': 8}
now_why = ('Credits only what passes automated tests: foliate-js EPUB rendering with typography controls and 4 themes; local-first library with dedupe, collections, 10k-book performance; '
           'end-to-end encrypted, conflict-safe sync (0 divergence, 0 lost notes under 30% injected failures); quote-anchored annotations with Markdown and W3C export; 0 axe violations. '
           'Held down by: Leaf integration tested only against a simulator; no TTS; EPUB/PDF/TXT only; demo-grade relay; no real-user testing.')
plan_why = 'Roadmap target (docs/ROADMAP.md): firmware 2 on real Leaf hardware, TTS, MOBI/CBZ/FB2, native apps, production sync service, screen-reader-tested reader. NOT a current capability.'
rows = [(p, sc['scores'][p], sc['basis'].get(p, 'published evidence only, not firsthand') if isinstance(sc['basis'], dict) else sc['basis'], sc['rationale'].get(p, ''), None) for p in sc['scores']]
rows += [('SAGA (built and tested)', saga_now, 'Automated tests and measurements in this repo (docs/TEST_RESULTS.md)', now_why, SAGA_FILL), ('SAGA (planned)', saga_plan, 'Roadmap target, not built', plan_why, PLAN_FILL)]
last = len(rows) + 1
wcol = len(cats) + 2
for r, (p, s, basis, why_, fill) in enumerate(rows, 2):
    ws.cell(row=r, column=1, value=p).font = BB if fill else B
    for j, c in enumerate(cats, 2):
        cell = ws.cell(row=r, column=j, value=s[c]); cell.font = BLUE; cell.alignment = Alignment(horizontal='center')
    first, lastc = get_column_letter(2), get_column_letter(len(cats) + 1)
    terms = '+'.join(f'{get_column_letter(j)}{r}*Weights!$B${j}' for j in range(2, len(cats) + 2))
    ws.cell(row=r, column=wcol, value=f"=ROUND(({terms})/Weights!$B${n+1},2)").number_format = '0.00'
    ws.cell(row=r, column=wcol + 1, value=f'=RANK({get_column_letter(wcol)}{r},${get_column_letter(wcol)}$2:${get_column_letter(wcol)}${last})')
    ws.cell(row=r, column=wcol + 2, value=basis).font = IT
    ws.cell(row=r, column=wcol + 3, value=why_).alignment = wrap
    if fill:
        for j in range(1, wcol + 4): ws.cell(row=r, column=j).fill = fill
ws.conditional_formatting.add(f'B2:{get_column_letter(len(cats)+1)}{last}', ColorScaleRule(start_type='num', start_value=0, start_color='F3D6D3', mid_type='num', mid_value=5, mid_color='FFFFFF', end_type='num', end_value=10, end_color='B9D8B0'))
ws.cell(row=last + 2, column=1, value='SAGA (planned) is a target. Rank it only against itself over time; do not present it as a competitive result.').font = IT

# ---------------------------------------------------------------- Feature matrix
ws = wb.create_sheet('Feature matrix')
prods = matrix['products']
saga_feat = {
 'EPUB sideload': 'yes', 'PDF': 'yes', 'TXT': 'yes', 'DRM-free export of own files': 'yes', 'Cross-device position sync for sideloaded books': 'yes', 'Highlight export (formats)': 'yes',
 'Annotation sync for sideloaded books': 'yes', 'Works fully offline': 'yes', 'No account required': 'yes', 'Open source': 'unknown', 'Library lending': 'no', 'Store': 'partial', 'TTS': 'no',
 'Dyslexia-friendly font': 'yes', 'Custom fonts': 'partial', 'Collections/tags': 'yes', 'Full-text search across library': 'yes', 'Reading stats': 'no',
 'Ads/upsell in reading UI (yes = bad)': 'no', 'Telemetry on reading behaviour (yes = bad)': 'no', 'Price: core reading free': 'yes', 'Web reader': 'yes', 'Android': 'partial', 'iOS': 'partial',
 'Desktop': 'partial', 'E-ink device support': 'partial', 'OPDS': 'no', 'Calibre integration': 'no', 'PDF reflow': 'no', 'Footnote popups': 'no', 'Vertical scroll mode': 'yes', 'Page-turn animation options': 'no',
}
saga_note = {'Store': 'Demo catalog only, no payments', 'Android': 'Web app/PWA in mobile browsers; no native app', 'iOS': 'Web app/PWA; no native app', 'Desktop': 'Web app/PWA', 'E-ink device support': 'SAGA Leaf: simulator-tested only', 'Open source': 'Licence not yet chosen', 'Custom fonts': '6 bundled faces incl. Atkinson Hyperlegible and OpenDyslexic; no user font upload', 'Highlight export (formats)': 'Markdown, W3C Web Annotation JSON-LD, full library zip'}
header(ws, 1, ['Feature'] + prods + ['SAGA (built and tested)', 'Note'], [38] + [13] * len(prods) + [16, 60])
ws.row_dimensions[1].height = 48
fills = {'yes': PatternFill('solid', fgColor='D7EAD2'), 'partial': PatternFill('solid', fgColor='F7EBC6'), 'no': PatternFill('solid', fgColor='F3D6D3'), 'unknown': PatternFill('solid', fgColor='EEEEEE')}
for r, f in enumerate(matrix['features'], 2):
    ws.cell(row=r, column=1, value=f['feature']).font = B
    vals = [f['values'].get(p, 'unknown') for p in prods] + [saga_feat.get(f['feature'], 'unknown')]
    for j, v in enumerate(vals, 2):
        c = ws.cell(row=r, column=j, value=v); c.font = B; c.alignment = Alignment(horizontal='center')
        bad = '(yes = bad)' in f['feature']
        key = {'yes': 'no', 'no': 'yes'}.get(v, v) if bad else v
        if key in fills: c.fill = fills[key]
    ws.cell(row=r, column=len(prods) + 3, value=(saga_note.get(f['feature'], '') + (' | ' if saga_note.get(f['feature']) and f.get('note') else '') + (f.get('note') or ''))).alignment = wrap
rr = len(matrix['features']) + 2
ws.cell(row=rr + 1, column=1, value='"yes" count (higher is better, except rows marked "yes = bad")').font = BB
for j in range(2, len(prods) + 3):
    L = get_column_letter(j); ws.cell(row=rr + 1, column=j, value=f'=COUNTIF({L}2:{L}{rr - 1},"yes")')
ws.cell(row=rr + 2, column=1, value='Competitor cells: research agent, published sources; "unknown" = not verified. A few platform cells came from general product knowledge (see reader_summary.md caveats).').font = IT

# ---------------------------------------------------------------- Measured goals
ws = wb.create_sheet('Measured goals')
header(ws, 1, ['Goal', 'Target', 'Measured on prototype', 'Unit', 'Lower is better?', 'Status', 'How it was measured'], [46, 12, 20, 12, 14, 12, 90])
m = e2e['metrics']; lb = bb['longBook']
goals = [
 ('Time to import a book (EPUB, 800 KB, through the file picker)', 1000, m['importMs'], 'ms', True, 'e2e/run.ts, Chrome, real IndexedDB'),
 ('Time from "Start reading" to text on screen', 1000, m['openMs'], 'ms', True, 'e2e/run.ts'),
 ('Time to open a 215k-word book (Moby-Dick) to text', 1000, lb['openToTextMs'], 'ms', True, 'bench/browser.ts'),
 ('Time to resume reading after an app restart (tap Continue to text)', 1000, m['resumeMs'], 'ms', True, 'e2e/run.ts, persistent Chrome profile closed and relaunched'),
 ('Page turn latency, median', 100, lb['pageTurnMs']['p50'], 'ms', True, 'bench/browser.ts, keypress to location change'),
 ('Page turn latency, 95th percentile', 150, lb['pageTurnMs']['p95'], 'ms', True, 'bench/browser.ts'),
 ('Jump to 85% via the scrubber', 500, lb['jumpTo85PercentMs'], 'ms', True, 'bench/browser.ts'),
 ('Leaf sync round trip (position + highlights)', 2000, m['leafSyncMs'], 'ms', True, 'e2e/run.ts against the simulated Leaf on localhost (no radio)'),
 ('Book transfer to Leaf after pairing', 5000, m['leafTransferMs'], 'ms', True, 'e2e/run.ts, simulator on localhost; real Wi-Fi will be slower'),
 ('Import success rate, valid files (1,000-book batch)', 1.0, (bench['bulkImport']['added'] + bench['bulkImport']['duplicatesDetected']) / (bench['bulkImport']['books'] - bench['bulkImport']['expectedFailures']), 'fraction', False, 'bench/run.ts; 10 deliberately broken files were rejected with messages and are excluded'),
 ('Exact duplicates detected', 1.0, 1.0 if bench['bulkImport']['duplicatesDetected'] == 20 else bench['bulkImport']['duplicatesDetected'] / 20, 'fraction', False, 'bench/run.ts, 20 planted duplicates'),
 ('Library load+sort+filter at 10,000 books', 200, bench['library10k']['loadSortFilterMs']['p50'], 'ms', True, 'bench/run.ts (Node, fake-indexeddb)'),
 ('Metadata search at 10,000 books', 50, bench['library10k']['metadataSearchMs']['p50'], 'ms', True, 'bench/run.ts'),
 ('Full-text passage search across ~1,000 books', 500, bench['fullTextSearchAcrossLibrary']['ms']['p50'], 'ms', True, 'bench/run.ts, scans local text index'),
 ('Annotations missing after sync under 30% network failure', 0, bench['syncStress']['annotationsMissingOnAnyDevice'], 'count', True, 'bench/run.ts + tests/sync-stress.test.ts (3 seeds)'),
 ('Note versions lost after sync under failure', 0, bench['syncStress']['noteVersionsLost'], 'count', True, 'causal check over every note write'),
 ('Devices disagreeing after convergence', 0, bench['syncStress']['devicesDisagreeingAfterConvergence'], 'count', True, 'bench/run.ts'),
 ('Interrupted Leaf transfer completes with matching checksum', 1, 1 if bench['leafTransferStress']['checksumMatches'] else 0, 'yes=1', False, f"{bench['leafTransferStress']['injectedDrops']} forced disconnects"),
 ('JS heap with a 215k-word book open', 100, lb['jsHeapMB'], 'MB', True, 'performance.memory in Chrome'),
 ('axe-core WCAG 2.1 A/AA violations across 11 screens', 0, sum(v['violations'] for v in bb['accessibility'].values()), 'count', True, 'bench/browser.ts; automated rules only, not a screen-reader audit'),
 ('Steps: import a book and start reading', 4, 3, 'taps', True, 'Add books, pick file, Read now (toast action)'),
 ('Steps: send the book you are reading to a paired Leaf', 1, 0, 'taps', True, 'automatic with "Send what I’m reading" on'),
]
for r, (g, t, v, u, low, how) in enumerate(goals, 2):
    ws.cell(row=r, column=1, value=g).font = B
    ws.cell(row=r, column=2, value=t).font = BLUE
    ws.cell(row=r, column=3, value=v).font = BLUE
    ws.cell(row=r, column=4, value=u).font = B
    ws.cell(row=r, column=5, value='yes' if low else 'no').font = B
    ws.cell(row=r, column=6, value=f'=IF(E{r}="yes",IF(C{r}<=B{r},"Met","Not met"),IF(C{r}>=B{r},"Met","Not met"))').font = BB
    ws.cell(row=r, column=7, value=how).alignment = wrap
    if u == 'fraction':
        ws.cell(row=r, column=2).number_format = '0.0%'; ws.cell(row=r, column=3).number_format = '0.0%'
ws.cell(row=len(goals) + 3, column=1, value='Targets are SAGA’s own goals, not competitor measurements. No competitor app was benchmarked hands-on in this session.').font = IT

# ---------------------------------------------------------------- Unit economics
ws = wb.create_sheet('Unit economics')
A = econ['assumptions']
ws['A1'] = 'Inputs (blue). Sources in column C.'; ws['A1'].font = BB
inputs = [('List price A ($)', 4.99, 'Example price'), ('List price B ($)', 9.99, 'Example price'),
          ('Card processing %', A['stripe_pct']['value'], A['stripe_pct']['source']), ('Card processing fixed ($)', A['stripe_fixed']['value'], A['stripe_fixed']['source']),
          ('Merchant-of-record %', A['mor_pct']['value'], A['mor_pct']['source']), ('Merchant-of-record fixed ($)', A.get('mor_fixed', {'value': 0.5})['value'], A.get('mor_fixed', {'source': 'https://www.paddle.com/pricing'})['source']),
          ('SAGA take (proposed)', 0.15, 'Proposal in docs/BUSINESS_MODEL.md, not an agreement'),
          ('KDP 70% rate', A['kdp_70_rate']['value'], A['kdp_70_rate']['source']), ('KDP delivery $/MB', A['kdp_delivery_usd_per_mb']['value'], A['kdp_delivery_usd_per_mb']['source']), ('Assumed file size (MB)', A['file_size_mb']['value'], A['file_size_mb']['source'])]
for i, (k, v, s) in enumerate(inputs, 2):
    ws.cell(row=i, column=1, value=k).font = B; c = ws.cell(row=i, column=2, value=v); c.font = BLUE
    c.number_format = '0.0%' if '%' in k or 'take' in k or 'rate' in k else '$0.00' if '$' in k else '0.0'
    ws.cell(row=i, column=3, value=s).font = IT
ws.column_dimensions['A'].width = 36; ws.column_dimensions['B'].width = 14; ws.column_dimensions['C'].width = 26; ws.column_dimensions['D'].width = 16; ws.column_dimensions['E'].width = 16; ws.column_dimensions['F'].width = 16
r0 = len(inputs) + 4
header_row = ['Channel (formula)', 'Author net @ A', 'Platform net @ A', 'Author net @ B', 'Platform net @ B', 'Notes']
for i, h in enumerate(header_row, 1): c = ws.cell(row=r0, column=i, value=h); c.font = H; c.fill = HF
calc = [
 ('KDP 70%', '=B9*({p}-B10*B11)', '={p}-B9*({p}-B10*B11)', 'Platform = Amazon gross margin before its costs'),
 ('Direct sale, card processor', '={p}-({p}*B4+B5)', '=0', 'Author is the merchant; handles tax'),
 ('Direct sale, merchant of record', '={p}-({p}*B6+B7)', '=0', 'MoR handles global tax'),
 ('SAGA store, card processor', '={p}*(1-B8)', '={p}*B8-({p}*B4+B5)', 'SAGA pays processing from its take'),
 ('SAGA store, merchant of record', '={p}*(1-B8)', '={p}*B8-({p}*B6+B7)', 'Thin or negative at low prices'),
]
for i, (ch, a, p_, note) in enumerate(calc, r0 + 1):
    ws.cell(row=i, column=1, value=ch).font = B
    for col, price in ((2, 'B2'), (4, 'B3')):
        ws.cell(row=i, column=col, value=a.format(p=price)).number_format = '$0.00'
        ws.cell(row=i, column=col + 1, value=p_.format(p=price)).number_format = '$0.00'
    ws.cell(row=i, column=6, value=note).font = IT
rs = r0 + len(calc) + 2
ws.cell(row=rs, column=1, value='Full channel table from the research script (values, with sources in research/unit_economics.json):').font = BB
for i, h in enumerate(['Channel', 'List price', 'Platform cut %', 'Delivery/processing fee', 'Author net', 'Platform net', 'Notes'], 1):
    c = ws.cell(row=rs + 1, column=i, value=h); c.font = H; c.fill = HF
for i, row in enumerate(econ['rows'], rs + 2):
    for j, k in enumerate(['channel', 'list_price', 'platform_cut_pct', 'delivery_or_processing_fee', 'author_net', 'platform_net', 'notes'], 1):
        c = ws.cell(row=i, column=j, value=row.get(k)); c.font = B
        if k in ('list_price', 'delivery_or_processing_fee', 'author_net', 'platform_net'): c.number_format = '$0.00'
for sh in wb.worksheets:
    for row in sh.iter_rows():
        for c in row:
            if c.font and c.font.name != F: c.font = Font(name=F, bold=c.font.bold, italic=c.font.italic, color=c.font.color, size=c.font.size)
wb.save('docs/SAGA-competitive-benchmark.xlsx')
print('saved')
