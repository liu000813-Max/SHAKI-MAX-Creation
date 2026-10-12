"""
AI Product Enrichment.

Fills ONLY AI-role fields (Field_Dictionary `ai_role` in {AI, AI assist, AI vision,
AI polish}) and NEVER commercial-forbidden fields (spec section 14). Every AI value
is tagged source_type="ai_inference" with a confidence, so it can never be mistaken
for official data.

Two backends:
  * heuristic  — deterministic, no API key. Derives tags/scores from extracted text.
  * openai|doubao — OpenAI-compatible chat completion returning a JSON patch.

The prompt explicitly forbids inventing MOQ / price / material / certification / sales.
"""
from __future__ import annotations

import json
import re
import urllib.request

from product_master import (AI_FILLABLE_IDS, COMMERCIAL_FORBIDDEN_IDS, ENUMS,
                            FIELD_BY_ID, SCORING, is_commercial_forbidden)
from runtime import ExtractedProduct, FieldValue
from config import SETTINGS

# Keyword -> enum maps for the heuristic backend
_GENDER_KW = {
    "female": "Female", "women": "Female", "woman": "Female", "her": "Female",
    "male": "Male", "men": "Male", "man": "Male", "his": "Male",
    "couple": "Couples", "couples": "Couples", "partner": "Couples",
}
_STYLE_KW = {s.lower(): s for s in ENUMS["DesignStyle"]}
_SECONDARY_KW = {
    "massager": "Massagers", "vibrator": "Vibrators", "vibration": "Vibrators",
    "suction": "Suction", "lubricant": "Lubricants", "lube": "Lubricants",
    "ring": "Rings", "blindfold": "Blindfolds", "restraint": "Restraints",
    "collar": "Collars", "wearable": "Wearables", "insertable": "Insertable",
    "prostate": "Prostate", "masturbator": "Masturbators", "remote": "Remote Play",
}
_FEATURE_KW = {
    "vibrat": "Vibration", "suction": "Suction", "rotat": "Rotation",
    "heat": "Heating", "cool": "Cooling", "puls": "Pulsation", "massage": "Massage",
    "remote": "Remote Control", "app": "App Control", "waterproof": "Waterproof",
}
_SCENARIO_KW = {
    "travel": "Travel", "gift": "Gift", "couple": "Couples", "bedroom": "Bedroom",
    "solo": "Solo", "date": "Date Night", "self": "Self Care",
}


def _text_of(extracted: ExtractedProduct) -> str:
    return f"{extracted.name} {extracted.description} {' '.join(str(v) for v in (extracted.attributes or {}).values())}".lower()


def _heuristic_patch(extracted: ExtractedProduct) -> dict:
    text = _text_of(extracted)
    patch: dict[str, object] = {}

    # gender
    for kw, val in _GENDER_KW.items():
        if re.search(rf"\b{kw}\b", text):
            patch["target_gender"] = val
            break
    if "all genders" in text or "unisex" in text:
        patch["target_gender"] = "All Genders"

    # secondary_category (validated enum)
    for kw, val in _SECONDARY_KW.items():
        if kw in text:
            patch["secondary_category"] = val
            break

    # design / visual style
    styles = [v for k, v in _STYLE_KW.items() if k in text]
    if styles:
        patch["design_style"] = styles[:3]
        patch["visual_style"] = styles[:3]

    # functional tags
    feats = [v for k, v in _FEATURE_KW.items() if k in text]
    if feats:
        patch["function_tags"] = feats

    # scenario tags
    scen = [v for k, v in _SCENARIO_KW.items() if k in text]
    if scen:
        patch["scenario_tags"] = scen

    # audience tags
    aud = []
    if patch.get("target_gender") == "Female":
        aud.append("Female")
    elif patch.get("target_gender") == "Male":
        aud.append("Male")
    elif patch.get("target_gender") == "Couples":
        aud.append("Couples")
    if "premium" in text:
        aud.append("Premium")
    if "wellness" in text or "health" in text:
        aud.append("Wellness")
    if aud:
        patch["audience_tags"] = aud

    # category_tags (mirror secondary or fallback)
    if patch.get("secondary_category"):
        patch["category_tags"] = [patch["secondary_category"]]
    elif patch.get("target_gender"):
        patch["category_tags"] = [patch["target_gender"]]

    # style_tags
    if styles:
        patch["style_tags"] = styles[:3]

    # price_tags / positioning_tags (light)
    if "premium" in text:
        patch["price_tags"] = ["Premium"]
        patch["positioning_tags"] = ["Premium Product"]
    if "bestseller" in text or "best seller" in text:
        patch["positioning_tags"] = patch.get("positioning_tags", []) + ["Bestseller"]

    # primary_function if missing
    if feats:
        patch["primary_function"] = feats[0]

    # product_highlights (short, derived)
    if extracted.name:
        patch["product_highlights"] = [f"{extracted.name}: " +
                                        (extracted.description[:80] if extracted.description else "AI-extracted highlight")]

    # sub-scores (heuristic, used by validation to compute product_intelligence_score)
    filled = sum(1 for _ in (extracted.name, extracted.description, extracted.sku, extracted.images))
    base = 60 + min(30, filled * 6)
    patch["_sub_scores"] = {
        "product_quality_score": base,
        "design_value_score": base - 5,
        "functional_diff_score": base,
        "commercial_potential_score": base,
        "market_adaptability_score": base,
        "brand_value_score": base,
    }
    return patch


