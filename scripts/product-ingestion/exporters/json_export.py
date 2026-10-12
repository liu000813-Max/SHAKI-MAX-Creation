"""
JSON export — data/processed/products.json.

Emits one object per ingested product with the full 228-field Product Master
values plus media (with local paths + metadata), AI tags, provenance summary and
the report-only inferred_primary_category. Commercial fields are null when the
site never stated them (AI never fabricated them — guard enforced in enrichment.py).
"""
from __future__ import annotations

import json

from product_master import FIELD_ORDER
from config import PROCESSED_DIR
from pipeline import _infer_primary_category
from db import Db


def export_products_json(db: Db, out_path: str | None = None) -> str:
    out_path = out_path or str(PROCESSED_DIR / "products.json")

    cols = ", ".join(f'"{c}"' for c in FIELD_ORDER)
    rows = db.conn.execute(
        f"SELECT product_id, sku, {cols}, data_completeness, "
        f"recommendation_eligible, needs_review, compliance_verified, provenance "
        f"FROM products ORDER BY product_id").fetchall()

    products = []
    for r in rows:
        d = dict(r)
        product_id = d["product_id"]
        fields = {c: d.get(c) for c in FIELD_ORDER}
        prov = json.loads(d.get("provenance") or "{}")
        ai_fields = {k: v for k, v in prov.items() if isinstance(v, dict)
                     and v.get("source_type") == "ai_inference"}

        media_rows = db.conn.execute(
            "SELECT url, role, original_url, width, height, mime_type, file_size, "
            "local_path, fetched FROM product_media WHERE product_id=?",
            (product_id,)).fetchall()
        media = [dict(m) for m in media_rows]

        tag_rows = db.conn.execute(
            "SELECT tag_group, tag_value, source_type, confidence FROM product_tags "
            "WHERE product_id=?", (product_id,)).fetchall()
        tags = [dict(t) for t in tag_rows]

        products.append({
            "product_id": product_id,
            "sku": d.get("sku"),
            "inferred_primary_category": _infer_primary_category(
                d.get("secondary_category"), d.get("target_gender")),
            "secondary_category": d.get("secondary_category"),
            "target_gender": d.get("target_gender"),
            "product_name_cn": d.get("product_name_cn"),
            "product_name_en": d.get("product_name_en"),
            "description_cn": d.get("description_cn"),
            "description_en": d.get("description_en"),
            "hero_image_url": d.get("hero_image_url"),
            "data_completeness": d.get("data_completeness"),
            "recommendation_eligible": bool(d.get("recommendation_eligible")),
            "needs_review": bool(d.get("needs_review")),
            "compliance_verified": bool(d.get("compliance_verified")),
            "fields": fields,
            "media": media,
            "tags": tags,
            "ai_inferred_fields": list(ai_fields.keys()),
            "ai_inferred_count": len(ai_fields),
            "provenance_summary": {"ai_inference": len(ai_fields),
                                    "official": sum(1 for v in prov.values()
                                                    if isinstance(v, dict)
                                                    and v.get("source_type") == "official")},
        })

    payload = {
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "source": "SHAKI official website (public)",
        "product_count": len(products),
        "schema_version": "phase-02",
        "note": "primary_category is PM-locked and intentionally null; "
                "inferred_primary_category is a report-only heuristic.",
        "products": products,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return out_path
