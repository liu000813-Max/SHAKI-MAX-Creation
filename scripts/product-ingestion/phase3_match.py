"""
Phase 03 — SHAKI AI Matching Engine (Client Intelligence + Product Matching)

Implements the seven-layer pipeline from
docs/SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx, STRICTLY using the
weights / formulas / rules encoded in prd_config.py. Scoring logic is NEVER
modified here — only the mechanical application of PRD rules.

Pipeline (PRD §3 / TABLE 1, reconciled with user's stated flow):
  500 SKU
    -> L1 Hard Filter        (TABLE 2)            -> eligible
    -> L2 Semantic Recall     (TABLE 3, proxy)     -> 80 candidates
    -> L3 Six-Dim Fit         (TABLE 4 + P22-57)   -> scored
    -> (feature) top 20 High Match
    -> L4 Opportunity         (Potential, TABLE 5) -> scored
    -> L5 Final Score         (P62 + P63 cold-start)
    -> L6 Diversity Rerank    (TABLE 6)
    -> L7 Final Curation      (TABLE 7)            -> 5 recommendations
  + Confidence (TABLE 8), Evidence (TABLE 9), Reason (P121-125)

Inputs are plain dicts keyed by product_master snake_case field names, so the
engine runs identically on the Mock catalog or on the real Phase-02 DB (an
adapter maps DB rows to the same dict shape).
"""
from typing import Dict, List, Tuple
from product_master import CATEGORY_TAXONOMY
from prd_config import PRDConfig, DEFAULT_CONFIG

# Client interest maps used by the deterministic retrieval / fit proxies.
CLIENT_FUNCTIONAL_INTEREST = {
    "Vibration", "Suction", "Heating", "App Control", "Remote Control",
    "Wearable", "Dual Motor", "Pulsation", "Pressure",
}
CLIENT_SCENARIOS = {
    "Self Care", "Couples", "Bedroom", "Premium Lifestyle",
    "Date Night", "Long Distance", "Gift", "Solo",
}


def _price_idx(cfg: PRDConfig, level: str) -> int:
    return cfg.price_index(level)


def _parse_age(a) -> Tuple[int, int] or None:
    if not a or a == "Unknown":
        return None
    try:
        lo, hi = a.split("-")
        return int(lo), int(hi)
    except Exception:
        return None


# =========================================================================== #
# LAYER 1 — HARD FILTERS (TABLE 2)
# =========================================================================== #
def hard_filter(catalog: List[dict], client: dict, cfg: PRDConfig = DEFAULT_CONFIG):
    """Return (eligible_list, stages_dict).

    stages_dict carries the per-product exclusion reasons and a summary so the
    deliverable can show exactly WHY each SKU was dropped.
    """
    eligible = []
    excluded_reasons: Dict[str, List[str]] = {}
    summary = {
        "total_in": len(catalog),
        "passed": 0,
        "excluded": 0,
        "by_reason": {},
    }
    client_market = set(client.get("target_market", []))
    exclusions = set(client.get("explicit_exclusions", []))
    requires_commercial = client.get("requires_commercial", False)

    for p in catalog:
        pid = p.get("product_id") or p.get("sku")
        reasons: List[str] = []

        # Rule: Product Status
        if p.get("product_status") not in cfg.eligible_statuses:
            reasons.append(f"status:{p.get('product_status')}")

        # Rule: Data Completeness >= 75
        if int(p.get("data_completeness", 0) or 0) < cfg.hard_filter_data_completeness:
            reasons.append(f"completeness:{p.get('data_completeness')}")

        # Rule: Compliance — into client market must be verified or flagged review
        pmkt = set(p.get("target_market") or [])
        if pmkt & client_market:
            if not (p.get("compliance_verified") == 1 or p.get("needs_review") == 1):
                reasons.append("compliance:unsupported-in-client-market")

        # Rule: Category Conflict / Explicit Exclusion
        if (p.get("primary_category") in exclusions
                or p.get("secondary_category") in exclusions):
            reasons.append(f"exclusion:{p.get('primary_category') or p.get('secondary_category')}")

        # Rule: Commercial Availability (when client requires it)
        if requires_commercial:
            moq = p.get("moq") or 0
            lead = p.get("lead_time") or 0
            if int(moq) <= 0 or int(lead) <= 0:
                reasons.append("commercial:missing-moq/lead-time")

        if reasons:
            excluded_reasons[pid] = reasons
            summary["excluded"] += 1
            for r in reasons:
                key = r.split(":")[0]
                summary["by_reason"][key] = summary["by_reason"].get(key, 0) + 1
        else:
            eligible.append(p)
            summary["passed"] += 1

    return eligible, {"summary": summary, "excluded_reasons": excluded_reasons}


