"""Rebuild vendored city suggestions from GeoNames cities500 and Unicode CLDR JSON.
Usage: python3 scripts/build_world_places.py <cities500.zip> <countries-ru.json> <countries-en.json>
"""
from __future__ import annotations
from collections import Counter
import gzip, hashlib, json, sys, unicodedata, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def key(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value.casefold().replace('ё', 'е')) if not unicodedata.combining(c))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value).split())

archive, ru_path, en_path = map(Path, sys.argv[1:4])
ru = json.loads(ru_path.read_text())['main']['ru']['localeDisplayNames']['territories']
en = json.loads(en_path.read_text())['main']['en']['localeDisplayNames']['territories']
# Preserve existing country identifiers used by profile visibility and feed filters.
ru.update({'US': 'США', 'GB': 'Великобритания', 'AE': 'ОАЭ', 'CZ': 'Чехия', 'KR': 'Южная Корея', 'KG': 'Кыргызстан'})
countries = {code: name for code, name in ru.items() if len(code) == 2 and code.isupper() and code not in {'EU','EZ','QO','UN','XA','XB','ZZ'}}
admin_path = archive.parent/"admin1CodesASCII.txt"
admins = {}
if admin_path.exists():
    admins = {parts[0]: parts[1] for line in admin_path.read_text().splitlines() if len(parts := line.split("\t")) >= 2}
rows = []
with zipfile.ZipFile(archive) as zipped:
    with zipped.open('cities500.txt') as source:
        for line in source:
            fields = line.decode('utf-8').rstrip('\n').split('\t')
            if len(fields) < 19 or fields[8] not in countries or fields[6] != 'P': continue
            name, country = fields[1], countries[fields[8]]
            aliases = sorted({key(x) for x in [name, fields[2], *fields[3].split(',')] if x})
            rows.append([name + ' · ' + country, name, country, '|'.join(aliases), int(fields[14] or 0), admins.get(fields[8]+'.'+fields[10], '')])
counts = Counter((row[1], row[2]) for row in rows)
for row in rows:
    if counts[(row[1], row[2])] > 1 and row[5] and key(row[5]) != key(row[1]):
        row[0] = row[1] + ' · ' + row[5] + ' · ' + row[2]
    row.pop()
rows.sort(key=lambda row: (-row[4], row[0]))
# Same-name settlements share the current string-based API; the largest is ranked first.
seen = set(); unique = []
for row in rows:
    if row[0] not in seen: seen.add(row[0]); unique.append(row)
out = ROOT/'resources/places'; out.mkdir(parents=True, exist_ok=True)
with (out/'world-cities.jsonl.gz').open('wb') as target:
    with gzip.GzipFile(fileobj=target, mode='wb', mtime=0) as stream:
        for row in unique:
            stream.write((json.dumps(row, ensure_ascii=False, separators=(',', ':'))+'\n').encode())
(out/'countries.json').write_text(json.dumps({code: {'name': name, 'en': en.get(code, name)} for code,name in sorted(countries.items())}, ensure_ascii=False, indent=2)+'\n')
(out/'manifest.json').write_text(json.dumps({'source': 'https://download.geonames.org/export/dump/cities500.zip', 'source_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'countries_source': 'https://github.com/unicode-org/cldr-json', 'input_sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [archive, ru_path, en_path, admin_path] if path.exists()}, 'records': len(unique), 'city_license': 'CC BY 4.0', 'country_license': 'Unicode-3.0'}, indent=2)+'\n')
print('World city suggestions:', len(unique))
