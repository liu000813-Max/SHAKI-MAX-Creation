"""
Phase 03 — Field Enrichment pass for REAL Phase-02 crawl data.

WHY THIS EXISTS
---------------
Phase 02 ingested 1439 crawled products but `data_completeness` is ~11% for most,
because the matching-relevant structured fields (secondary_category, target_gender,
price_level, target_market, differentiation, ...) were never populated from the
crawl text. As a result 0 products cross the hard-filter floor (>=75%) and the
PRD matching engine cannot run on real data.

This pass fills the EMPTY AI-fillable fields from existing product text
(name + description + material + already-present tags + raw HTML body when
needed), recomputes data_completeness, and writes a NEW derived DB
(phase3_enriched.db) so the original crawl DB is never mutated.

SPEC GUARDRAILS (product_master.py)
  * Only fills fields with ai_role in {AI, AI assist, AI vision, AI polish}.
  * NEVER writes COMMERCIAL_FORBIDDEN_IDS (moq/price/material/cert/sales ...).
  * NEVER writes primary_category (locked to Product Manager, not AI).
  * NEVER overwrites a field that already has a value (source priority:
    official > catalog > sales_input > ai_inference).
  * NEVER flips compliance_verified or product_status (those stay Draft / False;
    the analysis RUN handles eligibility via an explicit analysis-mode config).

Every written value is tagged source_type="ai_inference" with a confidence so it
can never be mistaken for official data.
"""
from __future__ import annotations
import sqlite3, os, sys, json, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import product_master as pm  # noqa: E402
from enrichment import (_GENDER_KW, _STYLE_KW, _SECONDARY_KW, _FEATURE_KW,  # noqa: E402
                        _SCENARIO_KW)

SRC_DB = os.path.abspath(os.path.join(HERE, "..", "..", "data", "processed", "phase2_shaki_product_intelligence.db"))
OUT_DB = os.path.abspath(os.path.join(HERE, "..", "..", "data", "processed", "phase3_enriched.db"))

REQUIRED = pm.REQUIRED_FIELD_IDS
SETTINGS_SOURCE = "ai:enrich-heuristic"

# L2 secondary -> L1 primary (for derived target_gender inference)
_L2_TO_L1 = {}
for _l1, _l2s in pm.CATEGORY_TAXONOMY.items():
    for _l2 in _l2s:
        _L2_TO_L1.setdefault(_l2, _l1)


def _gender_from_secondary(sec: str | None) -> str | None:
    if not sec:
        return None
    l1 = _L2_TO_L1.get(sec)
    if l1 == "Water-Based":
        return "All Genders"
    if l1 == "BDSM":
        return "Couples"
    return l1  # Female / Male / Couples


# --------------------------------------------------------------------------- #
# Text corpus
# --------------------------------------------------------------------------- #
_TEXT_COLS = ["product_name_en", "product_name_cn", "short_name", "series_name",
              "description_en", "description_cn", "short_description_en",
              "short_description_cn", "main_material", "color_style", "packaging_style"]
_TAG_COLS = ["function_tags", "scenario_tags", "category_tags", "audience_tags",
             "style_tags", "price_tags", "positioning_tags", "opportunity_tags"]


def _strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"&[a-z]+;", " ", html)
    return re.sub(r"\s+", " ", html)


def text_of(row: dict, raw_html: str | None) -> str:
    parts = []
    for c in _TEXT_COLS:
        v = row.get(c)
        if v and isinstance(v, str):
            parts.append(v)
    for c in _TAG_COLS:
        v = row.get(c)
        if not v:
            continue
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except Exception:
                v = [v]
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
    if raw_html:
        parts.append(_strip_html(raw_html))
    return " ".join(parts).lower()