# =========================================================================== #
# LAYER 2 — SEMANTIC RECALL (TABLE 3)  [deterministic rule-based proxy]
# =========================================================================== #
def _rec_category_block(p: dict, client: dict) -> int:
    prim = p.get("primary_category")
    sec = p.get("secondary_category")
    func = p.get("functional_category")
    scen = p.get("scenario_category")
    mains = client.get("main_categories", [])
    if prim in client.get("explicit_exclusions", []):
        return 0
    if prim in mains:
        return 100
    if any(sec in CATEGORY_TAXONOMY.get(m, []) for m in mains):
        return 85
    if func in CLIENT_FUNCTIONAL_INTEREST:
        return 70
    if scen in CLIENT_SCENARIOS:
        return 40
    return 30


def _rec_audience_block(p: dict, client: dict) -> int:
    cg = set(client.get("audience", {}).get("gender", []))
    g = p.get("target_gender")
    if g in cg or g == "All Genders":
        gender = 40
    else:
        gender = 0
    a = _parse_age(p.get("target_age"))
    crange = client.get("audience", {}).get("age_range", [0, 100])
    if a is None:
        age = 20
    elif not (a[1] < crange[0] or a[0] > crange[1]):
        age = 30
    else:
        age = 0
    scene = 30 if p.get("scenario_category") in CLIENT_SCENARIOS else 0
    s = gender + age + scene
    return 100 if s >= 100 else 90 if s >= 90 else 75 if s >= 75 else 50 if s >= 40 else 30


def _rec_brand_block(p: dict, client: dict) -> int:
    cs = set(client.get("brand_style", []))
    if not cs:
        return 60
    ps = set(p.get("design_style", []) + p.get("visual_style", []) + p.get("brand_style", []))
    if not ps:
        return 20
    overlap = len(cs & ps)
    if overlap == 0:
        return 20
    ratio = overlap / len(cs | ps)
    return 100 if ratio >= 0.5 else 90 if ratio >= 0.34 else 75 if ratio > 0 else 50


def _rec_portfolio_block(p: dict, client: dict) -> int:
    sec = p.get("secondary_category")
    prim = p.get("primary_category")
    if sec in client.get("portfolio_gaps", []):
        return 100
    if sec in client.get("existing_portfolio", []):
        return 40
    gap_primaries = {
        mp for mp, subs in CATEGORY_TAXONOMY.items()
        if any(s in client.get("portfolio_gaps", []) for s in subs)
    }
    if prim in gap_primaries:
        return 90
    return 60


def _rec_market_block(p: dict, client: dict) -> int:
    if set(p.get("target_market", [])) & set(client.get("target_market", [])):
        return 100
    return 30


def _rec_commercial_block(p: dict, client: dict) -> int:
    if not client.get("requires_commercial", False):
        return 70
    if (p.get("moq") and int(p.get("moq")) > 0) or p.get("oem_available") == "Yes":
        return 100
    return 50


def semantic_recall(eligible: List[dict], client: dict, cfg: PRDConfig = DEFAULT_CONFIG):
    """Return list of {product, retrieval_score, blocks} sorted desc, capped at
    cfg.semantic_recall_count (Top 80)."""
    scored = []
    for p in eligible:
        blocks = {
            "category": _rec_category_block(p, client),
            "audience": _rec_audience_block(p, client),
            "brand": _rec_brand_block(p, client),
            "portfolio": _rec_portfolio_block(p, client),
            "market": _rec_market_block(p, client),
            "commercial": _rec_commercial_block(p, client),
        }
        score = (
            cfg.w_rec_category * blocks["category"]
            + cfg.w_rec_audience * blocks["audience"]
            + cfg.w_rec_brand * blocks["brand"]
            + cfg.w_rec_portfolio * blocks["portfolio"]
            + cfg.w_rec_market * blocks["market"]
            + cfg.w_rec_commercial * blocks["commercial"]
        )
        scored.append({"product": p, "retrieval_score": round(score, 2), "blocks": blocks})
    scored.sort(key=lambda x: x["retrieval_score"], reverse=True)
    return scored[: cfg.semantic_recall_count]


