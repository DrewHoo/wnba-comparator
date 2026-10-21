# Harvests a position for each player on the residual worklist from the English Wikipedia:
# the article the API search returns for the name (and its variants), kept only when it
# has a basketball or college-coach infobox with a position line, mentions the WNBA and
# names her. Saves the wikitext (action=raw) under pages/<sha1(url)>.txt and writes rows
# with receipts to wikipedia.json; a player with no article keeps an `unverified` entry.
#   python3 -I data/research/positions/harvest-wikipedia.py
import json, urllib.parse, subprocess, re, time, hashlib, unicodedata, os
D = os.path.dirname(os.path.abspath(__file__))
wiki = json.load(open(f'{D}/wikipedia.json'))
done = {r['id'] for r in wiki['rows']}
left = [p for p in json.load(open(f'{D}/residual.json'))['players'] if p['id'] not in done]
UA = 'wnba-comparator-research/0.1 (drewhoover.com; positions for 1997-2002 WNBA players)'
def get(url, tries=3):
    for i in range(tries):
        out = subprocess.run(['curl', '-s', '-m', '25', '-A', UA, url], capture_output=True, text=True).stdout
        if out: return out
        time.sleep(2 * (i + 1))
    return ''
def api(params):
    out = get('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params))
    try: return json.loads(out)
    except Exception: return {}
def fold(s): return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
def group(v):
    t = v.lower()
    first = min([(t.find(k), g) for k, g in (('guard', 'G'), ('forward', 'F'), ('center', 'C'), ('centre', 'C')) if k in t] or [(-1, None)])
    return first[1]
def variants(name):
    base = re.sub(r'\(.*?\)', '', name).strip()
    w = base.replace('-', ' ').split()
    out = [base, base.replace('-', ' ')]
    if len(w) >= 3: out += [f'{w[0]} {w[-1]}', f'{w[0]} {w[1]}', f'{w[0]} {w[1]}-{w[2]}']
    seen = []; [seen.append(v) for v in out if v not in seen]
    return seen
rows = []
for p in left:
    found, cands = None, []
    for v in variants(p['name']):
        for q in (f'{v} WNBA', f'{v} basketball'):
            s = api({'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 4, 'format': 'json'})
            for x in s.get('query', {}).get('search', []):
                if x['title'] not in cands: cands.append(x['title'])
            time.sleep(0.3)
        if len(cands) >= 6: break
    words = fold(re.sub(r'\(.*?\)', '', p['name'])).replace('-', ' ').split()
    last, first = words[-1], words[0]
    for title in cands[:6]:
        tf = fold(title)
        if last not in tf and first not in tf: continue
        raw_url = 'https://en.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'raw'})
        text = get(raw_url)
        if 'WNBA' not in text or not re.search(r'\{\{Infobox (basketball biography|college coach|basketball player)', text, re.I): continue
        m = re.search(r'^\|\s*(?:player_)?positions?\s*=\s*([^\n]+)', text, re.M)
        if not m: continue
        g = group(m.group(1))
        if not g: continue
        head = fold(title + ' ' + text[:1200])
        if not (last in head and (first in head or first[:3] in head)): continue
        sha = hashlib.sha1(raw_url.encode()).hexdigest()
        open(f'{D}/pages/{sha}.txt', 'w').write(text)
        found = {'id': p['id'], 'name': p['name'], 'pos': g, 'label': m.group(1).strip(), 'grade': 'label', 'receipts': [{'url': raw_url, 'quote': m.group(0).strip(), 'note': f'the infobox position line of the article "{title}" (wikitext); matched to the player by name and a WNBA mention', 'retrieved': time.strftime('%Y-%m-%d')}]}
        break
    if found: rows.append(found)
    else: wiki['unverified'] = [u for u in wiki['unverified'] if u['id'] != p['id']] + [{'id': p['id'], 'name': p['name'], 'games': p['games'], 'seasons': f'{p["first"]}-{p["last"]}', 'teams': p['teams'], 'what_i_tried': f'Wikipedia API search for {variants(p["name"])[:3]} with WNBA / basketball: candidates {cands[:4]}; none had a basketball or coach infobox with a position, a WNBA mention and her name'}]
    print(f'{p["name"]:28} {p["games"]:3}g -> {found["label"] if found else "-"}')
wiki['rows'] += rows
wiki['unverified'] = [u for u in wiki['unverified'] if u['id'] not in {r['id'] for r in wiki['rows']}]
wiki['tried'] = [{'source': 'en.wikipedia.org API search (name variants, with WNBA / basketball) + action=raw; basketball-biography and college-coach infoboxes', 'outcome': f'{len(wiki["rows"])} of 92 players have an article with an infobox position; {len(wiki["unverified"])} do not'}]
json.dump(wiki, open(f'{D}/wikipedia.json', 'w'), indent=1)
idx = json.load(open(f'{D}/pages/index.json'))
for r in rows: idx[hashlib.sha1(r['receipts'][0]['url'].encode()).hexdigest()] = r['receipts'][0]['url']
json.dump(idx, open(f'{D}/pages/index.json', 'w'), indent=1)
print(f'+{len(rows)} rows this run; wikipedia.json now {len(wiki["rows"])} rows, {len(wiki["unverified"])} unverified')