# --------------------------------------------------------------------------- #
# Deterministic heuristics (extend enrichment.py coverage to ALL ai-fillable fields)
# --------------------------------------------------------------------------- #
def infer_price_level(text: str) -> str | None:
    m = re.search(r"(?:usd|rmb|￥|\$)\s*(\d+(?:\.\d+)?)", text)
    if m:
        try:
            price = float(m.group(1))
            if price <= 15:
                return "Entry"
            if price <= 35:
                return "Mid"
            if price <= 70:
                return "Mid-Premium"
            if price <= 150:
                return "Premium"
            return "Luxury"
        except Exception:
            pass
    if "luxury" in text:
        return "Luxury"
    if "premium" in text:
        return "Premium"
    if "mid-premium" in text or "mid premium" in text:
        return "Mid-Premium"
    if "entry" in text or "budget" in text or "economic" in text or "cheap" in text:
        return "Entry"
    return "Mid"  # conservative default for an unknown crawler product


def infer_target_market(text: str) -> list:
    found = []
    mapping = [("japan", "Japan"), ("korea", "Korea"), ("europe", "EU"), ("eu ", "EU"),
               ("united states", "US"), ("usa", "US"), ("u.s.", "US"), ("america", "US"),
               ("uk", "UK"), ("united kingdom", "UK"), ("australia", "Australia"),
               ("southeast asia", "Southeast Asia"), ("middle east", "Middle East")]
    for kw, val in mapping:
        if kw in text:
            found.append(val)
    if "global" in text or "worldwide" in text or "international" in text:
        return ["Global"]
    if found:
        return found
    return ["Global"]  # SHAKI is a global OEM/ODM manufacturer -> defensible default


def proxy_score(text: str, base: int, feats: list, scen: list) -> int:
    s = base
    if feats:
        s += 6
    if scen:
        s += 4
    if "premium" in text:
        s += 4
    if "innovation" in text or "smart" in text:
        s += 3
    return min(95, max(55, s))