# =========================================================================== #
# LAYER 3 — SIX-DIMENSION CLIENT FIT (TABLE 4 + P22-57)
# =========================================================================== #
def _cat_fit(p: dict, client: dict) -> int:
    prim, sec, func, scen = (p.get("primary_category"), p.get("secondary_category"),
                             p.get("functional_category"), p.get("scenario_category"))
    mains = client.get("main_categories", [])
    if prim in client.get("explicit_exclusions", []):
        return 0
    if prim in mains:
        return 100
    if any(sec in CATEGORY_TAXONOMY.get(m, []) for m in mains):
        return 85
    if func in CLIENT_FUNCTIONAL_INTEREST:
        return 70
    if scen in CLIENT_SCENARIOS:
        return 40
    return 50  # documented neutral baseline for unmatched (PRD gives 0 only on exclusion)


def _aud_fit(p: dict, client: dict) -> int:
    cg = set(client.get("audience", {}).get("gender", []))
    g = p.get("target_gender")
    gender = 40 if (g in cg or g == "All Genders") else 0
    a = _parse_age(p.get("target_age"))
    crange = client.get("audience", {}).get("age_range", [0, 100])
    if a is None:
        age = 20
    elif not (a[1] < crange[0] or a[0] > crange[1]):
        age = 30
    else:
        age = 0
    scene = 30 if p.get("scenario_category") in CLIENT_SCENARIOS else 0
    s = gender + age + scene
    return 100 if s >= 100 else 90 if s >= 90 else 75 if s >= 75 else 50 if s >= 40 else 50


def _brand_fit(p: dict, client: dict) -> int:
    cs = set(client.get("brand_style", []))
    ps = set(p.get("design_style", []) + p.get("visual_style", []) + p.get("brand_style", []))
    if not cs:
        return 75
    if not ps:
        return 50
    overlap = len(cs & ps)
    if overlap == 0:
        return 50
    ratio = overlap / len(cs | ps)
    level_match = p.get("brand_level") in client.get("price_corridor", [])
    if ratio >= 0.5 and level_match:
        return 100
    if ratio >= 0.34 and level_match:
        return 90
    return 75


def _price_fit(p: dict, client: dict, cfg: PRDConfig) -> int:
    cor = [cfg.price_index(x) for x in client.get("price_corridor", []) if cfg.price_index(x) >= 0]
    pi = cfg.price_index(p.get("price_level"))
    if not cor or pi < 0:
        return 50
    lo, hi = min(cor), max(cor)
    if lo <= pi <= hi:
        return 90
    if pi == lo - 1 or pi == hi + 1:
        return 75
    return 50


def _portfolio_fit(p: dict, client: dict) -> int:
    sec, prim = p.get("secondary_category"), p.get("primary_category")
    if sec in client.get("portfolio_gaps", []):
        return 100
    if sec in client.get("existing_portfolio", []):
        return 50
    gap_primaries = {
        mp for mp, subs in CATEGORY_TAXONOMY.items()
        if any(s in client.get("portfolio_gaps", []) for s in subs)
    }
    if prim in gap_primaries:
        return 90
    return 75


def _market_fit(p: dict, client: dict) -> int:
    if not (set(p.get("target_market", [])) & set(client.get("target_market", []))):
        return 50
    demand = int(p.get("market_demand", 0) or 0)
    comp = p.get("market_compliance")
    if comp == "verified" and demand >= 75:
        return 100
    if comp in ("verified", "unknown-with-review") and demand >= 60:
        return 90
    if demand >= 50:
        return 75
    return 50


def score_six_dim(p: dict, client: dict, cfg: PRDConfig = DEFAULT_CONFIG) -> dict:
    cat = _cat_fit(p, client)
    aud = _aud_fit(p, client)
    brand = _brand_fit(p, client)
    price = _price_fit(p, client, cfg)
    port = _portfolio_fit(p, client)
    mkt = _market_fit(p, client)
    raw = (cfg.w_category * cat + cfg.w_audience * aud + cfg.w_brand * brand
           + cfg.w_price * price + cfg.w_portfolio * port + cfg.w_market * mkt)
    return {
        "category_fit": cat, "audience_fit": aud, "brand_fit": brand,
        "price_fit": price, "portfolio_fit": port, "market_fit": mkt,
        "fit_raw": round(raw, 4), "fit": round(raw),
    }


