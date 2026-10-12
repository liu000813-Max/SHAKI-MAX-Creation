"""
Product Ingestion Pipeline — orchestrates the full flow:

  DISCOVER -> FETCH -> RAW STORAGE -> PARSE -> NORMALIZE -> MAP
  -> AI ENRICH -> VALIDATION -> HUMAN REVIEW -> APPROVE -> AI RECOMMENDATION POOL

Per-SKU failures are isolated: one bad product is logged and skipped, never
aborting the whole job (spec section 26).
"""
from __future__ import annotations

import concurrent.futures
import json
import struct
import time
import urllib.parse
import urllib.request
from pathlib import Path

from config import SETTINGS, RAW_DIR
from crawler import discover_products, discover_full_site, fetch, canonicalize
from extractors import ExtractorStrategy
from storage import save_raw
from runtime import RawRecord
from mapping import build_normalized
from enrichment import enrich
from validation import merge_and_validate, ProductRecord
from db import Db

_extractor = ExtractorStrategy()

_IMG_DIR = RAW_DIR / "images"


def _image_dims(data: bytes) -> tuple[int, int]:
    """Parse image dimensions from common formats without external deps."""
    if len(data) < 24:
        return 0, 0
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data[:2] == b"BM":
        return struct.unpack("<II", data[18:26])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                return struct.unpack(">HH", data[i + 5:i + 9])
            seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seglen
        return 0, 0
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        fmt = data[12:16]
        if fmt == b"VP8X":
            w = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1
            h = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1
            return w, h
        if fmt == b"VP8 ":
            w = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            h = struct.unpack("<H", data[28:30])[0] & 0x3FFF
            return w, h
        if fmt == b"VP8L":
            b0, b1, b2, b3 = data[21], data[22], data[23], data[24]
            w = ((b1 & 0x3F) << 8 | b0) + 1
            h = ((b3 & 0x0F) << 10 | (b2 & 0xFC) << 4 | (b1 & 0xC0) >> 6) + 1
            return w, h
    return 0, 0


_EXT_BY_MIME = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
    "image/webp": ".webp", "image/bmp": ".bmp", "image/svg+xml": ".svg",
}


def download_product_images(product_id: str, media: list[dict],
                            max_images: int = 8, workers: int = 6) -> list[dict]:
    """Download product images to data/raw/images/<pid>/ and attach metadata.

    Enriches each media dict in place with local_path / mime_type / file_size /
    width / height / fetched (1|0). Failures are non-fatal — the URL is kept and
    fetched=0 so the product still ingests (spec Test 07).

    SHAKI serves product images as RELATIVE urls (/storage/images/...), so they
    are resolved against SETTINGS.shaki_website_url before downloading.
    """
    out_dir = _IMG_DIR / product_id
    out_dir.mkdir(parents=True, exist_ok=True)
    base = (SETTINGS.shaki_website_url or "").rstrip("/")

    def _abs(u: str) -> str:
        if u.startswith(("http://", "https://")):
            return u
        if base and u.startswith("/"):
            return base + u
        return ""

    targets = []
    for m in media:
        au = _abs(m.get("url") or "")
        if au.startswith(("http://", "https://")):
            targets.append((m, au))
    targets = targets[:max_images]
    if not targets:
        return media

    def _fetch_one(item: tuple, idx: int):
        m, url = item
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": SETTINGS.user_agent,
                "Referer": (base + "/") if base else url,
            })
            with urllib.request.urlopen(req, timeout=SETTINGS.request_timeout) as r:
                data = r.read()
                ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if not data:
                m["fetched"] = 0
                return
            ext = _EXT_BY_MIME.get(ctype) or Path(url.split("?")[0]).suffix.lower() or ".bin"
            local = out_dir / f"{idx:02d}{ext}"
            local.write_bytes(data)
            w, h = _image_dims(data)
            m["local_path"] = str(local)
            m["mime_type"] = ctype
            m["file_size"] = len(data)
            m["width"], m["height"] = w, h
            m["fetched"] = 1
        except Exception:
            m["fetched"] = 0  # unverified, URL retained

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_fetch_one, item, i): item for i, item in enumerate(targets)}
        for _ in concurrent.futures.as_completed(futs):
            pass
    return media


