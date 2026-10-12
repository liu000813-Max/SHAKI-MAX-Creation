"""
Validation & scoring.

  * Data Completeness = completed Required fields / Required fields  (spec section 19)
  * Product Intelligence Score = ROUND(Q*.20 + D*.15 + F*.15 + C*.20 + M*.15 + B*.15)
    (Scoring sheet; computed here as `system`, not invented by AI)
  * Recommendation eligibility (spec section 20):
        product_status in eligible set
        AND data_completeness >= DATA_COMPLETENESS_MIN (75)
        AND compliance_verified == True
    In Phase 01 auto-ingest, compliance_verified defaults to False (pending human
    review), so nothing auto-enters the pool — by design.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from product_master import (REQUIRED_FIELD_IDS, SCORING, SOURCE_PRIORITY,
                            FIELD_BY_ID)
from runtime import ExtractedProduct, FieldValue
from config import SETTINGS

ELIGIBLE_STATUSES = {"Active", "New", "Best Seller", "Strategic", "Coming Soon"}


@dataclass
class ProductRecord:
    product_id: str
    sku: str | None
    fields: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, dict] = field(default_factory=dict)
    media: list[dict] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    data_completeness: int = 0
    recommendation_eligible: bool = False
    needs_review: bool = True
    compliance_verified: bool = False


def _merge(normalized: dict, ai_fields: dict) -> tuple[dict, dict]:
    """Merge with source-priority: official > catalog > sales_input > ai_inference."""
    merged: dict[str, FieldValue] = {}
    merged.update(normalized.get("fields", {}))
    for fid, fv in ai_fields.items():
        existing = merged.get(fid)
        if existing is None:
            merged[fid] = fv
        else:
            ep = SOURCE_PRIORITY.get(existing.source_type, 1)
            np = SOURCE_PRIORITY.get(fv.source_type, 1)
            if np > ep:
                merged[fid] = fv
    values = {k: fv.value for k, fv in merged.items()}
    prov = {k: {"source_type": fv.source_type, "source_reference": fv.source_reference,
                "confidence": fv.confidence, "last_verified": fv.last_verified}
             for k, fv in merged.items()}
    return values, prov


def _compute_intelligence(values: dict) -> int:
    w = SCORING["product_intelligence"]
    # use provided sub-scores if present & valid, else proxy from completeness
    comp = values.get("data_completeness") or 0
    parts = []
    for sfid, weight in w.items():
        v = values.get(sfid)
        if not isinstance(v, (int, float)):
            v = comp
        parts.append(v * weight)
    return round(sum(parts))


def merge_and_validate(normalized: dict, ai_fields: dict,
                       extracted: ExtractedProduct, raw_images: list | None = None) -> ProductRecord:
    values, prov = _merge(normalized, ai_fields)
    issues = list(normalized.get("issues", []))

    # product_id
    sku = values.get("sku")
    if sku:
        product_id = f"PRD-{sku}" if not str(sku).startswith("PRD-") else str(sku)
    else:
        import hashlib
        product_id = "AUTO-" + hashlib.sha256(extracted.url.encode()).hexdigest()[:10].upper()
        issues.append("missing SKU — generated synthetic product_id; needs manual SKU")

    # product_status default
    status = values.get("product_status")
    if not status:
        values["product_status"] = "Draft"
        prov["product_status"] = {"source_type": "manual", "source_reference": "pipeline-default",
                                   "confidence": 1.0, "last_verified": prov.get("product_status", {}).get("last_verified", "")}
        issues.append("product_status not found on page — defaulted to Draft (pending review)")

    # data completeness (required fields completed)
    completed = sum(1 for fid in REQUIRED_FIELD_IDS if values.get(fid) not in (None, "", []))
    total = len(REQUIRED_FIELD_IDS)
    data_completeness = round(100 * completed / total) if total else 0
    values["data_completeness"] = data_completeness

    # intelligence score
    pi = _compute_intelligence(values)
    values["product_intelligence_score"] = pi
    prov["product_intelligence_score"] = {"source_type": "system", "source_reference": "formula",
                                           "confidence": 1.0, "last_verified": ""}

    # priority score (Formula placeholder: blend intelligence + completeness)
    values["product_priority_score"] = round(0.5 * pi + 0.5 * data_completeness)
    prov["product_priority_score"] = {"source_type": "system", "source_reference": "formula",
                                       "confidence": 1.0, "last_verified": ""}

    # compliance (Phase 01: not auto-verified)
    compliance_verified = False
    values["compliance_verified"] = compliance_verified

    # recommendation eligibility
    eligible_status = values.get("product_status") in ELIGIBLE_STATUSES
    recommendation_eligible = (eligible_status and
                               data_completeness >= SETTINGS.data_completeness_min and
                               compliance_verified)
    values["recommendation_eligible"] = recommendation_eligible

    # needs review if any required missing or issues present or status Draft
    needs_review = (values["product_status"] == "Draft") or bool(issues) or (completed < total)

    rec = ProductRecord(
        product_id=product_id, sku=sku, fields=values, provenance=prov,
        media=normalized.get("media", []), issues=issues,
        data_completeness=data_completeness,
        recommendation_eligible=recommendation_eligible,
        needs_review=needs_review, compliance_verified=compliance_verified,
    )
    return rec
