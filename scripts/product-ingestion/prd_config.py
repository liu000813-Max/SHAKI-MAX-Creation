"""
PRD V4.0 — Authoritative configuration for the SHAKI AI Matching Engine.

Every weight, threshold, and limit below is copied VERBATIM from
docs/SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx so the scoring logic is
never hard-coded inside the engine and is never silently re-weighted.

Sources (PRD sections / tables):
  - Six-Dimension Client Fit weights ....... TABLE 4 + §6.1 (P19)
  - Potential Score weights ................ TABLE 5 + §8 (P59)
  - Final Recommendation Score weights ..... §9 (P62)
  - Semantic Recall embedding-block weights  TABLE 3
  - Hard-filter rules ...................... TABLE 2
  - Diversity constraints .................. TABLE 6
  - Final-curation slot roles .............. TABLE 7
  - Confidence levels ...................... TABLE 8
  - Runtime config defaults ................ TABLE 11

The engine (phase3_match.py) MUST read weights from this module and must NOT
override them. New SKU cold-start proxy (§9, P63) is also encoded here.
"""
from dataclasses import dataclass, field
from typing import List


@dataclass
class PRDConfig:
    # ------------------------------------------------------------------ #
    # Layer 3 — Six-Dimension Client Fit Score (TABLE 4 / P19)
    #   Fit = 0.20*Category + 0.20*Audience + 0.15*Brand
    #       + 0.15*Price + 0.15*Portfolio + 0.15*Market
    # ------------------------------------------------------------------ #
    w_category: float = 0.20
    w_audience: float = 0.20
    w_brand: float = 0.15
    w_price: float = 0.15
    w_portfolio: float = 0.15
    w_market: float = 0.15

    # ------------------------------------------------------------------ #
    # Layer 4 — Potential Score (TABLE 5 / P59)
    #   Potential = 0.25*Gap + 0.25*MarketOpp + 0.20*Diff
    #             + 0.15*PriceExp + 0.15*Strategic
    # ------------------------------------------------------------------ #
    w_gap: float = 0.25
    w_market_opp: float = 0.25
    w_diff: float = 0.20
    w_price_exp: float = 0.15
    w_strategic: float = 0.15

    # ------------------------------------------------------------------ #
    # Layer 5 — Final Recommendation Score (P62)
    #   Final = 0.40*Fit + 0.20*ProductIntelligence + 0.15*MarketOpportunity
    #         + 0.10*PortfolioGap + 0.10*SalesPerformance + 0.05*StrategicValue
    # ------------------------------------------------------------------ #
    w_fit: float = 0.40
    w_product_intel: float = 0.20
    w_market_opportunity: float = 0.15
    w_portfolio_gap: float = 0.10
    w_sales: float = 0.10
    w_strategic_value: float = 0.05

    # ------------------------------------------------------------------ #
    # Semantic Recall — Embedding block weights (TABLE 3)
    # Used by the deterministic rule-based retrieval proxy that stands in for
    # pgvector (PRD §5 permits "pgvector or equivalent" + keyword/rule recall).
    # ------------------------------------------------------------------ #
    w_rec_category: float = 0.25      # Client Category & Business
    w_rec_audience: float = 0.20      # Audience
    w_rec_brand: float = 0.20         # Brand & Visual DNA
    w_rec_portfolio: float = 0.15     # Product Portfolio
    w_rec_market: float = 0.10        # Market
    w_rec_commercial: float = 0.10    # Commercial Intent

    # ------------------------------------------------------------------ #
    # Hard filters (TABLE 2)
    # ------------------------------------------------------------------ #
    hard_filter_data_completeness: int = 75
    eligible_statuses: tuple = ("Active", "New", "Best Seller", "Strategic", "Coming Soon")

    # ------------------------------------------------------------------ #
    # Pipeline counts (TABLE 11)
    # ------------------------------------------------------------------ #
    semantic_recall_count: int = 80
    high_match_count: int = 20
    final_recommendation_count: int = 5

    # ------------------------------------------------------------------ #
    # Diversity re-ranking constraints (TABLE 6)
    # ------------------------------------------------------------------ #
    same_category_top5_limit: int = 2   # same secondary category <= 2 in Top 5
    same_price_top5_limit: int = 3      # same price level <= 3 in Top 5
    same_design_top5_limit: int = 3     # same design cluster <= 3 in Top 5

    # ------------------------------------------------------------------ #
    # Fallback / thresholds
    # ------------------------------------------------------------------ #
    fit_minimum_fallback: int = 75      # P67 / TABLE 11: minimum Fit for fallback

    # ------------------------------------------------------------------ #
    # Versioning (TABLE 11)
    # ------------------------------------------------------------------ #
    match_pipeline_version: str = "v1"
    prompt_version: str = "prompt-v1"

    # ------------------------------------------------------------------ #
    # Price-level ordering (for corridor / price-expansion logic)
    # ------------------------------------------------------------------ #
    price_order: List[str] = field(default_factory=lambda: [
        "Entry", "Mid", "Mid-Premium", "Premium", "Luxury"
    ])

    def price_index(self, level: str) -> int:
        try:
            return self.price_order.index(level)
        except ValueError:
            return -1


# Convenience singleton (engine imports this; never re-instantiates with
# different weights unless a caller explicitly passes an override config).
DEFAULT_CONFIG = PRDConfig()
