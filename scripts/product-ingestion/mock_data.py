"""
Phase 03 — Mock Client + deterministic 500-SKU mock catalog.

Purpose (per user instruction "先用 Mock Client 测试"): validate the matching
engine end-to-end with a fully specified, reproducible dataset BEFORE trusting
it on the real Phase-02 crawl DB (whose structured fields are still sparse).

The mock catalog uses the EXACT enum vocabulary defined in product_master.py
(ProductStatus / PrimaryCategory / SecondaryCategory / PriceLevel / TargetGender
/ DesignStyle / TargetMarket / ProductPosition) so the engine's taxonomy logic
is exercised with real values, not made-up ones.

Generation is seeded -> identical output every run (Acceptance: deterministic).
"""
import random
from product_master import ENUMS, CATEGORY_TAXONOMY

SEED = 20260915
random.seed(SEED)

PRIMARY = ENUMS["PrimaryCategory"]                 # 5 locked categories
SECONDARY = ENUMS["SecondaryCategory"]
PRICE_LEVELS = ENUMS["PriceLevel"]
GENDERS = ENUMS["TargetGender"]
DESIGN_STYLES = ENUMS["DesignStyle"]
MARKETS = ENUMS["TargetMarket"]
PRODUCT_POSITIONS = ENUMS["ProductPosition"]
ELIGIBLE_STATUS = ["Active", "New", "Best Seller", "Strategic", "Coming Soon"]
INELIGIBLE_STATUS = ["Draft", "Discontinued", "Seasonal"]

FUNCTIONAL = ["Vibration", "Suction", "Rotation", "Heating", "App Control",
              "Remote Control", "Wearable", "Dual Motor", "Pulsation", "Pressure"]
SCENARIOS = ["Self Care", "Solo", "Couples", "Bedroom", "Travel", "Gift",
             "Date Night", "Long Distance", "Premium Lifestyle"]
SEGMENTS = ["Beginner", "Advanced", "Premium", "Mass Market", "Wellness"]


def _weighted(pairs):
    """pairs = [(value, weight), ...] -> weighted random choice."""
    vals, weights = zip(*pairs)
    return random.choices(vals, weights=weights, k=1)[0]


def _sample_n(pool, n_min, n_max):
    n = random.randint(n_min, n_max)
    return random.sample(pool, min(n, len(pool)))


# --------------------------------------------------------------------------- #
# Mock Client  — a realistic US/EU premium-wellness distributor
# --------------------------------------------------------------------------- #
def build_mock_client() -> dict:
    return {
        "client_id": "CL-MOCK-001",
        "client_name": "Lush Wellness Co. (mock)",
        "main_categories": ["Female", "Couples"],
        "website": "https://lushwellness.example.com",
        "social": ["https://instagram.com/lushwellness"],
        "target_market": ["US", "EU"],
        "business_type": "Distributor",          # wholesale + OEM/ODM
        "requires_commercial": True,             # needs MOQ / production data
        "brand_style": ["Premium", "Feminine", "Minimal", "Wellness", "Elegant"],
        "audience": {
            "gender": ["Female", "Couples"],
            "age_range": [25, 42],
            "segment": ["Premium", "Wellness", "Mass Market"],
        },
        # client's current assortment (used for Portfolio Fit / Gap)
        "existing_portfolio": ["Vibrators", "Massagers", "Couples Massagers", "Suction"],
        # categories the client clearly LACKS -> high-gap fillers should win
        "portfolio_gaps": ["Wearables", "Couples Wearables", "Lubricants",
                            "Intimate Cleansing", "Smart Devices"],
        # client explicitly does NOT want these
        "explicit_exclusions": ["BDSM"],
        # price corridor: mid = Premium, boundary = Mid-Premium
        "price_corridor": ["Mid-Premium", "Premium"],
    }


# --------------------------------------------------------------------------- #
# Mock catalog — 500 SKUs
# --------------------------------------------------------------------------- #
def _gender_for_primary(primary: str) -> str:
    return {
        "Female": "Female",
        "Male": "Male",
        "Couples": "Couples",
        "BDSM": "Couples",
        "Water-Based": "All Genders",
    }.get(primary, "All Genders")


