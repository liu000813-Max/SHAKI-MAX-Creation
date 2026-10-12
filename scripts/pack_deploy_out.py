#!/usr/bin/env python3
"""Pack the slim deploy bundle from apps/web/out, and report exactly what was left out.

`apps/web/out` is 1.3 GB, almost all of it the Heydildi media library (57 mp4 = 839 MB,
646 jpg + 94 png = 392 MB). The app itself — HTML, JS, CSS — is about 2 MB. The publish bundle limit
is well under 1.3 GB, so the videos are dropped: they are the single largest block, the live site has
never served them, and the images are NOT droppable (the catalogue renders real files out of the
747 on-disk `/products/...` paths, so removing them breaks it visually).

Dropping files silently is how a live page ends up with mystery holes. Every excluded asset that the
built output still references is printed, so the gap is known rather than discovered later. That
count is taken from the probe's scanner rather than a second regex here — the local copy this file
used to carry excluded whitespace from its character class, which truncated every path containing a
space and under-reported the mp4 holes it existed to report (46 instead of the real 57).

The previous bundle is renamed into `_build_trash/` instead of deleted: bulk deletes are blocked by
the sandbox guard, renames are not.

Usage:
    python scripts/pack_deploy_out.py [--out apps/web/out] [--dest deploy_out]
"""

from __future__ import annotations

import argparse
import pathlib
import shutil
import sys
import time
import urllib.parse

# Run from anywhere: the scanner lives beside this file.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import probe_server  # noqa: E402

# Extension -> why it is excluded. Keep this a policy list, not a junk filter.
EXCLUDE = {
    ".mp4": "video: largest block, never served by the live site",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="apps/web/out")
    ap.add_argument("--dest", default="deploy_out")
    ap.add_argument("--trash", default="_build_trash")
    args = ap.parse_args()

    src = pathlib.Path(args.out)
    dest = pathlib.Path(args.dest)
    if not src.is_dir():
        print(f"FAIL  no export at {src} — run `next build` then `node apps/web/assemble-out.mjs`")
        return 1

    # Move the previous bundle aside (never bulk-delete).
    if dest.exists():
        trash = pathlib.Path(args.trash)
        trash.mkdir(parents=True, exist_ok=True)
        moved = trash / f"{dest.name}_{time.strftime('%Y%m%d-%H%M%S')}"
        dest.rename(moved)
        print(f"previous bundle moved to {moved}")

    kept = excluded = 0
    kept_bytes = excluded_bytes = 0
    excluded_names: list[str] = []

    for path in src.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(src)
        suffix = path.suffix.lower()
        size = path.stat().st_size
        if suffix in EXCLUDE:
            excluded += 1
            excluded_bytes += size
            excluded_names.append(rel.as_posix())
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        kept += 1
        kept_bytes += size

    print(f"kept     : {kept} files, {kept_bytes / 1048576:.1f} MB")
    print(f"excluded : {excluded} files, {excluded_bytes / 1048576:.1f} MB")
    for suffix, why in EXCLUDE.items():
        n = sum(1 for x in excluded_names if x.lower().endswith(suffix))
        if n:
            print(f"    {suffix} x{n} — {why}")

    # Which excluded assets does the built output still ask for? Those are the holes in the live page.
    # Scanner is imported, not re-implemented: a second regex for the same job is a second chance to
    # be silently wrong, which is exactly what happened here.
    routes, assets, referenced_raw, on_disk = probe_server.walk(dest)
    referenced = {urllib.parse.unquote(r).lstrip("/") for r in referenced_raw}

    holes = sorted(r for r in referenced if r.lower().endswith(tuple(EXCLUDE)))
    print(f"\nreferenced /products/ assets in the bundle: {len(referenced)} "
          f"({len(on_disk)} present, {len(referenced) - len(on_disk)} absent)")
    print(f"of those, excluded by policy (will 404 live): {len(holes)}")
    for h in holes[:10]:
        print(f"    404 {h}")
    if len(holes) > 10:
        print(f"    ... and {len(holes) - 10} more")

    # Sanity: the bundle must be a real site.
    html_count = len(list(dest.rglob("*.html")))
    has_index = (dest / "index.html").exists()
    print(f"\nhtml pages: {html_count} | index.html: {has_index}")
    if not html_count or not has_index:
        print("FAIL  bundle is not a servable site")
        return 1

    print(f"\nOK — bundle at {dest.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
