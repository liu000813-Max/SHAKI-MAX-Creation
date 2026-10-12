"""
POC — Step 1: analyze robots.txt + sitemap, list candidate product URLs.
Does NOT fetch product detail pages (that's Step 2, 1 product only).
"""
from __future__ import annotations
import os, sys, re, json
os.environ["SHAKI_WEBSITE_URL"] = "https://www.SHAKI.com"

import urllib.request, urllib.error, urllib.parse
from xml.etree import ElementTree as ET

BASE = "https://www.SHAKI.com"
UA = "SHAKIProductBot/1.0 (+https://shaki.com; product-intel-poc)"

def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace"), dict(r.getheaders())
    except urllib.error.HTTPError as e:
        return e.code, "", {}
    except Exception as e:
        return -1, str(e), {}

print("="*70)
print("ROBOTS.TXT")
print("="*70)
st, robots_txt, _ = get(BASE + "/robots.txt", timeout=20)
print(f"status={st}")
disallow, sitemaps = [], []
cur = "*"
for line in robots_txt.splitlines():
    line = line.strip()
    if not line or line.startswith("#") or ":" not in line:
        continue
    k, v = line.split(":", 1); k, v = k.strip().lower(), v.strip()
    if k == "user-agent": cur = v.lower()
    elif k == "disallow" and v: disallow.append(v)
    elif k == "sitemap": sitemaps.append(v)
print("disallow:", disallow[:20])
print("sitemaps (from robots):", sitemaps)

print("="*70)
print("SITEMAP")
print("="*70)
cands = list(sitemaps)
for f in ("/sitemap.xml", "/sitemap_index.xml"):
    cands.append(BASE + f)
seen = set(); all_urls = []
for sm in dict.fromkeys(cands):
    st, txt, _ = get(sm, timeout=25)
    print(f"\n-- {sm}  status={st}  bytes={len(txt)}")
    if st != 200 or not txt:
        continue
    # try XML parse
    urls = []
    try:
        root = ET.fromstring(txt.encode("utf-8"))
        for loc in root.iter():
            if loc.tag.endswith("loc") and loc.text:
                urls.append(loc.text.strip())
    except ET.ParseError:
        urls = re.findall(r"<loc>(.*?)</loc>", txt, re.S)
    print(f"   <loc> count={len(urls)}")
    for u in urls[:8]:
        print("    ", u)
    for u in urls:
        if u not in seen:
            seen.add(u); all_urls.append(u)

print("="*70)
print("PRODUCT URL CANDIDATES (looks_like_product)")
print("="*70)
def looks(u):
    p = u.lower()
    return bool(re.search(r"/(product|products|item|items|p|goods|detail)/", p) or
                re.search(r"[?&](product|pid|sku|id)=", p))
prod = [u for u in all_urls if looks(u)]
print(f"total <loc> urls: {len(all_urls)}")
print(f"product-like: {len(prod)}")
for u in prod[:30]:
    print("  ", u)

# save discovery result
out = {
    "base": BASE,
    "robots_status": st,
    "robots_disallow": disallow,
    "sitemaps": sitemaps,
    "total_urls": len(all_urls),
    "product_like_count": len(prod),
    "product_like_sample": prod[:50],
}
Path = __import__("pathlib").Path
Path("poc_output").mkdir(exist_ok=True)
Path("poc_output/discovery.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("\nsaved -> poc_output/discovery.json")
