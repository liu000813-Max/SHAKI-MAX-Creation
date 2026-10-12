"""
Test suite for the SHAKI product ingestion pipeline (spec section 28: Test 01-10).

Runs fully OFFLINE — no SHAKI_WEBSITE_URL required. Uses bundled fixtures plus
generated batches. Run:  python tests/test_pipeline.py
"""
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path

# make the package root importable when run as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import Db
from pipeline import ingest_fixtures, process_html
from config import SETTINGS

HERE = Path(__file__).resolve().parent.parent
FIX = HERE / "fixtures"

PASS = 0
FAIL = 0


def _check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {detail}")


def _tmp_db():
    fd, path = tempfile.mkstemp(suffix=".db", prefix="shaki_test_")
    os.close(fd)
    os.remove(path)
    return f"sqlite:///{path}"


def _gen_html(sku, name, cat, desc, with_jsonld=True):
    if with_jsonld:
        ld = f'''<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Product","name":"{name}","sku":"{sku}","description":"{desc}","category":"{cat}","image":["https://x/{sku}/hero.webp"]}}</script>'''
    else:
        ld = ""
    return f"<html><head><title>{name}</title>{ld}</head><body><h1>{name}</h1><img src='https://x/{sku}/hero.webp' alt='hero'><p>{desc}</p></body></html>"


# ---------------------------------------------------------------------------
# Test 01 — 1 product
# ---------------------------------------------------------------------------
def test_01():
    print("Test 01: ingest 1 product")
    db = Db(_tmp_db())
    try:
        job = db.start_job("t01")
        html = (FIX / "sample_product_female_massager.html").read_text()
        res = process_html(db, "fixture://fm1", html, job)
        _check("job ran", res["status"] == "ok", str(res))
        prod = db.get_product("PRD-SHAKI-FM-001")
        _check("product persisted", prod is not None)
        _check("name mapped", (prod or {}).get("product_name_en") == "Velvet Pulse Massager")
        _check("sku mapped", (prod or {}).get("sku") == "SHAKI-FM-001")
        _check("jsonld flag", (prod or {}).get("recommendation_eligible") in (0, 1))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 02 — 10 products
# ---------------------------------------------------------------------------
def test_02():
    print("Test 02: ingest 10 products")
    d = tempfile.mkdtemp()
    try:
        for i in range(10):
            Path(d, f"p{i}.html").write_text(_gen_html(f"SKU10-{i:03d}", f"Prod {i}", "Female", f"desc {i}"))
        db = Db(_tmp_db())
        try:
            res = ingest_fixtures(d, db=db)
            _check("10 created", res["stats"]["created"] == 10, str(res["stats"]))
            _check("db lists 10", len(db.list_products()) == 10)
        finally:
            db.close()
    finally:
        shutil.rmtree(d)


# ---------------------------------------------------------------------------
# Test 03 — 100 products
# ---------------------------------------------------------------------------
def test_03():
    print("Test 03: ingest 100 products")
    d = tempfile.mkdtemp()
    try:
        for i in range(100):
            Path(d, f"p{i}.html").write_text(_gen_html(f"SKU100-{i:04d}", f"Prod {i}", "Male", f"desc {i} massager"))
        db = Db(_tmp_db())
        try:
            res = ingest_fixtures(d, db=db)
            _check("100 created", res["stats"]["created"] == 100, str(res["stats"]))
            _check("db lists 100", len(db.list_products()) == 100)
        finally:
            db.close()
    finally:
        shutil.rmtree(d)


# ---------------------------------------------------------------------------
# Test 04 — re-run dedup (identical content)
# ---------------------------------------------------------------------------
def test_04():
    print("Test 04: re-run is idempotent (skipped, no version bump)")
    d = tempfile.mkdtemp()
    try:
        for i in range(5):
            Path(d, f"p{i}.html").write_text(_gen_html(f"SKU4-{i:03d}", f"Prod {i}", "Female", f"desc {i}"))
        db = Db(_tmp_db())
        try:
            r1 = ingest_fixtures(d, db=db)
            v1 = db.get_product("PRD-SKU4-000")["product_version"]
            r2 = ingest_fixtures(d, db=db)
            v2 = db.get_product("PRD-SKU4-000")["product_version"]
            _check("first run created 5", r1["stats"]["created"] == 5, str(r1["stats"]))
            _check("second run skipped 5", r2["stats"]["skipped"] == 5, str(r2["stats"]))
            _check("version unchanged on re-run", v1 == v2 == 1, f"{v1}->{v2}")
        finally:
            db.close()
    finally:
        shutil.rmtree(d)


