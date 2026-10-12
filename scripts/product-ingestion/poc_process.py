"""
POC — Step 2: crawl exactly ONE real SHAKI product page, run the full pipeline,
and emit: raw data, normalized JSON, Product Master JSON, Excel row.

No bulk crawl. One product only (id=1424 from homepage).
"""
from __future__ import annotations
import os, sys, json, re, urllib.request, urllib.parse, pathlib
sys.path.insert(0, ".")
os.environ.setdefault("SHAKI_WEBSITE_URL", "https://www.SHAKI.com")

from extractors import (ExtractorStrategy, parse_jsonld, parse_meta,
                         parse_semantic, parse_text_fallback)
from mapping import build_normalized
from enrichment import enrich
from validation import merge_and_validate
from product_master import (FIELD_ORDER, FIELD_BY_ID, REQUIRED_FIELD_IDS,
                            COMMERCIAL_FORBIDDEN_IDS)
from config import SETTINGS

OUT = pathlib.Path("poc_output"); OUT.mkdir(exist_ok=True)
(raw := OUT / "raw").mkdir(exist_ok=True)

URL = "https://www.SHAKI.com/products/detail?id=1424"


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": SETTINGS.user_agent})
    with urllib.request.urlopen(req, timeout=SETTINGS.request_timeout) as r:
        return r.status, r.read().decode("utf-8", errors="replace")


print(f"[fetch] {URL}")
st, html = fetch(URL)
print(f"  status={st} html_bytes={len(html)}")

# ---- EXTRACT ----
extract = ExtractorStrategy().extract(html, URL)
jsonld, _ = parse_jsonld(html)
meta = parse_meta(html)
sem = parse_semantic(html)
fb = parse_text_fallback(html)

# ---- RAW DATA ----
(raw / "raw_html.html").write_text(html, encoding="utf-8")
raw_data = {
    "url": URL, "status": st, "html_bytes": len(html),
    "json_ld": jsonld, "meta": meta, "semantic": sem, "text_fallback": fb,
}
(raw / "raw_data.json").write_text(json.dumps(raw_data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  jsonld_present={extract.jsonld_present} name={extract.name!r} sku={extract.sku!r} imgs={len(extract.images)}")

# ---- NORMALIZE ----
norm = build_normalized(extract, raw_images=[])
(OUT / "normalized.json").write_text(json.dumps(norm, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

# ---- ENRICH (heuristic, no API key) ----
ai_fields = enrich(norm, extract)
(OUT / "ai_fields.json").write_text(
    json.dumps({k: (v.to_dict() if hasattr(v, "to_dict") else v) for k, v in ai_fields.items()},
               ensure_ascii=False, indent=2), encoding="utf-8")

# ---- VALIDATE ----
rec = merge_and_validate(norm, ai_fields, extract, raw_images=[])

# ---- PRODUCT MASTER JSON ----
pm = {
    "product_id": rec.product_id,
    "sku": rec.sku,
    "fields": rec.fields,            # flat fid -> value
    "provenance": rec.provenance,    # flat fid -> {source_type, source_reference, confidence, last_verified}
    "media": rec.media,
    "issues": rec.issues,
    "data_completeness": rec.data_completeness,
    "recommendation_eligible": rec.recommendation_eligible,
    "needs_review": rec.needs_review,
    "compliance_verified": rec.compliance_verified,
}
(OUT / "product_master.json").write_text(json.dumps(pm, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

# ---- EXCEL ROW (1 row xlsx, header = FIELD_ORDER) ----
import openpyxl
def _cell(v):
    if v is None:
        return None
    if isinstance(v, list):
        return "; ".join(str(x) for x in v)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return v
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Product_Master"
ws.append(FIELD_ORDER)
ws.append([_cell(rec.fields.get(c)) for c in FIELD_ORDER])
wb.save(str(OUT / "product_master_row.xlsx"))

# ---- STATS ----
def nonempty(v): return v not in (None, "", [], {})
website_src = ("official", "catalog", "sales_input")
website_filled, ai_filled, unobtainable, must_confirm = [], [], [], []
for fid in FIELD_ORDER:
    v = rec.fields.get(fid)
    st_src = rec.provenance.get(fid, {}).get("source_type", "")
    if nonempty(v):
        if st_src in website_src:
            website_filled.append(fid)
        elif st_src == "ai_inference":
            ai_filled.append(fid)
    else:
        if st_src != "ai_inference":
            unobtainable.append(fid)

completed_req = sum(1 for fid in REQUIRED_FIELD_IDS if nonempty(rec.fields.get(fid)))
total_req = len(REQUIRED_FIELD_IDS)
match_rate = round(100 * len(website_filled) / len(FIELD_ORDER))
req_rate = round(100 * completed_req / total_req)

# must human-confirm: primary_category (PM-locked) + commercial-forbidden null + required null + ai-inferred key fields
must_confirm = ["primary_category"]  # always PM decision
must_confirm += [fid for fid in COMMERCIAL_FORBIDDEN_IDS if not nonempty(rec.fields.get(fid))]
must_confirm += [fid for fid in REQUIRED_FIELD_IDS if not nonempty(rec.fields.get(fid)) and fid != "primary_category"]
# AI-inferred fields that materially affect matching should be human-confirmed
ai_key = {"target_gender", "secondary_category", "category_tags", "function_tags",
          "audience_tags", "scenario_tags", "design_style", "price_level", "target_market"}
must_confirm += [fid for fid in ai_key if fid in ai_filled]
must_confirm = list(dict.fromkeys(must_confirm))

summary = {
    "product_url": URL,
    "product_id": rec.product_id, "sku": rec.sku,
    "data_completeness": rec.data_completeness,
    "fields_total": len(FIELD_ORDER),
    "website_filled_count": len(website_filled),
    "website_field_match_rate_pct": match_rate,
    "required_total": total_req, "required_completed": completed_req,
    "required_match_rate_pct": req_rate,
    "ai_filled_count": len(ai_filled),
    "unobtainable_count": len(unobtainable),
    "ai_supplemented_fields": ai_filled,
    "must_human_confirm_fields": must_confirm,
    "issues": rec.issues,
}
(OUT / "poc_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

print("\n================ POC SUMMARY ================")
print(json.dumps(summary, ensure_ascii=False, indent=2))
print("\nArtifacts in poc_output/:", [p.name for p in OUT.rglob('*') if p.is_file()])