def process_html(db: Db, url: str, html: str, job_id: int, download_images: bool = False) -> dict:
    """Process already-fetched HTML (shared by live fetch and offline fixtures)."""
    try:
        if not html:
            db.log_error(job_id, url, "EMPTY_HTML", "no html", 0)
            return {"url": url, "status": "failed", "reason": "empty html"}

        # RAW STORAGE
        raw = RawRecord(source_url=url, raw_html=html, raw_text=html[:4000],
                        raw_json_ld=[], raw_images=[])
        save_raw(raw)

        # PARSE
        extracted = _extractor.extract(html, url)

        # NORMALIZE + MAP
        normalized = build_normalized(extracted)

        # AI ENRICH (only AI-role fields; never fabricates commercial data)
        ai_fields = enrich(normalized, extracted)

        # VALIDATE + SCORE
        rec = merge_and_validate(normalized, ai_fields, extracted)

        # PERSIST (with version retention on content change)
        canon = canonicalize(url)
        chash = __import__("hashlib").sha256(html.encode()).hexdigest()
        version, changed = db.upsert_product(rec, canon, chash)

        media = normalized.get("media", [])
        if download_images:
            media = download_product_images(rec.product_id, media)
        db.set_media(rec.product_id, media)
        db.set_tags(rec.product_id, rec.fields, rec.provenance)
        db.set_scores(rec.product_id, rec.fields, rec.provenance)
        db.add_source(rec.product_id, url, html)

        action = "updated" if (version > 1 and changed) else ("unchanged" if not changed else "created")
        return {"url": url, "status": "ok", "product_id": rec.product_id,
                "action": action, "completeness": rec.data_completeness,
                "eligible": rec.recommendation_eligible, "version": version}
    except Exception as e:  # isolation: one failure doesn't stop the job
        db.log_error(job_id, url, "PROCESS_ERROR", str(e)[:500], 0)
        return {"url": url, "status": "failed", "reason": str(e)[:200]}


def process_url(db: Db, url: str, job_id: int, download_images: bool = False) -> dict:
    """Fetch a live URL then process it."""
    try:
        status, html, _ = fetch(url)
    except Exception as e:
        db.log_error(job_id, url, "FETCH_FAILED", str(e)[:200], 0)
        return {"url": url, "status": "failed", "reason": f"fetch error: {str(e)[:120]}"}
    if status != 200 or not html:
        db.log_error(job_id, url, "FETCH_FAILED", f"status={status}", 0)
        return {"url": url, "status": "failed", "reason": f"fetch status {status}"}
    return process_html(db, url, html, job_id, download_images=download_images)


def ingest_fixtures(fixture_dir: str, db: Db | None = None, limit: int | None = None,
                    download_images: bool = False) -> dict:
    """Offline ingestion: read local HTML fixtures (no network)."""
    from pathlib import Path
    own = db is None
    db = db or Db()
    try:
        job_id = db.start_job("fixtures:" + fixture_dir)
        files = sorted(Path(fixture_dir).glob("*.html"))[:limit] if limit \
            else sorted(Path(fixture_dir).glob("*.html"))
        stats = {"discovered": len(files), "created": 0, "updated": 0,
                 "skipped": 0, "failed": 0}
        errors = []
        for f in files:
            url = "fixture://" + f.name
            html = f.read_text(encoding="utf-8", errors="replace")
            res = process_html(db, url, html, job_id, download_images=download_images)
            if res["status"] == "ok":
                if res.get("action") == "updated":
                    stats["updated"] += 1
                elif res.get("action") == "unchanged":
                    stats["skipped"] += 1
                else:
                    stats["created"] += 1
            else:
                stats["failed"] += 1
                errors.append({"url": url, "reason": res.get("reason")})
        db.end_job(job_id, stats, errors)
        return {"job_id": job_id, "stats": stats, "errors": errors}
    finally:
        if own:
            db.close()


def ingest(urls: list[str], db: Db | None = None, limit: int | None = None,
           download_images: bool = False) -> dict:
    own = db is None
    db = db or Db()
    try:
        job_id = db.start_job(SETTINGS.shaki_website_url or "fixture-batch")
        targets = urls[:limit] if limit else urls
        stats = {"discovered": len(targets), "created": 0, "updated": 0,
                 "skipped": 0, "failed": 0}
        errors = []
        for u in targets:
            res = process_url(db, u, job_id, download_images=download_images)
            if res["status"] == "ok":
                if res.get("action") == "updated":
                    stats["updated"] += 1
                elif res.get("action") == "unchanged":
                    stats["skipped"] += 1
                else:
                    stats["created"] += 1
            elif res["status"] == "skipped":
                stats["skipped"] += 1
            else:
                stats["failed"] += 1
                errors.append({"url": u, "reason": res.get("reason")})
        db.end_job(job_id, stats, errors)
        return {"job_id": job_id, "stats": stats, "errors": errors}
    finally:
        if own:
            db.close()


def discover_and_ingest(limit: int | None = None, download_images: bool = False) -> dict:
    urls = [d.url for d in discover_products()]
    return ingest(urls, limit=limit, download_images=download_images)


def discover_and_ingest_full(db: Db | None = None, *,
                              use_id_sweep: bool = True,
                              download_images: bool = True,
                              limit: int | None = None,
                              prefetch: bool = True,
                              prefetch_workers: int = 12) -> dict:
    """Phase 02 full-site run: discover ALL public products, then ingest.

    Parallel-prefetches detail HTML into the HTTP cache first (fast), then
    ingests serially (DB writes need a single writer). Returns a consolidated
    report including discovery stats + the 8 required metrics (via compute_metrics).
    """
    own = db is None
    db = db or Db()
    try:
        urls, disc_stats = discover_full_site(use_id_sweep=use_id_sweep)
        targets = [d.url for d in urls][:limit] if limit else [d.url for d in urls]

        if prefetch:
            print(f"  [prefetch] {len(targets)} detail pages (workers={prefetch_workers})...")
            def _pf(u):
                try:
                    fetch(u, use_cache=True)
                except Exception:
                    pass
            with concurrent.futures.ThreadPoolExecutor(max_workers=prefetch_workers) as ex:
                list(ex.map(_pf, targets))

        res = ingest(targets, db=db, download_images=download_images)
        res["discovery"] = disc_stats
        res["metrics"] = compute_metrics(db, disc_stats)
        return res
    finally:
        if own:
            db.close()


