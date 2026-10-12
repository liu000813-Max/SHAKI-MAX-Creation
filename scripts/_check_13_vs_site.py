"""Cross-check the 13 curated SKUs against what actually exists on shaki.com.

The complaint was that the catalogue shows products which are not real. This measures it instead of
arguing about it: every curated row is matched against the names the site itself publishes.
"""
import io, json, re

catalog = json.load(io.open('scripts/.catalog.json', encoding='utf-8'))['products']
site_names = [p['name_cn'] for p in catalog]

src = io.open('apps/web/lib/data/products.ts', encoding='utf-8').read()
rows = []
for block in src.split("product_id: '")[1:]:
    pid = block.split("'")[0]
    m = re.search(r"product_name_cn: '([^']+)'", block)
    series = re.search(r"series_name: '([^']+)'", block)
    rows.append({'id': pid, 'name': m.group(1) if m else '?', 'series': series.group(1) if series else ''})

def norm(s):
    return re.sub(r'[\s·．\.\-—_、,，]+', '', (s or '')).lower()

print(f'site products: {len(site_names)}\ncurated rows: {len(rows)}\n')

hit, miss = [], []
for r in rows:
    n = norm(r['name'])
    # a curated row matches if its own name, or its name minus the series prefix, appears on the site
    variants = [n, norm(re.sub(r'^杜宾\s*·\s*|^拾光\s*·\s*', '', r['name']))]
    found = next((s for s in site_names if any(v and v in norm(s) for v in variants)), None)
    (hit if found else miss).append((r, found))

print(f'== 站上找得到的 ({len(hit)}) ==')
for r, s in hit:
    print(f"  OK   {r['id']}  {r['name']:<22} ≈ {s}")
print(f'\n== 站上找不到的 ({len(miss)}) ==')
for r, _ in miss:
    print(f"  MISS {r['id']}  {r['name']:<22} 系列={r['series']}")

print(f'\n结论：{len(miss)}/{len(rows)} 款在 shaki.com 上不存在。')

# And the other direction: what the site actually sells that we could recommend.
curated_norm = [norm(r['name']) for r in rows]
uncovered = [s for s in site_names if not any(c and c in norm(s) for c in curated_norm)]
print(f'\n站上有、货盘里没有的：{len(uncovered)} 款（例：{", ".join(uncovered[:6])}）')