# =========================================================================== #
# LAYER 4 — POTENTIAL SCORE (TABLE 5 / P59)
# =========================================================================== #
def score_potential(p: dict, client: dict, portfolio_fit: int, cfg: PRDConfig = DEFAULT_CONFIG) -> dict:
    gap = portfolio_fit                       # Portfolio Fit already encodes gap fill
    market_opp = int(p.get("market_opportunity", 0) or 0)
    diff = int(p.get("differentiation", 0) or 0)
    # Price Expansion: can it open a higher price tier than client's corridor?
    cor = [cfg.price_index(x) for x in client.get("price_corridor", []) if cfg.price_index(x) >= 0]
    pi = cfg.price_index(p.get("price_level"))
    if cor and pi >= 0:
        cmax = max(cor)
        if pi > cmax:
            price_exp = 95
        elif pi == cmax:
            price_exp = 75
        elif pi >= cmax - 1:
            price_exp = 65
        else:
            price_exp = 55
    else:
        price_exp = 60
    strat = int(p.get("strategic_value_score", 0) or 0)
    if p.get("product_position") in ("Strategic Product", "Innovation", "New"):
        strat = min(100, strat + 10)
    raw = (cfg.w_gap * gap + cfg.w_market_opp * market_opp + cfg.w_diff * diff
           + cfg.w_price_exp * price_exp + cfg.w_strategic * strat)
    return {
        "gap": gap, "market_opportunity": market_opp, "differentiation": diff,
        "price_expansion": price_exp, "strategic": strat,
        "potential_raw": round(raw, 4), "potential": round(raw),
    }


# =========================================================================== #
# LAYER 5 — FINAL RECOMMENDATION SCORE (P62 + P63 cold-start)
# =========================================================================== #
def score_final(p: dict, six: dict, pot: dict, cfg: PRDConfig = DEFAULT_CONFIG) -> dict:
    product_intel = int(p.get("product_intelligence_score", 0) or 0)
    market_opportunity = pot["market_opportunity"]
    portfolio_gap = pot["gap"]
    strategic_value = int(p.get("strategic_value_score", 0) or 0)

    order_count = int(p.get("order_count", 0) or 0)
    sales_amount = int(p.get("sales_amount", 0) or 0)
    if order_count > 0 or sales_amount > 0:
        sales_perf = min(100, round(order_count / 6))   # do NOT penalize; real sales
        cold_start = False
    else:
        # P63 cold-start proxy: Design + Differentiation + Market Opp + Brand Value
        design = int(p.get("design_value_score", 0) or 0)
        diff = int(p.get("functional_diff_score", 0) or 0)
        mopp = market_opportunity
        bval = int(p.get("brand_value_score", 0) or 0)
        sales_perf = round(0.25 * design + 0.25 * diff + 0.25 * mopp + 0.25 * bval)
        cold_start = True

    raw = (cfg.w_fit * six["fit"] + cfg.w_product_intel * product_intel
           + cfg.w_market_opportunity * market_opportunity + cfg.w_portfolio_gap * portfolio_gap
           + cfg.w_sales * sales_perf + cfg.w_strategic_value * strategic_value)
    return {
        "product_intelligence_score": product_intel,
        "sales_performance": sales_perf, "cold_start": cold_start,
        "final_raw": round(raw, 4), "final_score": round(raw),
    }


# =========================================================================== #
# CONFIDENCE (TABLE 8) + EVIDENCE (TABLE 9) + REASON (P121-125)
# =========================================================================== #
def confidence_level(p: dict, client: dict) -> str:
    comp = int(p.get("data_completeness", 0) or 0)
    if comp >= 85 and p.get("compliance_verified") == 1:
        return "High"
    if comp >= 75:
        return "Medium"
    return "Low"