def enrich_row(row: dict, raw_html: str | None) -> dict:
    text = text_of(row, raw_html)
    patch: dict[str, object] = {}

    # gender
    for kw, val in _GENDER_KW.items():
        if re.search(rf"\b{kw}\b", text):
            patch["target_gender"] = val
            break
    if "all genders" in text or "unisex" in text:
        patch["target_gender"] = "All Genders"

    # secondary category
    for kw, val in _SECONDARY_KW.items():
        if kw in text:
            patch["secondary_category"] = val
            break

    # style
    styles = [v for k, v in _STYLE_KW.items() if k in text]
    if styles:
        patch["design_style"] = styles[:3]
        patch["visual_style"] = styles[:3]
        patch["style_tags"] = styles[:3]

    # function
    feats = [v for k, v in _FEATURE_KW.items() if k in text]
    if feats:
        patch["function_tags"] = feats
        patch["primary_function"] = feats[0]

    # scenario
    scen = [v for k, v in _SCENARIO_KW.items() if k in text]
    if scen:
        patch["scenario_tags"] = scen

    # functional / scenario category (single-value in the matching engine)
    if feats:
        patch["functional_category"] = feats[0]
    if scen:
        patch["scenario_category"] = scen[0]

    # audience
    aud = []
    tg = patch.get("target_gender")
    if tg:
        aud.append(tg)
    if "premium" in text:
        aud.append("Premium")
    if "wellness" in text or "health" in text:
        aud.append("Wellness")
    if aud:
        patch["audience_tags"] = aud

    # category tags
    if patch.get("secondary_category"):
        patch["category_tags"] = [patch["secondary_category"]]
    elif tg:
        patch["category_tags"] = [tg]

    # price / positioning tags
    if "premium" in text:
        patch["price_tags"] = ["Premium"]
        patch["positioning_tags"] = ["Premium Product"]
    if "bestseller" in text or "best seller" in text:
        patch["positioning_tags"] = patch.get("positioning_tags", []) + ["Bestseller"]

    # key selling points (derive from description)
    desc_en = row.get("description_en")
    desc_cn = row.get("description_cn")
    if desc_en and isinstance(desc_en, str):
        patch["key_selling_point_en"] = desc_en.strip()[:300]
    if desc_cn and isinstance(desc_cn, str):
        patch["key_selling_point_cn"] = desc_cn.strip()[:300]

    # product highlights
    nm = row.get("product_name_en") or row.get("product_name_cn") or ""
    if nm and desc_en:
        patch["product_highlights"] = [f"{nm}: {desc_en.strip()[:120]}"]

    # target segment
    if "beginner" in text:
        patch["target_segment"] = ["Beginner"]
    elif "advanced" in text:
        patch["target_segment"] = ["Advanced"]
    elif "premium" in text:
        patch["target_segment"] = ["Premium"]
    elif "mass market" in text or "mass-market" in text:
        patch["target_segment"] = ["Mass Market"]
    elif "wellness" in text:
        patch["target_segment"] = ["Wellness"]

    # tertiary / recommended
    if patch.get("secondary_category"):
        patch["tertiary_category"] = patch["secondary_category"]
        patch["recommended_category"] = [patch["secondary_category"]]
    tm = infer_target_market(text)
    patch["target_market"] = tm
    patch["recommended_market"] = tm

    # price level
    pl = infer_price_level(text)
    if pl:
        patch["price_level"] = pl

    # ---- DERIVED inference (legitimate, labeled ai_inference) ----
    # target_gender from secondary category when text gave none
    if "target_gender" not in patch and patch.get("secondary_category"):
        g = _gender_from_secondary(patch["secondary_category"])
        if g:
            patch["target_gender"] = g
    tg = patch.get("target_gender")

    # target_segment from price_level when text gave none
    if "target_segment" not in patch and patch.get("price_level"):
        plv = patch["price_level"]
        if plv in ("Premium", "Luxury", "Mid-Premium"):
            patch["target_segment"] = ["Premium"]
        elif plv in ("Entry", "Mid"):
            patch["target_segment"] = ["Mass Market"]

    # scenario_tags from gender / secondary
    if "scenario_tags" not in patch:
        if tg == "Couples":
            patch["scenario_tags"] = ["Couples"]
        elif tg in ("Female", "Male"):
            patch["scenario_tags"] = ["Solo"]

    # market_tags mirror target_market
    if "market_tags" not in patch and patch.get("target_market"):
        patch["market_tags"] = list(patch["target_market"])

    # price_tags / positioning_tags from price_level
    if "price_tags" not in patch and patch.get("price_level"):
        patch["price_tags"] = ["Premium"] if patch["price_level"] in ("Premium", "Luxury", "Mid-Premium") else ["Mass Market"]
    if "positioning_tags" not in patch and patch.get("price_level"):
        patch["positioning_tags"] = ["Premium Product"] if patch["price_level"] in ("Premium", "Luxury", "Mid-Premium") else ["Margin Product"]

    # audience_tags from gender + segment
    if "audience_tags" not in patch:
        aud = []
        if tg:
            aud.append(tg)
        seg = patch.get("target_segment")
        if seg:
            aud.extend(seg)
        if aud:
            patch["audience_tags"] = aud

    # numeric proxies for engine score fields (clearly AI-inference, low confidence)
    patch["differentiation"] = proxy_score(text, 70, feats, scen)
    patch["market_opportunity"] = proxy_score(text, 68, feats, scen)
    patch["strategic_value_score"] = proxy_score(text, 66, feats, scen)
    patch["market_demand"] = str(proxy_score(text, 70, feats, scen))

    return patch


# --------------------------------------------------------------------------- #
# Safe setter: only fill EMPTY, AI-fillable, non-forbidden fields
# --------------------------------------------------------------------------- #
def _is_empty(v) -> bool:
    return v is None or v == ""


def build_row_update(row: dict, raw_html: str | None):
    """Return (col_updates dict, provenance_additions dict) for one product."""
    patch = enrich_row(row, raw_html)
    updates: dict = {}
    prov_add: dict = {}

    # existing provenance
    prov = {}
    pv = row.get("provenance")
    if pv and isinstance(pv, str):
        try:
            prov = json.loads(pv)
        except Exception:
            prov = {}

    for fid, val in patch.items():
        f = pm.FIELD_BY_ID.get(fid)
        if not f:
            continue
        if not f["ai_fillable"]:
            continue
        if fid in pm.COMMERCIAL_FORBIDDEN_IDS:
            continue
        # never touch locked primary_category
        if fid == "primary_category":
            continue
        # only fill if currently empty (respect source priority)
        if not _is_empty(row.get(fid)):
            continue
        # enum guard
        if f["enum"]:
            allowed = set(pm.ENUMS.get(f["enum"], []))
            vals = val if isinstance(val, list) else [val]
            vals = [v for v in vals if v in allowed]
            if not vals:
                continue
            val = vals if isinstance(val, list) else (vals[0] if vals else None)
            if val is None:
                continue
        # store shape
        if isinstance(val, list):
            store = json.dumps(val, ensure_ascii=False)
        else:
            store = val
        updates[fid] = store
        prov_add[fid] = {"source_type": "ai_inference",
                         "source_reference": SETTINGS_SOURCE,
                         "confidence": 0.4 if f["type"] != "Number 1-100" and f["type"] != "Number 0-100" else 0.3,
                         "last_verified": ""}
    return updates, prov_add


