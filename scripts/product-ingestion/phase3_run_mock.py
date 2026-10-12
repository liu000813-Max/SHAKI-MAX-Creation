"""
Phase 03 — run the matching engine against the deterministic Mock Client +
500-SKU mock catalog, then emit deliverables:

  data/processed/phase3_mock_result.json   (full PRD JSON schema + pipeline stages)
  docs/phase3_mock_report.md                (human-readable 500->80 / 80->20 / 20->5)

Run:  PY=managed-python  phase3_run_mock.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from prd_config import DEFAULT_CONFIG
from mock_data import load_mock
from phase3_match import run_match

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_JSON = os.path.join(ROOT, "data", "processed", "phase3_mock_result.json")
OUT_MD = os.path.join(ROOT, "docs", "phase3_mock_report.md")


def md_report(res: dict, client: dict) -> str:
    L = []
    L.append(f"# Phase 03 — Mock Client Matching Report\n")
    L.append(f"- **Client:** `{client['client_id']}` ({client['client_name']})")
    L.append(f"- **Main categories:** {', '.join(client['main_categories'])}")
    L.append(f"- **Target market:** {', '.join(client['target_market'])}")
    L.append(f"- **Brand style:** {', '.join(client['brand_style'])}")
    L.append(f"- **Portfolio gaps:** {', '.join(client['portfolio_gaps'])}")
    L.append(f"- **Explicit exclusions:** {', '.join(client['explicit_exclusions'])}")
    L.append(f"- **Price corridor:** {', '.join(client['price_corridor'])}")
    L.append("")

    pl = res["pipeline"]
    s1 = pl["stage1_hard_filter"]
    L.append("## Stage 1 — Hard Filter (500 → eligible)\n")
    L.append(f"- Input: **{s1['input']}** SKUs")
    L.append(f"- Passed: **{s1['passed']}**  |  Excluded: **{s1['excluded']}**")
    L.append(f"- Exclusion reasons: "
             + (", ".join(f"{k}={v}" for k, v in s1["by_reason"].items()) or "none"))
    L.append("")

    s2 = pl["stage2_semantic_recall"]
    L.append(f"## Stage 2 — Semantic Recall (eligible → {s2['recalled']} candidates)\n")
    L.append("Top 12 by retrieval score (proxy for pgvector, TABLE 3 weights):\n")
    L.append("| # | product_id | sku | retrieval | cat | aud | brand | port | mkt | comm |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for i, c in enumerate(s2["candidates"][:12]):
        b = c["blocks"]
        L.append(f"| {i+1} | {c['product_id']} | {c['sku']} | {c['retrieval_score']} | "
                 f"{b['category']} | {b['audience']} | {b['brand']} | {b['portfolio']} | "
                 f"{b['market']} | {b['commercial']} |")
    L.append("")

    s3 = pl["stage3_feature_scoring_top20"]
    L.append(f"## Stage 3 — Feature Scoring (80 → {len(s3)} High Match, by Fit)\n")
    L.append("| # | product_id | sku | Fit | Cat | Aud | Brand | Price | Port | Mkt | Final |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for i, c in enumerate(s3):
        sd = c["six_dimension"]
        L.append(f"| {i+1} | {c['product_id']} | {c['sku']} | {c['fit']} | "
                 f"{sd['category_fit']} | {sd['audience_fit']} | {sd['brand_fit']} | "
                 f"{sd['price_fit']} | {sd['portfolio_fit']} | {sd['market_fit']} | "
                 f"{c['final_score']} |")
    L.append("")

    s56 = pl["stage5_6_diversity_curation"]
    L.append("## Stage 4-6 — Opportunity Ranking → Diversity Rerank → Final Curation (20 → 5)\n")
    L.append("| Slot | product_id | sku | Role | Final | Secondary | Price |")
    L.append("|---|---|---|---|---|---|---|")
    for i, c in enumerate(s56):
        L.append(f"| {i+1} | {c['product_id']} | {c['sku']} | {c['slot_role']} | "
                 f"{c['final_score']} | {c['secondary']} | {c['price_level']} |")
    L.append("")

    L.append("## Final 5 Recommendations (PRD schema)\n")
    for r in res["recommendations"]:
        L.append(f"### {r['product_id']} / {r['sku']} — {r['recommendation_type']}\n")
        L.append(f"- **Fit Score:** {r['fit_score']}  **Potential:** {r['potential_score']}  "
                 f"**Product Intelligence:** {r['product_intelligence_score']}  "
                 f"**Final:** {r['final_score']}  **Confidence:** {r['confidence']}")
        sd = r["six_dimension"]
        L.append(f"- **Six-Dimension:** Category {sd['category_fit']} / Audience {sd['audience_fit']} / "
                 f"Brand {sd['brand_fit']} / Price {sd['price_fit']} / Portfolio {sd['portfolio_fit']} / "
                 f"Market {sd['market_fit']}")
        wr = r["why_recommend"]
        L.append(f"- **Client fact:** {wr['client_fact']}")
        L.append(f"- **Product fact:** {wr['product_fact']}")
        L.append(f"- **Business reason:** {wr['business_reason']}")
        L.append(f"- **Evidence:** " + "; ".join(f"[{e['type']}] {e['claim']}" for e in r["evidence"]))
        L.append("")
    return "\n".join(L)


def main():
    catalog, client = load_mock(500)
    cfg = DEFAULT_CONFIG
    res = run_match(catalog, client, cfg)

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)

    report = md_report(res, client)
    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write(report)

    # Console summary
    print("=== Phase 03 Mock Run ===")
    print(f"Catalog: {len(catalog)} SKUs | Client: {client['client_id']}")
    s1 = res["pipeline"]["stage1_hard_filter"]
    print(f"L1 Hard Filter: {s1['input']} -> {s1['passed']} eligible "
          f"(excluded {s1['excluded']}: {s1['by_reason']})")
    s2 = res["pipeline"]["stage2_semantic_recall"]
    print(f"L2 Semantic Recall: {s2['recalled']} candidates")
    print(f"L3 High Match: {len(res['pipeline']['stage3_feature_scoring_top20'])} (top fit="
          f"{res['pipeline']['stage3_feature_scoring_top20'][0]['fit']})")
    print(f"Final 5: {[r['product_id'] for r in res['recommendations']]}")
    print(f"Wrote: {OUT_JSON}")
    print(f"Wrote: {OUT_MD}")


if __name__ == "__main__":
    main()
