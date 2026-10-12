"""
Phase 02 — finish pass.

The full crawl already ingested 1439 products before a metrics crash (Bug A:
missing `json` import) + image skip (Bug B: relative URLs). The DB is intact, so
this pass:
  * re-downloads images for every product (Bug B fix: relative -> absolute)
  * regenerates SHAKI_Product_Master_Imported.xlsx + data/processed/products.json
  * prints the 8 required metrics

Discovery stats are taken from the verified full-site discovery run (deterministic
for shaki.com: id 10..1458 live, 20 gaps, listing 42 subset of 1440).
"""
from __future__ import annotations

import os
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from config import SETTINGS, PROCESSED_DIR
from pipeline import download_product_images, compute_metrics
from db import Db
from exporters.excel_export import export_product_master_imported
from exporters.json_export import export_products_json

DB_URL = os.getenv("PHASE2_DB",
                   f"sqlite:///{PROCESSED_DIR / 'phase2_shaki_product_intelligence.db'}")

DISCOVERY = {
    "discovered_raw": 1440, "deduped_away": 0, "discovered": 1440,
    "by_source": {"listing": 42, "id_sweep": 1440},
    "listing_max_id": 1458,
    "id_sweep": {"scanned": 1460, "live": 1440, "not_found": 20, "errors": 0},
}


def main():
    t0 = time.time()
    db = Db(DB_URL)
    try:
        # ---- re-download images for every product (Bug B fix) ----
        print("[images] re-downloading media for all products...")
        rows = db.conn.execute(
            "SELECT product_id, url, role, original_url FROM product_media").fetchall()
        by_prod: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            by_prod[r["product_id"]].append(
                {"url": r["url"], "role": r["role"], "original_url": r["original_url"]})
        done = 0
        for pid, media in by_prod.items():
            download_product_images(pid, media)
            db.set_media(pid, media)
            done += 1
            if done % 250 == 0:
                print(f"  downloaded for {done}/{len(by_prod)} products")
        fetched = db.conn.execute(
            "SELECT COUNT(*) FROM product_media WHERE fetched=1").fetchone()[0]
        print(f"[images] done. media fetched(ok) = {fetched}")

        # ---- metrics + exports ----
        metrics = compute_metrics(db, DISCOVERY)
        xlsx = export_product_master_imported(db, metrics=metrics, discovery=DISCOVERY)
        js = export_products_json(db)

        # job-level ingest stats (saved before the metrics crash)
        job = db.conn.execute(
            "SELECT products_created, products_updated, products_failed "
            "FROM product_import_jobs ORDER BY job_id DESC LIMIT 1").fetchone()
        err_count = db.conn.execute("SELECT COUNT(*) FROM product_import_errors").fetchone()[0]

        print(f"\n[export] {xlsx}")
        print(f"[export] {js}")
        print("\n========== PHASE 02 REPORT ==========")
        print(f"官网发现产品数量 (discovered)      : {metrics.get('discovered')}")
        print(f"成功解析数量 (created+updated)     : "
              f"{(job['products_created'] or 0) + (job['products_updated'] or 0)}")
        print(f"失败数量 (process errors)         : {job['products_failed'] or 0} "
              f"(errors table rows: {err_count})")
        print(f"去重数量 (deduped away)           : {metrics.get('deduped_away')}")
        print(f"数据完整度分布                     : {metrics.get('data_completeness_distribution')}")
        print(f"  └ <75% 数量                      : {metrics.get('below_75pct')}")
        print(f"五大品类数量                       : {metrics.get('five_category_counts')}")
        print(f"  └ 未归类 (Unmapped)              : {metrics.get('category_unmapped')}")
        print(f"AI推断字段数量 (total)             : {metrics.get('ai_inferred_fields_total')}")
        print(f"待人工审核SKU数量                  : {metrics.get('needs_human_review')}")
        print(f"图片下载成功数 (media fetched)     : {fetched} / {rows.__len__()}")
        print(f"\nElapsed: {time.time()-t0:.1f}s")
    finally:
        db.close()


if __name__ == "__main__":
    main()