SYSTEM_PROMPT = (
    "You are SHAKI Product Enrichment Agent. Given extracted product data, return a JSON "
    "object filling ONLY these AI-role fields: secondary_category, tertiary_category, "
    "functional_category, usage_category, scenario_category, product_highlights, "
    "differentiation, primary_function, target_gender, target_segment, design_style, "
    "visual_style, category_tags, function_tags, audience_tags, style_tags, scenario_tags, "
    "market_tags, price_tags, opportunity_tags, positioning_tags, recommended_market, "
    "recommended_category. Use ONLY values implied by the source. NEVER invent MOQ, price, "
    "material, waterproof rating, battery capacity, certification, sales, or OEM. "
    "Return JSON only."
)


def _call_llm(extracted: ExtractedProduct, settings) -> dict:
    payload = {
        "model": settings.ai_model,
        "temperature": settings.ai_temperature,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(extracted.to_dict(), ensure_ascii=False)[:6000]},
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        settings.ai_base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {settings.ai_api_key}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=settings.request_timeout) as resp:
        data = json.loads(resp.read())
    return json.loads(data["choices"][0]["message"]["content"])


def enrich(normalized: dict, extracted: ExtractedProduct) -> dict[str, FieldValue]:
    """Return AI-generated fields as FieldValue with source_type='ai_inference'."""
    if SETTINGS.ai_provider == "heuristic" or not SETTINGS.ai_api_key:
        patch = _heuristic_patch(extracted)
    else:
        try:
            patch = _call_llm(extracted, SETTINGS)
        except Exception as e:
            print(f"  [enrich] LLM failed ({e}); falling back to heuristic")
            patch = _heuristic_patch(extracted)

    sub = patch.pop("_sub_scores", None)
    out: dict[str, FieldValue] = {}

    def add(fid, value, conf=0.5):
        if fid in COMMERCIAL_FORBIDDEN_IDS:
            return  # hard guard: never AI-fill commercial fields
        f = FIELD_BY_ID.get(fid)
        if not f or not value:
            return
        if fid not in AI_FILLABLE_IDS:
            return  # only AI-role fields
        # multiselect normalization
        if f["type"] == "Multi-select" and isinstance(value, str):
            value = [value]
        # enum guard
        if f["enum"]:
            allowed = set(ENUMS.get(f["enum"], []))
            vals = value if isinstance(value, list) else [value]
            vals = [v for v in vals if v in allowed]
            if not vals:
                return
            value = vals if isinstance(value, list) else vals[0]
        out[fid] = FieldValue(value=value, source_type="ai_inference",
                              source_reference="ai:" + SETTINGS.ai_provider, confidence=conf)

    for fid, val in patch.items():
        add(fid, val)

    # attach sub-scores (ai_inference) so validation can compute the formula
    if sub:
        for sfid, sval in sub.items():
            out[sfid] = FieldValue(value=int(sval), source_type="ai_inference",
                                   source_reference="ai:heuristic-score", confidence=0.5)
    return out
