"""
Excel export — SHAKI_Product_Master_Export.xlsx.

Column order matches SHAKI_Product_Master.xlsx exactly (product_master.FIELD_ORDER,
which is the Product_Master sheet header order). AI-inferred cells are exported as-is;
provenance lives in the DB, not the spreadsheet (human review uses the DB).
"""
from __future__ import annotations

import json

from product_master import FIELD_ORDER
from config import PRODUCTS_DIR
from db import Db


def export_product_master(db: Db, out_path: str | None = None) -> str:
    import openpyxl
    out_path = out_path or str(PRODUCTS_DIR / "SHAKI_Product_Master_Export.xlsx")
    # FIELD_ORDER are the 228 Product Master fields; the meta/status columns below
    # are DB-managed and live on the Ingestion_Status sheet (not in the Master sheet).
    status_cols = ["product_version", "data_completeness", "recommendation_eligible",
                   "needs_review", "compliance_verified"]
    rows = db.conn.execute(
        f"SELECT product_id, {', '.join(f'\"{c}\"' for c in FIELD_ORDER)}, "
        f"{', '.join(f'\"{c}\"' for c in status_cols)} "
        f"FROM products ORDER BY product_id").fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Product_Master"
    # header = field IDs (matches source xlsx R1)
    ws.append(FIELD_ORDER)
    for r in rows:
        d = dict(r)
        ws.append([d.get(c) for c in FIELD_ORDER])

    # second sheet: provenance + status summary
    ws2 = wb.create_sheet("Ingestion_Status")
    ws2.append(["product_id", "data_completeness", "recommendation_eligible",
                "needs_review", "compliance_verified", "product_version"])
    for r in rows:
        d2 = dict(r)
        ws2.append([d2["product_id"], d2.get("data_completeness"), d2.get("recommendation_eligible"),
                    d2.get("needs_review"), d2.get("compliance_verified"), d2.get("product_version")])

    wb.save(out_path)
    return out_path


def export_product_master_imported(db: Db, out_path: str | None = None,
                                   metrics: dict | None = None,
                                   discovery: dict | None = None) -> str:
    """Phase 02 export: SHAKI_Product_Master_Imported.xlsx.

    Sheets:
      1. Product_Master   — the 228 Product Master fields (field-ID headers)
      2. Ingestion_Status — completeness / eligibility / review flags
      3. Discovery        — how many found / deduped / by source (if provided)
      4. Metrics          — the 8 required figures (if provided)
    """
    import openpyxl
    out_path = out_path or str(PRODUCTS_DIR / "SHAKI_Product_Master_Imported.xlsx")
    status_cols = ["product_version", "data_completeness", "recommendation_eligible",
                   "needs_review", "compliance_verified"]
    rows = db.conn.execute(
        f"SELECT product_id, {', '.join(f'\"{c}\"' for c in FIELD_ORDER)}, "
        f"{', '.join(f'\"{c}\"' for c in status_cols)} "
        f"FROM products ORDER BY product_id").fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Product_Master"
    ws.append(FIELD_ORDER)
    for r in rows:
        d = dict(r)
        ws.append([d.get(c) for c in FIELD_ORDER])

    ws2 = wb.create_sheet("Ingestion_Status")
    ws2.append(["product_id", "data_completeness", "recommendation_eligible",
                "needs_review", "compliance_verified", "product_version"])
    for r in rows:
        d2 = dict(r)
        ws2.append([d2["product_id"], d2.get("data_completeness"), d2.get("recommendation_eligible"),
                    d2.get("needs_review"), d2.get("compliance_verified"), d2.get("product_version")])

    if discovery:
        ws3 = wb.create_sheet("Discovery")
        ws3.append(["metric", "value"])
        for k, v in discovery.items():
            ws3.append([k, json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v])

    if metrics:
        ws4 = wb.create_sheet("Metrics")
        ws4.append(["metric", "value"])
        flat = {
            "官网发现产品数量 (discovered)": metrics.get("discovered"),
            "发现原始URL数 (raw)": metrics.get("discovered_raw"),
            "去重剔除数 (deduped_away)": metrics.get("deduped_away"),
            "入库产品总数 (in_db)": metrics.get("total_products_in_db"),
            "数据完整度<75%数量": metrics.get("below_75pct"),
            "AI推断字段总数": metrics.get("ai_inferred_fields_total"),
            "待人工审核SKU数量": metrics.get("needs_human_review"),
        }
        for k, v in flat.items():
            ws4.append([k, v])
        ws4.append(["", ""])
        ws4.append(["数据完整度分布", ""])
        for k, v in (metrics.get("data_completeness_distribution") or {}).items():
            ws4.append([f"  {k}%", v])
        ws4.append(["五大品类数量", ""])
        for k, v in (metrics.get("five_category_counts") or {}).items():
            ws4.append([f"  {k}", v])
        ws4.append(["  Unmapped", metrics.get("category_unmapped", 0)])

    wb.save(out_path)
    return out_path
