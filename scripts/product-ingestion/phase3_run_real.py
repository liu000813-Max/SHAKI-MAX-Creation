"""
Phase 03 — Run the PRD matching engine on REAL enriched crawl data.

This is an ANALYSIS run, NOT a production recommendation pass. Two deviations
from the production hard-filter are documented and intentional:

  1. product_status "Draft" is added to eligible_statuses. All 1439 crawl
     products are "Draft" (auto-default from Phase 01, meaning "pending PM
     review"). Production recommendations still require a PM-approved status;
     this flag only lets the pipeline EXECUTE on crawl data for validation.

  2. The completeness floor is relaxed from 75 to ANALYSIS_FLOOR (default 60).
     Rationale: 6 of the 35 required fields (sku, primary_category, moq,
     lead_time, oem_available, odm_available) are Product-Manager / commercial
     fields that a web crawler can NEVER produce, and product_name_cn /
     packaging_type lack crawl signal. Measured max completeness on real data
     is 74% — the PRD 75 floor is therefore structurally unreachable for crawl
     candidates. Production keeps the 75 floor + compliance verification.

The engine code (phase3_match.py) and PRD weights (prd_config.py) are NOT
modified — only a runtime PRDConfig override is passed in.
"""
from __future__ import annotations
import sqlite3, os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from phase3_match import run_match, catalog_from_db  # noqa: E402
from prd_config import PRDConfig  # noqa: E402

ENRICHED_DB = os.path.abspath(os.path.join(HERE, "..", "..", "data", "processed", "phase3_enriched.db"))
OUT_JSON = os.path.abspath(os.path.join(HERE, "..", "..", "data", "processed", "phase3_real_result.json"))

ANALYSIS_FLOOR = 60


def build_analysis_client() -> dict:
    """A realistic US/EU premium-wellness distributor used to exercise the engine.
    requires_commercial=False so the analysis focuses on assortment fit/potential
    (crawl data has no MOQ/lead-time)."""
    return {
        "client_id": "CL-ANALYSIS-REAL",
        "client_name": "Analysis Client (real crawl data)",
        "main_categories": ["Female", "Couples"],
        "website": "https://example-distributor.com",
        "social": ["https://instagram.com/example"],
        "target_market": ["US", "EU"],
        "business_type": "Distributor",
        "requires_commercial": False,
        "brand_style": ["Premium", "Feminine", "Minimal", "Wellness", "Elegant"],
        "audience": {
            "gender": ["Female", "Couples"],
            "age_range": [25, 42],
            "segment": ["Premium", "Wellness", "Mass Market"],
        },
        "existing_portfolio": ["Vibrators", "Massagers", "Couples Massagers", "Suction"],
        "portfolio_gaps": ["Wearables", "Couples Wearables", "Lubricants",
                            "Intimate Cleansing", "Smart Devices"],
        "explicit_exclusions": ["BDSM"],
        "price_corridor": ["Mid-Premium", "Premium"],
    }


def main():
    if not os.path.exists(ENRICHED_DB):
        raise SystemExit(f"Enriched DB missing. Run phase3_enrich.py first.\n  {ENRICHED_DB}")

    catalog = catalog_from_db(ENRICHED_DB, limit=100000)
    print(f"Loaded catalog: {len(catalog)} products from enriched DB")

    client = build_analysis_client()

    # analysis-mode config override (does NOT touch engine or DEFAULT_CONFIG)
    cfg = PRDConfig(
        hard_filter_data_completeness=ANALYSIS_FLOOR,
        eligible_statuses=("Active", "New", "Best Seller", "Strategic", "Coming Soon", "Draft"),
    )

    result = run_match(catalog, client, cfg)

    hf = result["pipeline"]["stage1_hard_filter"]
    print("\n=== HARD FILTER (analysis mode, floor={}) ===".format(ANALYSIS_FLOOR))
    print(f"  input:   {hf['input']}")
    print(f"  passed:  {hf['passed']}")
    print(f"  excluded:{hf['excluded']}")
    print(f"  by_reason: {hf['by_reason']}")

    recs = result["recommendations"]
    print(f"\n=== TOP {len(recs)} RECOMMENDATIONS ===")
    for i, r in enumerate(recs, 1):
        six = r["six_dimension"]
        print(f"\n  [{i}] {r['recommendation_type']}  | fit={r['fit_score']} "
              f"potential={r['potential_score']} final={r['final_score']} conf={r['confidence']}")
        print(f"      sku={r['sku']}  cat={six['category_fit']} aud={six['audience_fit']} "
              f"brand={six['brand_fit']} price={six['price_fit']} port={six['portfolio_fit']} mkt={six['market_fit']}")
        wr = r["why_recommend"]
        print(f"      why: {wr['client_fact']}")
        print(f"           {wr['product_fact']}")
        print(f"           {wr['business_reason']}")

    result["_analysis_meta"] = {
        "mode": "ANALYSIS (non-production)",
        "completeness_floor": ANALYSIS_FLOOR,
        "note": "Draft status admitted; 6 PM/commercial required fields are "
                "structurally un-fillable by a crawler so 75 floor is unreachable. "
                "Production requires PM-approved status + compliance_verified.",
        "client": client["client_id"],
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nSaved -> {OUT_JSON}")


if __name__ == "__main__":
    main()