# --------------------------------------------------------------------------
# Phase 02 metrics (the 8 required output figures)
# --------------------------------------------------------------------------
_WB_SUBCATS = {"Lubricants", "Feminine Care", "Intimate Cleansing",
               "Applicator Products", "Massage Products", "Functional Liquids"}
_BDSM_SUBCATS = {"Blindfolds", "Restraints", "Collars", "Roleplay",
                 "Sensory Play", "Control Products", "BDSM Sets"}
_FEMALE_SUBCATS = {"Massagers", "Suction", "Vibrators", "Wearables", "Insertable",
                   "External", "Multifunctional", "Smart Devices", "Accessories"}
_MALE_SUBCATS = {"Male Massagers", "Masturbators", "Rings", "Performance",
                 "Prostate", "Multifunctional", "Smart Devices", "Accessories"}
_COUples_SUBCATS = {"Couple Play", "Couples Wearables", "Remote Play",
                    "Couples Massagers", "Couple Toys", "Couple Games", "Gift Sets"}


def _infer_primary_category(secondary: str | None, gender: str | None) -> str:
    """Report-only heuristic mapping to one of the 5 locked primary categories.

    NOT written to the PM-locked `primary_category` column — it is an inference
    derived from AI-filled secondary_category / target_gender for the 五大品类 count.
    """
    sec = (secondary or "").strip()
    g = (gender or "").strip()
    if sec in _WB_SUBCATS:
        return "Water-Based"
    if sec in _BDSM_SUBCATS:
        return "BDSM"
    if g == "Couples" or sec in _COUples_SUBCATS or sec.startswith("Couple"):
        return "Couples"
    if g == "Male" or sec in _MALE_SUBCATS:
        return "Male"
    if g == "Female" or sec in _FEMALE_SUBCATS:
        return "Female"
    return "Unmapped"


def compute_metrics(db: Db, disc_stats: dict | None = None) -> dict:
    """Compute the 8 required Phase 02 metrics from the DB + discovery stats."""
    rows = db.conn.execute(
        "SELECT product_id, secondary_category, target_gender, data_completeness, "
        "recommendation_eligible, needs_review, compliance_verified, provenance "
        "FROM products").fetchall()
    total = len(rows)
    comp_buckets = {"0-24": 0, "25-49": 0, "50-74": 0, "75-100": 0}
    below75 = 0
    cat_counts: dict[str, int] = {c: 0 for c in
                                  ["Female", "Male", "Couples", "BDSM", "Water-Based"]}
    unmapped = 0
    ai_field_count = 0
    needs_review = 0

    for r in rows:
        dc = int(r["data_completeness"] or 0)
        if dc < 25:
            comp_buckets["0-24"] += 1
        elif dc < 50:
            comp_buckets["25-49"] += 1
        elif dc < 75:
            comp_buckets["50-74"] += 1
        else:
            comp_buckets["75-100"] += 1
        if dc < 75:
            below75 += 1

        cat = _infer_primary_category(r["secondary_category"], r["target_gender"])
        if cat == "Unmapped":
            unmapped += 1
        else:
            cat_counts[cat] += 1

        prov = json.loads(r["provenance"]) if r["provenance"] else {}
        ai_field_count += sum(1 for v in prov.values()
                              if isinstance(v, dict) and v.get("source_type") == "ai_inference")

        if (r["needs_review"] or 0) == 1 or (r["recommendation_eligible"] or 0) == 0:
            needs_review += 1

    metrics = {
        "total_products_in_db": total,
        "data_completeness_distribution": comp_buckets,
        "below_75pct": below75,
        "five_category_counts": cat_counts,
        "category_unmapped": unmapped,
        "ai_inferred_fields_total": ai_field_count,
        "needs_human_review": needs_review,
    }
    if disc_stats:
        metrics["discovered"] = disc_stats.get("discovered")
        metrics["deduped_away"] = disc_stats.get("deduped_away")
        metrics["discovered_raw"] = disc_stats.get("discovered_raw")
    return metrics


def approve(db: Db, product_id: str) -> bool:
    """Human review approval: mark compliance verified + recompute eligibility."""
    row = db.get_product(product_id)
    if not row:
        return False
    eligible_status = row["product_status"] in {"Active", "New", "Best Seller", "Strategic", "Coming Soon"}
    comp = 1
    eligible = int(eligible_status and (row["data_completeness"] or 0) >= SETTINGS.data_completeness_min and comp)
    db.conn.execute(
        "UPDATE products SET compliance_verified=?, recommendation_eligible=?, needs_review=0 WHERE product_id=?",
        (comp, eligible, product_id))
    db.conn.commit()
    return True