def build_evidence(p: dict, client: dict) -> List[dict]:
    ev = []
    # priority: Client Website -> Client Product Portfolio -> Social -> Market -> Product Master
    ev.append({"type": "client_website",
                "claim": f"Client {client.get('client_name')} positions as "
                         f"{'/'.join(client.get('brand_style', []))} {client.get('business_type')} "
                         f"in {', '.join(client.get('target_market', []))}."})
    gaps = client.get("portfolio_gaps", [])
    if p.get("secondary_category") in gaps:
        ev.append({"type": "client_product_portfolio",
                    "claim": f"Client's assortment lacks {p.get('secondary_category')}; "
                             f"this SKU fills a stated portfolio gap."})
    if client.get("social"):
        ev.append({"type": "social",
                    "claim": f"Client social ({client.get('social')[0]}) themes align with "
                             f"{p.get('scenario_category')} usage."})
    ev.append({"type": "product_master",
                "claim": f"SKU {p.get('sku')}: {p.get('primary_category')}/{p.get('secondary_category')}, "
                         f"{p.get('price_level')} tier, OEM={p.get('oem_available')}, "
                         f"intel={p.get('product_intelligence_score')}."})
    if p.get("market_opportunity"):
        ev.append({"type": "market_research",
                    "claim": f"Market opportunity score {p.get('market_opportunity')} in "
                             f"{', '.join(p.get('target_market', []))}."})
    return ev[:4]  # keep it tight, at least 2 types present


def build_reason(p: dict, client: dict, six: dict, pot: dict) -> dict:
    client_fact = (f"Client focuses on {', '.join(client.get('main_categories', []))} in "
                   f"{', '.join(client.get('target_market', []))} with "
                   f"{'/'.join(client.get('brand_style', []))} positioning.")
    product_fact = (f"{p.get('product_name_en')} is a {p.get('price_level')} "
                    f"{p.get('primary_category')}/{p.get('secondary_category')} SKU "
                    f"(Fit {six['fit']}, Potential {pot['potential']}).")
    biz = []
    if p.get("secondary_category") in client.get("portfolio_gaps", []):
        biz.append(f"fills client's stated gap in {p.get('secondary_category')}")
    if p.get("oem_available") == "Yes":
        biz.append("OEM/ODM ready for distributor private label")
    if six["brand_fit"] >= 90:
        biz.append("brand DNA strongly matches client visual style")
    business_reason = "; ".join(biz) if biz else "complementary addition to client assortment"
    return {"client_fact": client_fact, "product_fact": product_fact,
            "business_reason": business_reason}


# =========================================================================== #
# LAYER 6/7 — DIVERSITY RERANK (TABLE 6) + FINAL CURATION (TABLE 7)
# =========================================================================== #
def _design_cluster(p: dict) -> str:
    vs = p.get("visual_style") or p.get("design_style") or []
    return "/".join(sorted(vs)) if vs else "unknown"


