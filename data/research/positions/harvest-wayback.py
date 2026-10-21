# Harvests a position for each player still on the residual worklist from Wayback
# captures of wnba.com/playerfile pages (the index is wayback-cdx-playerfile.json).
# Saves every quoted page under pages/<sha1(url)>.html and appends rows with receipts
# to wayback.json; a player with no page keeps her entry in `unverified`.
#   python3 -I data/research/positions/harvest-wayback.py
import json, subprocess, re, time, hashlib, unicodedata, html, os, sys
D = os.path.dirname(os.path.abspath(__file__))
wiki = json.load(open(f'{D}/wikipedia.json'))
wb = json.load(open(f'{D}/wayback.json')) if os.path.exists(f'{D}/wayback.json') else {'note': '', 'rows': [], 'rejections': [], 'tried': [], 'leads': [], 'unverified': []}
done = {r['id'] for r in wiki['rows']} | {r['id'] for r in wb['rows']}
left = [p for p in json.load(open(f'{D}/residual.json'))['players'] if p['id'] not in done]
cdx = json.load(open(f'{D}/wayback-cdx-playerfile.json'))[1:]
def fold(s): return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
# the name wnba.com filed a player under when it isn't hers as the log spells it
ALIASES = {'Zuzana Klimesova': 'Zuzi Klimesova', 'Catrina Frierson': 'Trina Frierson', 'Merlelynn Lang-Harris': 'Merlelynn Lange-Harris'}
def slugs(name):
    name = ALIASES.get(name, name)
    base = fold(re.sub(r'\(.*?\)', '', name)).strip()
    w = base.replace('-', ' ').replace("'", '').split()
    out = ['_'.join(w), base.replace(' ', '_').replace("'", '')]
    if len(w) >= 3: out += [f'{w[0]}_{w[-1]}', f'{w[0]}_{w[1]}', f'{w[0]}_{w[1]}-{w[2]}', f'{w[0]}_{w[1]}{w[2]}', f'{w[0]}_{w[1]}_{w[2]}']
    seen = []; [seen.append(s) for s in out if s not in seen]
    return seen
RANK = ['/head/', '/bio.html', '/career/', '/index.html', '.html']
def rank(u):
    for i, k in enumerate(RANK):
        if k in u: return i
    return 9
def text_of(raw):
    t = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', raw, flags=re.S | re.I)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t)
def group(label):
    t = label.strip().lower()
    if t[:1] in ('g', 'f', 'c') and (len(t) <= 3 or t.startswith(('guard', 'forward', 'center'))): return {'g': 'G', 'f': 'F', 'c': 'C'}[t[0]]
    first = min([(t.find(k), g) for k, g in (('guard', 'G'), ('forward', 'F'), ('center', 'C')) if k in t] or [(-1, None)])
    return first[1]
def fetch(url):
    for i in range(4):
        r = subprocess.run(['curl', '-s', '-m', '60', '-L', '-w', '\n%{http_code}', url], capture_output=True, text=True, errors='replace').stdout
        body, _, code = r.rpartition('\n')
        if code == '200' and body: return body
        if code in ('404', '403'): return ''
        time.sleep(5 * (i + 1))
    print('   gave up on', url, code, file=sys.stderr)
    return ''
rows, fetched = [], 0
for p in left:
    cands = []
    for s in slugs(p['name']):
        for u, ts, _ in cdx:
            path = re.sub(r'^.*?/playerfile/', '', u).lower()
            if path.startswith(s + '/') or path.startswith(s + '.') or path.endswith('/' + s + '.html') or path == s:
                if not any(k in u for k in ('.jpg', '.gif', 'game_by_game', 'stats', 'splits', 'rank.html', 'printable')): cands.append((rank(u), ts, u))
    cands = sorted(set(cands))
    found, tried = None, []
    for rk, ts, u in cands[:6]:
        url = f'http://web.archive.org/web/{ts}id_/{u}'
        tried.append(url); fetched += 1
        raw = fetch(url)
        time.sleep(1.5)
        t = text_of(raw)
        # the 1998-2007 shape: "Position: Guard"; the 2008-2015 shape: "<name> # Guard - Atlanta Dream"
        m = re.search(r'Position:\s*([A-Za-z]+(?:\s*[/-]\s*[A-Za-z]+)?)', t)
        shape2 = None
        if not m:
            shape2 = re.search(r'([A-Z][A-Za-z\'.-]+(?: [A-Z][A-Za-z\'.-]+){1,3}) #\s*\d*\s*((?:Guard|Forward|Center)(?:\s*[/-]\s*(?:Guard|Forward|Center))?)\s*-\s*([A-Z][A-Za-z ]+?)(?= E-mail| \||$)', t)
            if not shape2:
                last0 = fold(ALIASES.get(p['name'], p['name'])).replace('-', ' ').split()[-1]
                i = fold(t).find(last0)
                if i >= 0: print('   no shape:', t[max(0, i - 40):i + 120], file=sys.stderr)
                continue
        label = (m.group(1) if m else shape2.group(2)).strip()
        g = group(label)
        if not g: continue
        last = fold(ALIASES.get(p['name'], p['name'])).replace('-', ' ').split()[-1]
        if last not in fold(t[:3000]): continue
        if shape2:
            if last not in fold(shape2.group(1)): continue
            quote = shape2.group(0)
        else:
            q = re.search(r'Position:\s*' + re.escape(label) + r'(?:\s+Born:\s*[0-9/]+)?', t)
            quote = q.group(0) if q else f'Position: {label}'
        sha = hashlib.sha1(url.encode()).hexdigest()
        open(f'{D}/pages/{sha}.html', 'w').write(raw)
        found = {'id': p['id'], 'name': p['name'], 'pos': g, 'label': label, 'grade': 'label', 'receipts': [{'url': url, 'quote': quote, 'note': f'wnba.com player file for {p["name"]} (Wayback capture {ts[:8]}), the Position field; the page names her', 'retrieved': time.strftime('%Y-%m-%d')}]}
        break
    if found: rows.append(found)
    else: wb['unverified'] = [u for u in wb['unverified'] if u['id'] != p['id']] + [{'id': p['id'], 'name': p['name'], 'games': p['games'], 'seasons': f'{p["first"]}-{p["last"]}', 'teams': p['teams'], 'what_i_tried': f'wnba.com/playerfile captures for slugs {slugs(p["name"])[:3]}: {len(cands)} candidates, fetched {tried[:4]}; no Position line with her name'}]
    print(f'{p["name"]:28} {p["games"]:3}g -> {found["label"] if found else "-"}  ({len(cands)} cands)')
wb['rows'] += rows
wb['unverified'] = [u for u in wb['unverified'] if u['id'] not in {r['id'] for r in wb['rows']}]
wb['tried'] = [{'source': 'web.archive.org, wnba.com/playerfile/* (12,066 captured URLs, 1998-2015)', 'outcome': f'{len(wb["rows"])} players have a captured player file with a Position line; {len(wb["unverified"])} do not'}]
json.dump(wb, open(f'{D}/wayback.json', 'w'), indent=1)
idx = json.load(open(f'{D}/pages/index.json'))
for r in rows: idx[hashlib.sha1(r['receipts'][0]['url'].encode()).hexdigest()] = r['receipts'][0]['url']
json.dump(idx, open(f'{D}/pages/index.json', 'w'), indent=1)
print(f'+{len(rows)} rows this run ({fetched} pages fetched); wayback.json now {len(wb["rows"])} rows, {len(wb["unverified"])} unverified')
