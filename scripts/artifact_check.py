#!/usr/bin/env python3
"""Verify the static export in apps/web/out is actually complete and ships the expected strings.

`next build` printing "Generating static pages (28/28)" is not evidence that 28
usable pages exist: a failed export leaves the previous round's `out/` in place, so
a stale directory looks like a fresh success. This asserts three things instead.

1. Every `/_next/...` asset referenced by every HTML file exists on disk.
   `unquote` is mandatory: `[id]` directories are percent-encoded in the markup and
   comparing raw would fail every dynamic route.
2. No HTML file is suspiciously small (a truncated export writes stubs).
3. The strings a client-rendered page needs are present in the shipped JS chunks.
   These pages carry no body text in HTML — the copy lives in the chunks — so
   grepping the HTML for new labels reports a false failure.

Usage:
    python scripts/artifact_check.py [--out apps/web/out] [--needle STR]...

Each `--needle` must appear in at least one chunk under `_next/static/chunks`.
Exits 1 on any failed assertion.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
import urllib.parse

ASSET = re.compile(r'(?:src|href)="(/_next/[^"]+)"')
MIN_HTML_BYTES = 400  # below this the page did not really render


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="apps/web/out")
    ap.add_argument("--needle", action="append", default=[])
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    if not out.is_dir():
        print(f"FAIL: no export at {out}")
        return 1

    failures: list[str] = []

    # 1. every referenced asset exists
    htmls = sorted(out.rglob("*.html"))
    missing: list[tuple[str, str]] = []
    total = 0
    for html in htmls:
        txt = html.read_text(encoding="utf-8", errors="ignore")
        for m in ASSET.finditer(txt):
            url = urllib.parse.unquote(m.group(1))
            total += 1
            if not (out / url.lstrip("/")).exists():
                missing.append((str(html.relative_to(out)), url))
    print(f"html files: {len(htmls)} | referenced assets: {total} | missing: {len(missing)}")
    if missing:
        failures.append(f"{len(missing)} referenced assets are missing")
        for page, url in missing[:10]:
            print(f"  MISSING {url}  <- {page}")

    # 2. no stub pages
    stubs = [
        (str(h.relative_to(out)), h.stat().st_size)
        for h in htmls
        if h.stat().st_size < MIN_HTML_BYTES
    ]
    print(f"stub pages (<{MIN_HTML_BYTES}B): {len(stubs)}")
    if stubs:
        failures.append(f"{len(stubs)} pages are stubs")
        for page, size in stubs[:10]:
            print(f"  STUB {size}B  {page}")

    # 3. expected strings present in the client chunks
    chunks = sorted((out / "_next" / "static" / "chunks").rglob("*.js"))
    blob = "\n".join(c.read_text(encoding="utf-8", errors="ignore") for c in chunks)
    print(f"chunks scanned: {len(chunks)}")
    for needle in args.needle:
        hit = needle in blob
        print(f"  needle {'OK  ' if hit else 'MISS'} {needle!r}")
        if not hit:
            failures.append(f"needle not shipped: {needle!r}")

    if failures:
        print("\nFAILED")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — export complete and ships every expected string")
    return 0


if __name__ == "__main__":
    sys.exit(main())