# ---------------------------------------------------------------------------
# Test 05 — page changed -> new version + history
# ---------------------------------------------------------------------------
def test_05():
    print("Test 05: changed page creates new version + history")
    db = Db(_tmp_db())
    try:
        job = db.start_job("t05")
        v1html = (FIX / "sample_product_female_massager.html").read_text()
        process_html(db, "fixture://fm1", v1html, job)            # SHAKI-FM-001 v1
        v1 = db.get_product("PRD-SHAKI-FM-001")["product_version"]
        v2html = (FIX / "sample_product_female_massager_v2.html").read_text()
        process_html(db, "fixture://fm1", v2html, job)            # same SKU, changed desc
        row = db.get_product("PRD-SHAKI-FM-001")
        hist = db.conn.execute("SELECT COUNT(*) c FROM products_history WHERE product_id='PRD-SHAKI-FM-001'").fetchone()["c"]
        _check("v1 = 1", v1 == 1, str(v1))
        _check("v2 = 2 after change", row["product_version"] == 2, str(row["product_version"]))
        _check("history retains old version", hist >= 1, str(hist))
        _check("description updated", "UPDATED" in (row.get("description_en") or ""), str(row.get("description_en")))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 06 — page missing / empty
# ---------------------------------------------------------------------------
def test_06():
    print("Test 06: missing/empty page fails gracefully")
    db = Db(_tmp_db())
    try:
        res = process_html(db, "fixture://missing", "", db.start_job("t"))
        _check("empty html -> failed", res["status"] == "failed", str(res))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 07 — image load fails (URL dead) but product survives
# ---------------------------------------------------------------------------
def test_07():
    print("Test 07: broken image URL does not block ingestion")
    db = Db(_tmp_db())
    try:
        job = db.start_job("t07")
        html = (FIX / "sample_product_broken_image.html").read_text()
        res = process_html(db, "fixture://bi", html, job, download_images=True)
        _check("product created despite broken image", res["status"] == "ok", str(res))
        media = db.conn.execute("SELECT * FROM product_media WHERE product_id='PRD-SHAKI-BI-006'").fetchall()
        _check("media row kept", len(media) >= 1, str(len(media)))
        _check("broken image not marked fetched", all(m["fetched"] == 0 for m in media), str(media))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 08 — no JSON-LD (fallback to meta/semantic)
# ---------------------------------------------------------------------------
def test_08():
    print("Test 08: no JSON-LD -> meta/semantic fallback")
    db = Db(_tmp_db())
    try:
        job = db.start_job("t08")
        html = (FIX / "sample_product_no_jsonld.html").read_text()
        res = process_html(db, "fixture://nj", html, job)
        _check("created", res["status"] == "ok", str(res))
        prod = db.get_product("PRD-SHAKI-NJ-005")
        _check("sku from meta", (prod or {}).get("sku") == "SHAKI-NJ-005")
        _check("name from semantic", (prod or {}).get("product_name_en") == "No-JSON-LD Bullet")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 09 — product missing SKU
# ---------------------------------------------------------------------------
def test_09():
    print("Test 09: missing SKU -> synthetic id + needs_review")
    db = Db(_tmp_db())
    try:
        job = db.start_job("t09")
        html = (FIX / "sample_product_no_sku.html").read_text()
        res = process_html(db, "fixture://nosku", html, job)
        _check("created", res["status"] == "ok", str(res))
        rows = db.list_products()
        _check("product id is AUTO-", rows[0]["product_id"].startswith("AUTO-"), rows[0]["product_id"])
        _check("needs_review flagged", bool(rows[0]["needs_review"]))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test 10 — AI cannot judge a field; never fabricates commercial data
# ---------------------------------------------------------------------------
def test_10():
    print("Test 10: unjudgeable field -> null; commercial never fabricated")
    d = tempfile.mkdtemp()
    try:
        # minimal page: no gender/price/material hints, no commercial data
        Path(d, "p.html").write_text(
            "<html><head><title>Abstract Gizmo</title></head><body><h1>Abstract Gizmo</h1>"
            "<img src='https://x/g/hero.webp' alt='hero'><p>A minimal device.</p></body></html>")
        db = Db(_tmp_db())
        try:
            res = ingest_fixtures(d, db=db)
            _check("created", res["stats"]["created"] == 1, str(res))
            prod = db.get_product(db.list_products()[0]["product_id"])
            _check("target_gender NOT fabricated", prod.get("target_gender") is None, str(prod.get("target_gender")))
            _check("moq NOT fabricated", prod.get("moq") is None, str(prod.get("moq")))
            _check("battery_capacity NOT fabricated", prod.get("battery_capacity") is None)
            _check("price NOT fabricated", prod.get("factory_price") is None)
            # provenance: any AI value must be tagged ai_inference
            prov = json.loads(prod["provenance"]) if prod.get("provenance") else {}
            ai_vals = [k for k, v in prov.items() if v.get("source_type") == "ai_inference"]
            _check("AI values tagged ai_inference", all(prov[k]["source_type"] == "ai_inference" for k in ai_vals))
        finally:
            db.close()
    finally:
        shutil.rmtree(d)


if __name__ == "__main__":
    print("=== SHAKI Product Ingestion — Test 01..10 ===")
    test_01(); test_02(); test_03(); test_04(); test_05()
    test_06(); test_07(); test_08(); test_09(); test_10()
    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    raise SystemExit(1 if FAIL else 0)