def _make_product(i: int) -> dict:
    # primary distribution skewed so Female/Couples dominate (client matches)
    primary = _weighted([
        ("Female", 34), ("Couples", 24), ("Male", 20),
        ("Water-Based", 13), ("BDSM", 9),
    ])
    secondary = random.choice(CATEGORY_TAXONOMY[primary])
    status = _weighted([(s, 82 / len(ELIGIBLE_STATUS)) for s in ELIGIBLE_STATUS] +
                       [("Draft", 9), ("Discontinued", 5), ("Seasonal", 4)])

    # ~7% of products get completeness below the 75 hard-filter floor
    if random.random() < 0.07:
        completeness = random.randint(40, 74)
    else:
        completeness = random.randint(76, 99)

    gender = _gender_for_primary(primary)
    price_level = _weighted([("Entry", 8), ("Mid", 22), ("Mid-Premium", 30),
                             ("Premium", 28), ("Luxury", 12)])
    target_market = _sample_n(MARKETS, 1, 3)
    design = _sample_n(DESIGN_STYLES, 1, 3)
    visual = _sample_n(DESIGN_STYLES, 1, 3)
    brand_style = _sample_n(DESIGN_STYLES, 1, 2)

    # compliance vs client markets: mostly verified, some unknown-with-review
    if set(target_market) & {"US", "EU"}:
        if random.random() < 0.80:
            compliance_verified = 1
            needs_review = 0
            market_compliance = "verified"
        else:
            compliance_verified = 0
            needs_review = 1
            market_compliance = "unknown-with-review"
    else:
        compliance_verified = 0
        needs_review = 1
        market_compliance = "unknown-with-review"

    # scores 60-95
    def sc():
        return random.randint(60, 95)

    # 40% are genuinely "new" (no sales) -> cold-start path in Final score
    has_sales = random.random() < 0.60
    sales_amount = random.randint(2000, 90000) if has_sales else 0
    order_count = random.randint(20, 600) if has_sales else 0

    is_gap = secondary in ("Wearables", "Couples Wearables", "Lubricants",
                           "Intimate Cleansing", "Smart Devices")

    return {
        "product_id": f"AUTO-MOCK-{i:04d}",
        "sku": f"SHAKI-MOCK-{i:04d}",
        "product_name_en": f"{primary}-{secondary}-{i:04d}",
        "product_status": status,
        "data_completeness": completeness,
        "primary_category": primary,
        "secondary_category": secondary,
        "functional_category": random.choice(FUNCTIONAL),
        "scenario_category": random.choice(SCENARIOS),
        "target_gender": gender,
        "target_age": random.choice(["20-30", "25-35", "30-45", "35-50", "Unknown"]),
        "target_segment": random.choice(SEGMENTS),
        "design_style": design,
        "visual_style": visual,
        "brand_style": brand_style,
        "brand_level": price_level,
        "price_level": price_level,
        "target_market": target_market,
        "market_compliance": market_compliance,
        "compliance_verified": compliance_verified,
        "needs_review": needs_review,
        "market_demand": sc(),
        "market_trend": sc(),
        "market_opportunity": sc(),
        "differentiation": sc(),
        "functional_diff_score": sc(),
        "brand_value_score": sc(),
        "strategic_value_score": sc(),
        "design_value_score": sc(),
        "product_intelligence_score": sc(),
        "moq": random.choice([50, 100, 200, 300, 500]) if status in ELIGIBLE_STATUS else 0,
        "lead_time": random.choice([15, 20, 30, 45]) if status in ELIGIBLE_STATUS else 0,
        "oem_available": "Yes" if random.random() < 0.7 else "No",
        "odm_available": "Yes" if random.random() < 0.6 else "No",
        "sales_amount": sales_amount,
        "order_count": order_count,
        "product_position": random.choice(PRODUCT_POSITIONS),
        "recommended_product_gap": is_gap,
        "hero_image_url": f"https://mock.shaki.com/img/{i:04d}.jpg",
    }


def build_mock_catalog(n: int = 500) -> list:
    return [_make_product(i) for i in range(1, n + 1)]


def load_mock(n: int = 500):
    return build_mock_catalog(n), build_mock_client()


if __name__ == "__main__":
    cat, cli = load_mock()
    print("catalog size:", len(cat))
    print("client:", cli["client_id"], cli["main_categories"], cli["target_market"])
