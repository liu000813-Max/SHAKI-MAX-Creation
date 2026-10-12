"""
CLI for the SHAKI product ingestion pipeline.

Examples
--------
  # Offline smoke test (no website needed) — uses bundled fixtures
  python cli.py import-fixtures

  # Live crawl + ingest (set SHAKI_WEBSITE_URL in .env first)
  python cli.py discover
  python cli.py import --limit 50

  # Export the Product Master spreadsheet
  python cli.py export

  # Status / recommendation pool
  python cli.py status
  python cli.py recommend

  # Human review approval (moves a SKU into the AI recommendation pool)
  python cli.py approve PRD-XXXX
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from config import SETTINGS
from db import Db
from pipeline import (discover_and_ingest, ingest, ingest_fixtures, approve)
from exporters.excel_export import export_product_master

HERE = Path(__file__).resolve().parent


def _db() -> Db:
    return Db()


def cmd_discover(_):
    from crawler import discover_products
    disc = discover_products()
    print(json.dumps([d.__dict__ for d in disc], indent=2, ensure_ascii=False))


def cmd_import(args):
    db = _db()
    try:
        if args.fixtures:
            res = ingest_fixtures(str(HERE / "fixtures"), limit=args.limit,
                                  download_images=args.download_images)
        elif args.urls:
            res = ingest(args.urls, db=db, limit=args.limit, download_images=args.download_images)
        else:
            res = discover_and_ingest(limit=args.limit, download_images=args.download_images)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    finally:
        db.close()


def cmd_export(_):
    db = _db()
    try:
        out = export_product_master(db)
        print("exported ->", out)
    finally:
        db.close()


def cmd_status(_):
    db = _db()
    try:
        rows = db.list_products()
        print(f"{len(rows)} products")
        for r in rows:
            print(f"  {r['product_id']:18} status={r['product_status']:10} "
                  f"completeness={r['data_completeness']:3}% "
                  f"eligible={bool(r['recommendation_eligible'])} "
                  f"review={bool(r['needs_review'])}")
    finally:
        db.close()


def cmd_recommend(_):
    db = _db()
    try:
        rows = db.recommend_eligible()
        print(f"{len(rows)} products in AI Recommendation Pool (compliance_verified + completeness>=75)")
        for r in rows:
            print(f"  {r['product_id']:18} pi={r['product_intelligence_score']} "
                  f"completeness={r['data_completeness']}")
    finally:
        db.close()


def cmd_approve(args):
    db = _db()
    try:
        ok = approve(db, args.product_id)
        print("approved" if ok else "not found", args.product_id)
    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description="SHAKI Product Ingestion Pipeline")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("discover", help="discover product URLs (needs SHAKI_WEBSITE_URL)")

    imp = sub.add_parser("import", help="ingest products")
    imp.add_argument("--urls", nargs="*", help="explicit product URLs")
    imp.add_argument("--fixtures", action="store_true", help="use bundled offline fixtures")
    imp.add_argument("--limit", type=int, default=None)
    imp.add_argument("--download-images", action="store_true")

    sub.add_parser("export", help="export SHAKI_Product_Master_Export.xlsx")
    sub.add_parser("status", help="list products + completeness")
    sub.add_parser("recommend", help="list AI recommendation pool")
    ap = sub.add_parser("approve", help="approve a SKU (human review)")
    ap.add_argument("product_id")

    args = p.parse_args()
    if not args.cmd:
        p.print_help()
        sys.exit(1)
    {
        "discover": cmd_discover,
        "import": cmd_import,
        "export": cmd_export,
        "status": cmd_status,
        "recommend": cmd_recommend,
        "approve": cmd_approve,
    }[args.cmd](args)


if __name__ == "__main__":
    main()
