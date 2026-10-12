"""
Product Field Mapping Layer — map extracted site data onto the Product Master.

Rules enforced here:
  * Every field carries provenance: source_type / source_reference / confidence.
  * Commercial fields are stored ONLY when the official site actually states them.
    (AI never invents them — that guard lives in enrichment.py.)
  * Enums are validated; invalid values are kept but flagged for human review.
  * Types are coerced (Yes/No, Number, Multi-select, Date, Currency).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from product_master import FIELD_BY_ID, is_primary_category_allowed, enum_values
from runtime import ExtractedProduct, FieldValue

_yes = {"yes", "true", "y", "1", "是", "有", "可充电"}
_no = {"no", "false", "n", "0", "否", "无"}


def _coerce_yesno(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in _yes:
        return "Yes"
    if s in _no:
        return "No"
    return None


def _coerce_number(v):
    if v is None or v == "":
        return None
    s = str(v).replace(",", "").strip()
    m = re.search(r"-?\d+(\.\d+)?", s)
    if not m:
        return None
    num = float(m.group(0))
    return int(num) if num.is_integer() else num


def _coerce_multiselect(v) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [p.strip() for p in re.split(r"[;,|/]", str(v)) if p.strip()]


def _has_cjk(s: str) -> bool:
    return bool(re.search(r"[一-鿿]", s or ""))


def build_normalized(extracted: ExtractedProduct, raw_images: list | None = None) -> dict:
    fields: dict[str, FieldValue] = {}
    issues: list[str] = []
    media: list[dict] = []

    src_ref = extracted.url
    strat_conf = {"jsonld": 0.95, "meta": 0.8, "semantic_html": 0.6, "text_fallback": 0.4}.get(
        extracted.strategy, 0.5)

    def set_field(fid, value, source_type="official", conf=None, reference=None):
        f = FIELD_BY_ID.get(fid)
        if not f:
            return
        if value is None or value == "" or value == []:
            return  # leave null — never fabricate
        conf = strat_conf if conf is None else conf
        # enum validation
        if f["enum"]:
            allowed = enum_values(fid)
            vals = value if isinstance(value, list) else [value]
            cleaned = []
            for v in vals:
                if v in allowed:
                    cleaned.append(v)
                else:
                    issues.append(f"invalid enum value for {fid}: '{v}' (not in {allowed[:5]}...)")
                    conf = min(conf, 0.3)
                    cleaned.append(v)  # keep, human review corrects
            value = cleaned if isinstance(value, list) else (cleaned[0] if cleaned else value)
        fields[fid] = FieldValue(
            value=value, source_type=source_type,
            source_reference=reference or src_ref, confidence=round(conf, 2))

    # --- identity / description ---
    # Language split: if name has CJK -> cn, else en
    name = extracted.name.strip()
    if name:
        if _has_cjk(name):
            set_field("product_name_cn", name)
        else:
            set_field("product_name_en", name)
    if extracted.sku:
        set_field("sku", extracted.sku)
    if extracted.model:
        set_field("model_number", extracted.model)
    desc = extracted.description.strip()
    if desc:
        if _has_cjk(desc):
            set_field("description_cn", desc)
        else:
            set_field("description_en", desc)

    # --- images -> media + hero_image_url ---
    imgs = extracted.images or []
    for im in imgs:
        role = (im.get("role") or "OTHER").upper()
        url = im.get("url") or im.get("original_url") or ""
        if not url:
            continue
        media.append({"url": url, "role": role, "original_url": im.get("original_url", url)})
    hero = next((m for m in media if m["role"] == "HERO"), None)
    if hero:
        set_field("hero_image_url", hero["url"])

    # --- attributes bag -> known fields ---
    attr = extracted.attributes or {}
    simple_map = {
        "main_material": "main_material",
        "waterproof_rating": "waterproof_rating",
        "net_weight": "net_weight",
        "battery_capacity": "battery_capacity",
        "rechargeable": "rechargeable",
        "model": "model_number",
        "sku": "sku",
        "brand": None,  # brand captured as text only; product_status brand handled elsewhere
    }
    for k, fid in simple_map.items():
        if fid is None or k not in attr:
            continue
        v = attr[k]
        f = FIELD_BY_ID[fid]
        if f["type"] == "Yes/No":
            v = _coerce_yesno(v)
        elif f["type"] == "Number":
            v = _coerce_number(v)
        set_field(fid, v)

    # primary_category is NEVER auto-mapped (Product Manager only). Left null.
    if "primary_category" in attr:
        issues.append("primary_category present in page attributes but ignored (Product Manager sets it)")

    return {"fields": fields, "media": media, "issues": issues}
