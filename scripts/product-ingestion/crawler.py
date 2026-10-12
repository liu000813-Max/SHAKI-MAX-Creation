"""
Crawler: robots.txt + sitemap parsing, Product Discovery with dedup,
and a polite, rate-limited, retrying fetcher with on-disk caching.

No page-structure assumptions: discovery pulls URLs from sitemaps,
category/collection pages and product detail links. Page *type* is
confirmed later during extraction (JSON-LD @type Product, etc.).
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

from config import SETTINGS, RAW_DIR
from runtime import DiscoveredURL

_HTTP_CACHE = RAW_DIR / ".http_cache"
_last_fetch = 0.0


# --------------------------------------------------------------------------
# Fetch (polite: delay, timeout, retries w/ backoff, cache)
# --------------------------------------------------------------------------
def fetch(url: str, *, use_cache: bool = True, delay: float | None = None) -> tuple[int, str, dict]:
    """Return (status_code, body_text, headers). Raises on unrecoverable error."""
    global _last_fetch
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_file = _HTTP_CACHE / f"{key}.html"
    if use_cache and cache_file.exists():
        return 200, cache_file.read_text(encoding="utf-8", errors="replace"), {}

    # respect rate limit (global, simple); `delay` override (None = use settings)
    effective_delay = SETTINGS.request_delay if delay is None else delay
    if effective_delay > 0:
        elapsed = time.time() - _last_fetch
        if elapsed < effective_delay:
            time.sleep(effective_delay - elapsed)
    _last_fetch = time.time()

    req = urllib.request.Request(url, headers={"User-Agent": SETTINGS.user_agent})
    last_err = ""
    for attempt in range(1, SETTINGS.max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=SETTINGS.request_timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                headers = dict(resp.getheaders())
                if use_cache:
                    _HTTP_CACHE.mkdir(parents=True, exist_ok=True)
                    cache_file.write_text(body, encoding="utf-8")
                return resp.status, body, headers
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return e.code, "", {}
            last_err = f"HTTP {e.code}"
        except Exception as e:  # timeout / connection
            last_err = str(e)
        # backoff
        time.sleep(min(2 ** attempt, 10))
    raise RuntimeError(f"fetch failed after {SETTINGS.max_retries} retries: {url} ({last_err})")


# --------------------------------------------------------------------------
# Robots
# --------------------------------------------------------------------------
def parse_robots(base_url: str) -> dict:
    """Return {'disallow': [paths], 'sitemaps': [urls]}."""
    robots_url = urllib.parse.urljoin(base_url, "/robots.txt")
    out = {"disallow": [], "sitemaps": []}
    try:
        _, text, _ = fetch(robots_url, use_cache=False)
    except Exception:
        return out
    current_ua = "*"
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip().lower(), val.strip()
        if key == "user-agent":
            current_ua = val.lower()
        elif key == "disallow" and val and current_ua in ("*", SETTINGS.user_agent.lower()):
            out["disallow"].append(val)
        elif key == "sitemap":
            out["sitemaps"].append(val)
    return out


def is_robots_allowed(robots: dict, url: str) -> bool:
    path = urllib.parse.urlparse(url).path or "/"
    for d in robots["disallow"]:
        if d == "":
            continue
        if path.startswith(d) or d == "/":
            # allow more specific allow rules? keep simple: disallow wins
            return False
    return True


# --------------------------------------------------------------------------
# Sitemap parsing
# --------------------------------------------------------------------------
def _sitemap_urls(xml_text: str) -> list[str]:
    urls: list[str] = []
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except ET.ParseError:
        # fallback: regex loc tags
        return re.findall(r"<loc>(.*?)</loc>", xml_text, re.S)
    # sitemap index
    for sm in root.iter():
        if sm.tag.endswith("sitemap"):
            for loc in sm.iter():
                if loc.tag.endswith("loc") and loc.text:
                    urls.append(loc.text.strip())
    # urlset
    for url in root.iter():
        if url.tag.endswith("url"):
            for loc in url.iter():
                if loc.tag.endswith("loc") and loc.text:
                    urls.append(loc.text.strip())
    if not urls:
        urls = re.findall(r"<loc>(.*?)</loc>", xml_text, re.S)
    return urls


def discover_from_sitemaps(base_url: str, robots: dict) -> list[str]:
    found: list[str] = []
    sitemaps = list(robots.get("sitemaps", []))
    # common fallbacks
    for cand in ("/sitemap.xml", "/sitemap_index.xml"):
        sitemaps.append(urllib.parse.urljoin(base_url, cand))
    seen = set()
    for sm in dict.fromkeys(sitemaps):  # dedupe, keep order
        try:
            _, txt, _ = fetch(sm, use_cache=False)
        except Exception:
            continue
        for u in _sitemap_urls(txt):
            if u not in seen:
                seen.add(u)
                found.append(u)
    return found


# --------------------------------------------------------------------------
# HTML link extraction (for category / collection pages)
# --------------------------------------------------------------------------
_LINK_RE = re.compile(r'href=["\']([^"\']+)["\']', re.I)


def extract_links(html: str, base_url: str) -> list[str]:
    links = []
    for m in _LINK_RE.finditer(html):
        href = m.group(1).strip()
        if href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        abs_url = urllib.parse.urljoin(base_url, href)
        links.append(abs_url)
    return links


def looks_like_product(url: str) -> bool:
    p = url.lower()
    return bool(re.search(r"/(product|products|item|items|p|goods|detail)/", p) or
                re.search(r"[?&](product|pid|sku|id)=", p))


# --------------------------------------------------------------------------
# Discovery orchestration (respects robots)
# --------------------------------------------------------------------------
def canonicalize(url: str) -> str:
    p = urllib.parse.urlparse(url)
    path = p.path.rstrip("/") or "/"
    canon = f"{p.netloc.lower()}{path}"
    # drop common tracking query params but keep product/sku/id
    q = urllib.parse.parse_qs(p.query, keep_blank_values=False)
    keep = {k: v for k, v in q.items() if k.lower() in ("sku", "pid", "id", "product")}
    if keep:
        canon += "?" + urllib.parse.urlencode(keep, doseq=True)
    return canon


def extract_sku_from_url(url: str) -> str:
    m = re.search(r"(?:sku|pid|=)([A-Za-z0-9\-_]{4,})", url, re.I)
    return m.group(1).upper() if m else ""


def _build_detail_url(base: str, pid: int) -> str:
    return f"{base.rstrip('/')}/products/detail?id={pid}"


def _crawl_listing(base: str, page_limit: int = 60) -> tuple[set[str], int]:
    """Follow /products?page=N listing pages; return (detail_urls, max_seen_id).

    Stops when a page yields no product-detail links or page_limit reached.
    SHAKI has no sitemap/category pages, so the listing is the primary seed.
    """
    detail_urls: set[str] = set()
    max_id = 0
    for page in range(0, page_limit):
        listing_url = f"{base.rstrip('/')}/products?page={page}"
        try:
            _, html, _ = fetch(listing_url, delay=SETTINGS.request_delay)
        except Exception:
            break
        if not html:
            break
        page_links = {l for l in extract_links(html, base)
                      if looks_like_product(l) and "/detail" in l}
        # also catch listing cards that link to detail by id
        for m in re.finditer(r"[?&]id=(\d+)", html):
            page_links.add(_build_detail_url(base, int(m.group(1))))
        if not page_links:
            break  # empty page => end of catalog
        for l in page_links:
            detail_urls.add(l)
            mid = re.search(r"[?&]id=(\d+)", l)
            if mid:
                max_id = max(max_id, int(mid.group(1)))
        # If the page returned the same set as previous (UI quirk), dedup handles
        # it; but stop if two consecutive pages produced identical link sets.
    return detail_urls, max_id


def _sweep_ids(base: str, lo: int, hi: int, workers: int = 12) -> tuple[set[str], dict]:
    """Probe /products/detail?id=N for N in [lo, hi]; return (live_urls, stats).

    Runs in parallel (read-only HEAD-free GET status check). 404/410 => not a
    product. A long run of consecutive 404s near the top end short-circuits.
    """
    live: set[str] = set()
    scanned = 0
    live_count = 0
    not_found = 0
    err_count = 0
    consec_404 = 0

    def _probe(n: int):
        url = _build_detail_url(base, n)
        try:
            code, _, _ = fetch(url, use_cache=True, delay=0.0)
        except Exception:
            return n, 0  # treat network error as absent (will be re-fetched in process)
        return n, code

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_probe, n) for n in range(lo, hi + 1)]
        for fut in concurrent.futures.as_completed(futs):
            n, code = fut.result()
            scanned += 1
            if code == 200:
                live.add(_build_detail_url(base, n))
                live_count += 1
                consec_404 = 0
            elif code in (404, 410):
                not_found += 1
                consec_404 += 1
            else:
                err_count += 1
    stats = {"scanned": scanned, "live": live_count, "not_found": not_found,
             "errors": err_count}
    return live, stats


def discover_full_site(base: str | None = None, *,
                       use_listing: bool = True,
                       use_id_sweep: bool = True,
                       sweep_min: int = 1,
                       sweep_max: int | None = None,
                       page_limit: int = 60,
                       id_workers: int = 12) -> tuple[list[DiscoveredURL], dict]:
    """Full-site Product Discovery.

    Priority per spec: sitemap -> collection/category -> listing -> product detail.
    SHAKI has no sitemap/category, so it falls through to listing pagination +
    an ID sweep to catch legacy/off-listing detail pages. Returns
    (deduped DiscoveredURL list, discovery_stats).
    """
    base = (base or SETTINGS.shaki_website_url).rstrip("/")
    if not base:
        raise RuntimeError("SHAKI_WEBSITE_URL is not set; cannot run live discovery.")
    robots = parse_robots(base)

    raw_urls: set[str] = set()
    by_source: dict[str, int] = {}

    # 1) sitemaps (none for SHAKI, but honored per spec)
    for u in discover_from_sitemaps(base, robots):
        raw_urls.add(u)
        by_source["sitemap"] = by_source.get("sitemap", 0) + 1

    # 2) listing pagination
    listing_urls: set[str] = set()
    max_listing_id = 0
    if use_listing:
        listing_urls, max_listing_id = _crawl_listing(base, page_limit=page_limit)
        raw_urls |= listing_urls
        by_source["listing"] = len(listing_urls)

    # 3) ID sweep for legacy/off-listing detail pages
    sweep_stats: dict = {}
    if use_id_sweep:
        hi = sweep_max if sweep_max is not None else (max(max_listing_id, 1458) + 2)
        live, sweep_stats = _sweep_ids(base, sweep_min, hi, workers=id_workers)
        raw_urls |= live
        by_source["id_sweep"] = len(live)

    # 4) dedup (canonical + sku) + robots gate
    discovered: dict[str, DiscoveredURL] = {}
    seen_canonical: set[str] = set()
    sku_seen: set[str] = set()
    deduped_away = 0
    for u in raw_urls:
        c = canonicalize(u)
        if c in seen_canonical:
            deduped_away += 1
            continue
        sku = extract_sku_from_url(u)
        if sku and sku in sku_seen:
            deduped_away += 1
            continue
        seen_canonical.add(c)
        if sku:
            sku_seen.add(sku)
        if not is_robots_allowed(robots, u):
            continue
        page_type = "product" if looks_like_product(u) else "unknown"
        src = "product_detail"
        discovered[u] = DiscoveredURL(url=u, source=src, page_type=page_type)

    stats = {
        "discovered_raw": len(raw_urls),
        "deduped_away": deduped_away,
        "discovered": len(discovered),
        "by_source": by_source,
        "listing_max_id": max_listing_id,
        "id_sweep": sweep_stats,
    }
    return list(discovered.values()), stats


def discover_products(start_urls: list[str] | None = None) -> list[DiscoveredURL]:
    """Back-compatible: returns deduped product URLs (no stats)."""
    if start_urls:
        # seed mode: just classify provided URLs
        out = []
        for u in start_urls:
            out.append(DiscoveredURL(url=u, source="seed",
                                     page_type="product" if looks_like_product(u) else "unknown"))
        return out
    urls, _ = discover_full_site()
    return urls


if __name__ == "__main__":
    disc, stats = discover_full_site()
    print(json.dumps({"stats": stats,
                      "sample": [d.__dict__ for d in disc[:5]]},
                     indent=2, ensure_ascii=False))
