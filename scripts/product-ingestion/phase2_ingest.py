"""
Phase 02 — full-site SHAKI product collection.

Runs the complete pipeline end-to-end against the live SHAKI website:

  DISCOVER (sitemap->listing pagination + ID sweep, dedup)
  -> PREFETCH (parallel detail HTML into cache)
  -> INGEST (parse -> normalize -> AI enrich -> validate -> DB, per-SKU isolated)
  -> DOWNLOAD images + media metadata
  -> EXPORT SHAKI_Product_Master_Imported.xlsx + data/processed/products.json
  -> PRINT the 8 required metrics

Env (all optional, with sane defaults):
  SHAKI_WEBSITE_URL        target site (default https://shaki.com)
  PHASE2_DB                sqlite path (default data/processed/phase2_shaki_product_intelligence.db)
  PHASE2_DOWNLOAD_IMAGES   true|false (default true)
  PHASE2_ID_SWEEP          true|false (default true)
  PHASE2_LIMIT             max products to ingest (default: all)
  PHASE2_PREFETCH_WORKERS  parallel prefetch threads (default 12)
  REQUEST_DELAY            per-request delay seconds (default 1.0)
  AI_PROVIDER              heuristic|doubao|openai (default heuristic)

Run:  python phase2_ingest.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from config import SETTINGS, PROCESSED_DIR
from pipeline import discover_and_ingest_full
from db import Db
from exporters.excel_export import export_product_master_imported
from exporters.json_export import export_products_json


def _yn(v: str, default: bool) -> bool:
    return {"true": True, "1": True, "yes": True,
            "false": False, "0": False, "no": False}.get((v or "").lower(), default)


def main():
    if not SETTINGS.shaki_website_url:
        print("ERROR: SHAKI_WEBSITE_URL is not set. Export it or pass via .env.")
        raise SystemExit(2)

    db_url = os.getenv("PHASE2_DB",
                       f"sqlite:///{PROCESSED_DIR / 'phase2_shaki_product_intelligence.db'}")
    download_images = _yn(os.getenv("PHASE2_DOWNLOAD_IMAGES", "true"), True)
    use_id_sweep = _yn(os.getenv("PHASE2_ID_SWEEP", "true"), True)
    limit = int(os.getenv("PHASE2_LIMIT", "0")) or None
    prefetch_workers = int(os.getenv("PHASE2_PREFETCH_WORKERS", "12"))

    print(f"=== SHAKI Phase 02 full-site collection ===")
    print(f"  site           : {SETTINGS.shaki_website_url}")
    print(f"  db             : {db_url}")
    print(f"  id_sweep       : {use_id_sweep}")
    print(f"  download_images: {download_images}")
    print(f"  limit          : {limit or 'ALL'}")
    print(f"  request_delay  : {SETTINGS.request_delay}s")
    t0 = time.time()

    db = Db(db_url)
    try:
        res = discover_and_ingest_full(
            db, use_id_sweep=use_id_sweep, download_images=download_images,
            limit=limit, prefetch_workers=prefetch_workers)
        discovery = res.get("discovery", {})
        metrics = res.get("metrics", {})

        print("\n--- Discovery stats ---")
        print(json.dumps(discovery, indent=2, ensure_ascii=False))

        print("\n--- Ingest stats ---")
        print(json.dumps(res.get("stats", {}), indent=2, ensure_ascii=False))

        # Exports
        xlsx = export_product_master_imported(db, metrics=metrics, discovery=discovery)
        js = export_products_json(db)
        print(f"\n[export] {xlsx}")
        print(f"[export] {js}")

        # 8 required metrics
        print("\n========== PHASE 02 REPORT ==========")
        print(f"官网发现产品数量 (discovered)      : {metrics.get('discovered')}")
        print(f"成功解析数量 (created+updated)     : "
              f"{res['stats'].get('created',0) + res['stats'].get('updated',0)}")
        print(f"失败数量 (failed)                 : {res['stats'].get('failed',0)}")
        print(f"去重数量 (deduped away)           : {metrics.get('deduped_away')}")
        print(f"数据完整度分布                     : {metrics.get('data_completeness_distribution')}")
        print(f"  └ <75% 数量                      : {metrics.get('below_75pct')}")
        print(f"五大品类数量                       : {metrics.get('five_category_counts')}")
        print(f"  └ 未归类 (Unmapped)              : {metrics.get('category_unmapped')}")
        print(f"AI推断字段数量 (total)             : {metrics.get('ai_inferred_fields_total')}")
        print(f"待人工审核SKU数量                  : {metrics.get('needs_human_review')}")
        print(f"\nElapsed: {time.time()-t0:.1f}s")
    finally:
        db.close()


if __name__ == "__main__":
    main()
