#!/usr/bin/env python
"""Probe a served static export and separate real serving failures from dangling data.

Three things get reported as three different things, because they are not the same thing:

  1. ROUTES      every html page the export produced, fetched over HTTP  -> must be 200
  2. HARD        every `/_next/...` asset some html page asks for        -> must be 200
  3. MEDIA       `/products/...` paths found in bundled data             -> sampled, must be 200

(3) earns its own bucket because a path can sit in bundled data with no component reading it.
The manifest is bundled as plain string literals, so scanning for `src=`/`href=` attributes finds
nothing and prints a clean run while having checked zero images. Scanning the literals instead
finds plenty -- including `hero_image` values that point at files that were never shipped. Those
are dangling *data* (`grep` finds no component rendering `hero_image`), so failing the deploy over
them would be wrong. They are listed as a data finding and excluded from the pass/fail decision.

Media paths also must match through spaces: real filenames contain them
(`PAS-AN-0707 (1).jpg`, `English product page`). A character class that stops at whitespace
truncates those into false 404s -- and, worse, can sample zero images while reporting success.

Usage:
    python scripts/probe_server.py                       # probes http://127.0.0.1:4173
    python scripts/probe_server.py --base URL --root DIR
"""
from __future__ import annotations

import argparse
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# `src=`/`href=` attributes: correct for build assets, which really are referenced that way.
ASSET = re.compile(r'(?:src|href)="(/_next/[^"]+)"')
# Media paths are NOT attributes in the chunks: the manifest is bundled as plain string literals
# (`"/products/heydildi/…/video.mp4"`), so match a quoted string rather than src=/href=.
# The character class MUST allow spaces -- see the module docstring.
MEDIA = re.compile(r"""["'`](/products/[^"'`]+)""")
CHUNK = re.compile(r"""["'`](/_next/static/chunks/[^"'`]+\.js)["'`]""")


def fetch(base: str, path: str, timeout: float = 20.0) -> int:
    """Return the HTTP status for `path`, or 0 if the request itself blew up."""
    url = base.rstrip("/") + urllib.parse.quote(path, safe="/~@:+,=&?%#")
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "shaki-probe"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:  # noqa: BLE001 -- a refused/reset connection is a status of 0 to us
        return 0


def clean_media(raw: list[str]) -> set[str]:
    """Normalise media paths pulled out of a bundle.

    Paths coming from JSON-embedded-in-JS arrive as `/products/x.jpg\\` -- the backslash is the
    escape for the surrounding quote, not part of the name. Left in, every path is counted twice
    (once clean, once with the escape) and the totals roughly double.
    """
    out: set[str] = set()
    for item in raw:
        path = item.rstrip("\\").rstrip()
        if path and not path.endswith("/") and not path.endswith("\\"):
            out.add(path)
    return out


def walk(root: Path) -> tuple[list[str], list[str], list[str], set[str]]:
    """Scan the export. Returns (routes, asset_refs, media_refs, media_on_disk)."""
    routes: list[str] = []
    assets: set[str] = set()
    media_refs: set[str] = set()
    media_on_disk: set[str] = set()

    for html in sorted(root.rglob("*.html")):
        rel = html.relative_to(root).as_posix()
        # `foo/index.html` is served at `/foo/`; a root-level `404.html` is not a route we crawl.
        route = "/" if rel == "index.html" else "/" + rel[: -len("index.html")]
        routes.append(route)
        text = html.read_text(encoding="utf-8", errors="replace")
        assets.update(ASSET.findall(text))
        assets.update(CHUNK.findall(text))
        media_refs.update(clean_media(MEDIA.findall(text)))

    # The manifest travels inside the JS chunks, so the media refs only exist there.
    for js in sorted((root / "_next").rglob("*.js")):
        text = js.read_text(encoding="utf-8", errors="replace")
        assets.update(CHUNK.findall(text))
        media_refs.update(clean_media(MEDIA.findall(text)))

    for path in media_refs:
        on_disk = root / urllib.parse.unquote(path).lstrip("/")
        if on_disk.is_file():
            media_on_disk.add(path)

    return routes, sorted(assets), sorted(media_refs), media_on_disk


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:4173")
    ap.add_argument("--root", default="deploy_out")
    ap.add_argument("--samples", type=int, default=40, help="media paths to fetch (0 = all)")
    ap.add_argument("--seed", type=int, default=7, help="sampling is seeded so runs are comparable")
    args = ap.parse_args()

    root = Path(args.root)
    if not (root / "index.html").is_file():
        print(f"FAIL  no index.html under {root} -- nothing was exported")
        return 1

    routes, assets, media_refs, media_on_disk = walk(root)
    print(f"export: {root}")
    print(f"routes {len(routes)} | build assets {len(assets)} | media referenced {len(media_refs)} "
          f"(on disk {len(media_on_disk)})")
    print()

    failures: list[str] = []

    print(f"-- routes ({len(routes)})")
    bad_routes = [(r, fetch(args.base, r)) for r in routes]
    for route, status in bad_routes:
        if status != 200:
            print(f"  {status or 'ERR':>4}  {route}")
            failures.append(f"route {route} -> {status}")
    print(f"   all {len(routes)} routes answered" if not failures else
          f"   {len(failures)} route(s) failed")
    print()

    print(f"-- build assets ({len(assets)})")
    missing: list[tuple[str, int]] = []
    for asset in assets:
        status = fetch(args.base, asset)
        if status != 200:
            missing.append((asset, status))
    for asset, status in missing:
        print(f"  {status or 'ERR':>4}  {asset}")
    failures.extend(f"asset {a} -> {s}" for a, s in missing)
    print(f"   all {len(assets)} build assets answered" if not missing else
          f"   {len(missing)} build asset(s) failed")
    print()

    pool = sorted(media_on_disk)
    if args.samples and 0 < args.samples < len(pool):
        rng = random.Random(args.seed)
        pool = sorted(rng.sample(pool, args.samples))
    print(f"-- media on disk, sampled ({len(pool)} of {len(media_on_disk)})")
    media_missing: list[tuple[str, int]] = []
    for path in pool:
        status = fetch(args.base, path)
        if status != 200:
            media_missing.append((path, status))
    for path, status in media_missing:
        print(f"  {status or 'ERR':>4}  {path}")
    failures.extend(f"media {p} -> {s}" for p, s in media_missing)
    print(f"   all {len(pool)} sampled media answered" if not media_missing else
          f"   {len(media_missing)} sampled media failed")
    print()

    absent = [p for p in media_refs if p not in media_on_disk]
    print(f"-- media referenced in bundled data but NOT in the bundle ({len(absent)})")
    if absent:
        print("   data finding, not a serving defect: no component reads these paths")
        print("   (`hero_image` on the brand SKUs points here; grep finds no renderer)")
        for path in absent[:12]:
            print(f"      {path}")
        if len(absent) > 12:
            print(f"      ... and {len(absent) - 12} more")
    else:
        print("   none")
    print()

    if failures:
        print(f"FAIL -- the served site is missing {len(failures)} asset(s) it asks for")
        for item in failures[:20]:
            print(f"   {item}")
        return 1
    print(f"PASS -- {len(routes)} routes and {len(assets)} build assets served; "
          f"{len(pool)} media sampled OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