def curate_top5(ranked20: List[dict], client: dict, cfg: PRDConfig = DEFAULT_CONFIG) -> List[dict]:
    """ranked20 = list of enriched product dicts sorted by final_score desc.
    Assign TABLE 7 slot roles, enforce TABLE 6 diversity caps."""
    pool = list(ranked20)
    selected: List[dict] = []
    used_ids = set()

    def take(pred, role, min_fit=0):
        for cand in pool:
            if cand["product_id"] in used_ids:
                continue
            if pred(cand) and cand["six"]["fit"] >= min_fit:
                cand["slot_role"] = role
                selected.append(cand)
                used_ids.add(cand["product_id"])
                return cand
        # fallback (P67): highest final satisfying min fit
        for cand in pool:
            if cand["product_id"] not in used_ids and cand["six"]["fit"] >= max(min_fit, cfg.fit_minimum_fallback):
                cand["slot_role"] = role + " (fallback)"
                selected.append(cand)
                used_ids.add(cand["product_id"])
                return cand
        return None

    # Slot 01 / 02 — Best Match (highest final, confidence High / non-dup)
    take(lambda c: c["confidence"] == "High", "Best Match")
    take(lambda c: True, "Best Match")

    # Slot 03 — Growth Opportunity: highest potential, fit>=80
    take(lambda c: c["pot"]["potential"] == max(x["pot"]["potential"] for x in pool),
         "Growth Opportunity", min_fit=80) if any(c["six"]["fit"] >= 80 for c in pool) else \
        take(lambda c: True, "Growth Opportunity", min_fit=80)

    # Slot 04 — Product Line Expansion: best portfolio gap, fit>=75
    take(lambda c: c["pot"]["gap"] == max(x["pot"]["gap"] for x in pool),
         "Product Line Expansion", min_fit=75)

    # Slot 05 — Strategic Product: strategic/new/innovation, fit>=75
    take(lambda c: c["p"].get("product_position") in ("Strategic Product", "Innovation", "New"),
         "Strategic Product", min_fit=75)

    # ---- Diversity enforcement (TABLE 6) ----
    def counts(key_fn):
        from collections import Counter
        return Counter(key_fn(c["p"]) for c in selected)

    # Cap same secondary category at 2
    sec_counts = counts(lambda p: p.get("secondary_category"))
    while sec_counts and max(sec_counts.values()) > cfg.same_category_top5_limit:
        victim = next(c for c in selected if sec_counts[c["p"].get("secondary_category")] > cfg.same_category_top5_limit)
        selected.remove(victim)
        used_ids.discard(victim["product_id"])
        # replace with next-best eligible by final score
        for cand in pool:
            if cand["product_id"] not in used_ids:
                cand["slot_role"] = "Diversity Swap"
                selected.append(cand)
                used_ids.add(cand["product_id"])
                break
        sec_counts = counts(lambda p: p.get("secondary_category"))

    # Cap same price level at 3 and same design cluster at 3 (swap if needed)
    for cap, keyfn, label in [
        (cfg.same_price_top5_limit, lambda p: p.get("price_level"), "price"),
        (cfg.same_design_top5_limit, _design_cluster, "design"),
    ]:
        ctr = counts(keyfn)
        while ctr and max(ctr.values()) > cap:
            victim = next(c for c in selected if ctr[keyfn(c["p"])] > cap)
            selected.remove(victim)
            used_ids.discard(victim["product_id"])
            for cand in pool:
                if cand["product_id"] not in used_ids:
                    cand["slot_role"] = "Diversity Swap"
                    selected.append(cand)
                    used_ids.add(cand["product_id"])
                    break
            ctr = counts(keyfn)

    # Cross-sell inclusion: if client has gap, ensure >=1 gap filler (slot04 covers;
    # if still missing, force one)
    if client.get("portfolio_gaps"):
        if not any(c["p"].get("secondary_category") in client["portfolio_gaps"] for c in selected):
            for cand in pool:
                if (cand["product_id"] not in used_ids
                        and cand["p"].get("secondary_category") in client["portfolio_gaps"]):
                    cand["slot_role"] = "Gap Fill (forced)"
                    selected.append(cand)
                    used_ids.add(cand["product_id"])
                    break

    return selected[: cfg.final_recommendation_count]