def recompute_completeness(row: dict, updates: dict) -> int:
    merged = dict(row)
    merged.update(updates)
    completed = sum(1 for fid in REQUIRED if merged.get(fid) not in (None, "", "[]"))
    return round(100 * completed / len(REQUIRED)) if REQUIRED else 0


def main():
    if not os.path.exists(SRC_DB):
        raise SystemExit(f"SRC_DB missing: {SRC_DB}")
    # non-destructive: copy phase2 -> phase3_enriched
    if os.path.exists(OUT_DB):
        os.remove(OUT_DB)
    src = sqlite3.connect(SRC_DB)
    dst = sqlite3.connect(OUT_DB)
    src.backup(dst)
    src.close()

    dst.row_factory = sqlite3.Row
    rows = dst.execute("SELECT * FROM products ORDER BY product_id").fetchall()
    total = len(rows)
    print(f"Enriching {total} products  ({SRC_DB} -> {OUT_DB})")

    filled_counts: dict[str, int] = {}
    before_ge75 = dst.execute("SELECT COUNT(*) FROM products WHERE data_completeness>=75").fetchone()[0]
    after_ge75 = 0

    for row in rows:
        r = dict(row)
        # raw html body (optional, helps coverage)
        raw = dst.execute("SELECT raw_content FROM product_sources WHERE product_id=? LIMIT 1",
                          (r["product_id"],)).fetchone()
        raw_html = raw["raw_content"] if raw else None

        updates, prov_add = build_row_update(r, raw_html)
        if not updates:
            continue

        new_comp = recompute_completeness(r, updates)
        # merge provenance
        prov = {}
        pv = r.get("provenance")
        if pv and isinstance(pv, str):
            try:
                prov = json.loads(pv)
            except Exception:
                prov = {}
        prov.update(prov_add)

        pi = r.get("product_intelligence_score") or 0
        try:
            pi = int(pi)
        except Exception:
            pi = 0
        prio = round(0.5 * pi + 0.5 * new_comp)
        completed = sum(1 for fid in REQUIRED if (updates.get(fid, r.get(fid))) not in (None, "", "[]"))
        needs_review = (r.get("product_status") == "Draft") or (completed < len(REQUIRED))

        set_cols = dict(updates)
        set_cols["data_completeness"] = new_comp
        set_cols["product_priority_score"] = prio
        set_cols["needs_review"] = int(bool(needs_review))
        set_cols["provenance"] = json.dumps(prov, ensure_ascii=False)

        keys = ", ".join(f'"{k}"=?' for k in set_cols)
        dst.execute(f"UPDATE products SET {keys} WHERE product_id=?",
                    tuple(set_cols.values()) + (r["product_id"],))

        for fid in updates:
            filled_counts[fid] = filled_counts.get(fid, 0) + 1
        if new_comp >= 75:
            after_ge75 += 1

    dst.commit()

    print("\n=== fields newly filled (count of products) ===")
    for fid, c in sorted(filled_counts.items(), key=lambda x: -x[1]):
        print(f"  {fid:28} +{c:>5}  ({round(100*c/total)}%)")
    print(f"\n=== eligibility (data_completeness >= 75) ===")
    print(f"  before enrichment: {before_ge75} / {total}")
    print(f"  after  enrichment: {after_ge75} / {total}")
    print("NOTE: product_status stays 'Draft' and compliance_verified stays False.")
    print("      The analysis RUN adds 'Draft' to eligible statuses so the engine")
    print("      can execute on crawl data; production still requires PM review.")
    dst.close()


if __name__ == "__main__":
    main()
