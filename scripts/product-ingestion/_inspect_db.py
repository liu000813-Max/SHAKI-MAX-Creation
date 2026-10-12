"""Inspect real Phase-02 DB: required-field fill rates + matching-field fill rates.
Run: python _inspect_db.py  (from scripts/product-ingestion) or absolute path.
"""
import sqlite3, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import product_master as pm  # noqa: E402

DB = os.path.join(HERE, "..", "..", "data", "processed", "phase2_shaki_product_intelligence.db")
DB = os.path.abspath(DB)
print("DB:", DB, "exists:", os.path.exists(DB))

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

cols = [r[1] for r in conn.execute("PRAGMA table_info(products)")]
total = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
print("products columns:", len(cols), "| has primary_category:", "primary_category" in cols)
print("total products:", total)
print("=" * 78)

def fill_rate(fid):
    if fid not in cols:
        return None
    c = conn.execute(f'SELECT COUNT(*) FROM products WHERE "{fid}" IS NOT NULL AND "{fid}" != ""').fetchone()[0]
    return c, round(100 * c / total)

# --- REQUIRED fields (drive data_completeness) ---
REQ = pm.REQUIRED_FIELD_IDS
print(f"\n### REQUIRED_FIELD_IDS ({len(REQ)}) -- completeness denominator")
print(f"{'field_id':32}{'ai_fill':7}{'source':24}{'filled':>7}{'rate%':>7}")
req_filled_avg = []
for fid in REQ:
    f = pm.FIELD_BY_ID[fid]
    r = fill_rate(fid)
    if r is None:
        print(f"{fid:32}{str(f['ai_fillable'])[:5]:7}{f['source'][:24]:24}{'N/A':>7}{'N/A':>7}")
        continue
    c, rate = r
    req_filled_avg.append((fid, c, f))
    print(f"{fid:32}{str(f['ai_fillable'])[:5]:7}{f['source'][:24]:24}{c:>7}{rate:>7}")

# --- MATCHING-RELEVANT structured fields (may not be required) ---
print("\n### MATCHING-RELEVANT structured fields")
MATCH = ["primary_category", "secondary_category", "target_gender", "price_level",
         "target_market", "differentiation", "positioning_tags", "brand_value_score",
         "market_adaptability_score", "category_fit", "audience_fit", "price_fit",
         "portfolio_fit", "market_fit", "commercial_potential_score", "product_quality_score"]
for fid in MATCH:
    r = fill_rate(fid)
    if r is None:
        print(f"  {fid:32} (no column)")
    else:
        c, rate = r
        f = pm.FIELD_BY_ID.get(fid, {})
        print(f"  {fid:32} filled={c:>6} rate={rate:>4}%  ai_fill={f.get('ai_fillable')}")

# --- current data_completeness distribution ---
print("\n### current data_completeness distribution (as stored)")
rows = conn.execute("SELECT data_completeness, COUNT(*) c FROM products GROUP BY data_completeness ORDER BY data_completeness").fetchall()
for r in rows:
    print(f"  {r['data_completeness']:>4}% : {r['c']:>5} products")
elig = conn.execute("SELECT COUNT(*) FROM products WHERE data_completeness>=75").fetchone()[0]
print(f"  >=75% completeness: {elig} / {total}")
compi = conn.execute("SELECT COUNT(*) FROM products WHERE compliance_verified=1").fetchone()[0]
print(f"  compliance_verified=1: {compi}")
elig2 = conn.execute("SELECT COUNT(*) FROM products WHERE data_completeness>=75 AND compliance_verified=1").fetchone()[0]
print(f"  eligible (comp>=75 AND compliance): {elig2}")
conn.close()