# =========================================================================== #
# ORCHESTRATION
# =========================================================================== #
def run_match(catalog: List[dict], client: dict, cfg: PRDConfig = DEFAULT_CONFIG) -> dict:
    # L1
    eligible, hf = hard_filter(catalog, client, cfg)
    # L2
    recalled = semantic_recall(eligible, client, cfg)
    candidates = [r["product"] for r in recalled]
    # L3 + L4 + L5 on candidates
    enriched = []
    for r in recalled:
        p = r["product"]
        six = score_six_dim(p, client, cfg)
        pot = score_potential(p, client, six["portfolio_fit"], cfg)
        fin = score_final(p, six, pot, cfg)
        enriched.append({
            "product_id": p.get("product_id"), "sku": p.get("sku"),
            "p": p, "six": six, "pot": pot, "fin": fin,
            "retrieval_score": r["retrieval_score"], "blocks": r["blocks"],
            "confidence": confidence_level(p, client),
        })
    # 80 -> 20 High Match (sort by Fit desc)
    by_fit = sorted(enriched, key=lambda x: x["six"]["fit"], reverse=True)
    high20 = by_fit[: cfg.high_match_count]
    # Opportunity ranking (20 -> by Final desc)
    by_final = sorted(enriched, key=lambda x: x["fin"]["final_score"], reverse=True)
    # L6/L7 Final 5
    final5 = curate_top5(by_final, client, cfg)

    # Build PRD-schema recommendations
    recommendations = []
    for c in final5:
        p = c["p"]
        recommendations.append({
            "product_id": c["product_id"],
            "sku": c["sku"],
            "recommendation_type": c.get("slot_role", "Curated"),
            "fit_score": c["six"]["fit"],
            "potential_score": c["pot"]["potential"],
            "product_intelligence_score": c["fin"]["product_intelligence_score"],
            "final_score": c["fin"]["final_score"],
            "confidence": c["confidence"],
            "six_dimension": {
                "category_fit": c["six"]["category_fit"],
                "audience_fit": c["six"]["audience_fit"],
                "brand_fit": c["six"]["brand_fit"],
                "price_fit": c["six"]["price_fit"],
                "portfolio_fit": c["six"]["portfolio_fit"],
                "market_fit": c["six"]["market_fit"],
            },
            "why_recommend": build_reason(p, client, c["six"], c["pot"]),
            "evidence": build_evidence(p, client),
            "related_products": {"cross_sell": [], "upsell": [], "alternative": []},
        })

    result = {
        "client_id": client.get("client_id"),
        "analysis_version": "match-v1",
        "summary": {
            "positioning": "/".join(client.get("brand_style", [])) + " "
                          + client.get("business_type", ""),
            "market": client.get("target_market", []),
            "confidence": recommendations[0]["confidence"] if recommendations else "Low",
        },
        # ---- Intermediate stages (deliverable detail) ----
        "pipeline": {
            "stage1_hard_filter": {
                "input": hf["summary"]["total_in"],
                "passed": hf["summary"]["passed"],
                "excluded": hf["summary"]["excluded"],
                "by_reason": hf["summary"]["by_reason"],
                "excluded_examples": dict(list(hf["excluded_reasons"].items())[:15]),
            },
            "stage2_semantic_recall": {
                "recalled": len(recalled),
                "candidates": [
                    {"product_id": r["product"]["product_id"], "sku": r["product"]["sku"],
                     "retrieval_score": r["retrieval_score"], "blocks": r["blocks"]}
                    for r in recalled
                ],
            },
            "stage3_feature_scoring_top20": [
                {"product_id": c["product_id"], "sku": c["sku"], "fit": c["six"]["fit"],
                 "six_dimension": c["six"], "final_score": c["fin"]["final_score"]}
                for c in high20
            ],
            "stage4_opportunity_ranked20": [
                {"product_id": c["product_id"], "sku": c["sku"],
                 "final_score": c["fin"]["final_score"], "potential": c["pot"]["potential"],
                 "fit": c["six"]["fit"]}
                for c in by_final[: cfg.high_match_count]
            ],
            "stage5_6_diversity_curation": [
                {"product_id": c["product_id"], "sku": c["sku"],
                 "slot_role": c.get("slot_role"), "final_score": c["fin"]["final_score"],
                 "secondary": c["p"].get("secondary_category"),
                 "price_level": c["p"].get("price_level")}
                for c in final5
            ],
        },
        "recommendations": recommendations,
    }
    return result


# DB adapter (future real-data runs): map a sqlite row -> engine dict.
def catalog_from_db(db_path: str, limit: int = 500) -> List[dict]:
    import sqlite3
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT * FROM products ORDER BY product_id LIMIT ?", (limit,)
    ).fetchall()
    # multi-value fields the engine concatenates with '+'; must always be lists
    LIST_FIELDS = (
        "design_style", "visual_style", "brand_style", "target_market",
        "category_tags", "function_tags", "audience_tags", "style_tags",
        "scenario_tags", "market_tags", "price_tags", "positioning_tags",
        "recommended_market", "recommended_category", "target_segment",
    )
    # single-value fields the engine treats as scalars (take first if stored as list)
    SCALAR_FIELDS = ("functional_category", "scenario_category")
    out = []
    for r in rows:
        d = dict(r)
        for k in LIST_FIELDS:
            v = d.get(k)
            if v is None or v == "":
                d[k] = []
            elif isinstance(v, str):
                if v.startswith("["):
                    try:
                        d[k] = json.loads(v)
                    except Exception:
                        d[k] = [v]
                else:
                    d[k] = [v]
            # else: already a list (sqlite3.Row may return list for JSON1) — leave
        for k in SCALAR_FIELDS:
            v = d.get(k)
            if isinstance(v, list):
                d[k] = v[0] if v else None
            elif isinstance(v, str) and v.startswith("["):
                try:
                    lst = json.loads(v)
                    d[k] = lst[0] if lst else None
                except Exception:
                    pass
        out.append(d)
    con.close()
    return out
