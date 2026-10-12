"""Depth pass: completeness distribution of products.json, phase3 recs, Heydildi SKU prefixes, products.ts images."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    pj = json.loads((ROOT / "data" / "processed" / "products.json").read_text(encoding="utf-8"))
    prods = pj["products"]
    print("products.json meta:", {k: pj[k] for k in ("generated_at", "source", "product_count", "schema_version") if k in pj})
    print("len(products):", len(prods))
    comp = [p.get("data_completeness") or 0 for p in prods]
    print("completeness: min", min(comp), "max", max(comp), "avg", round(sum(comp) / len(comp), 1))
    print("eligible:", sum(1 for p in prods if p.get("recommendation_eligible")))
    print("buckets:", Counter([("0-25" if c < 25 else "25-50" if c < 50 else "50-75" if c < 75 else "75-100") for c in comp]))
    top = sorted(prods, key=lambda p: p.get("data_completeness") or 0, reverse=True)[:3]
    for t in top:
        f = t.get("fields") or {}
        nonnull = {k: v for k, v in f.items() if v not in (None, "", [], {})}
        print(f"\nTOP {t['product_id']} comp={t.get('data_completeness')} nonnull_fields={len(nonnull)}")
        for k in list(nonnull)[:25]:
            print(f"   {k} = {str(nonnull[k])[:90]}")

    print("\n===== phase3_real_result.json =====")
    pr = json.loads((ROOT / "data" / "processed" / "phase3_real_result.json").read_text(encoding="utf-8"))
    print("client_id:", pr.get("client_id"), "| summary:", json.dumps(pr.get("summary"), ensure_ascii=False)[:400])
    print("pipeline:", json.dumps(pr.get("pipeline"), ensure_ascii=False)[:400])
    recs = pr.get("recommendations") or []
    print("rec count:", len(recs))
    for r in recs[:3]:
        print("  rec:", json.dumps({k: r.get(k) for k in list(r)[:12]}, ensure_ascii=False)[:400])

    print("\n===== Heydildi SKU prefixes =====")
    hey = json.loads((ROOT / "apps" / "web" / "lib" / "data" / "heydildi-catalog.json").read_text(encoding="utf-8"))
    pref = Counter()
    for e in hey:
        m = re.match(r"PAS-([A-Z]+)", e["sku"])
        pref[m.group(1) if m else "?"] += 1
    print("prefix counts:", dict(pref))
    print("sample skus:", [e["sku"] for e in hey[:12]])

    print("\n===== products.ts hero_image / category =====")
    ts = (ROOT / "apps" / "web" / "lib" / "data" / "products.ts").read_text(encoding="utf-8")
    for line in ts.splitlines():
        if re.search(r"(product_id|hero_image|primary_category|price_level)\s*:", line):
            print("  ", line.strip()[:120])


if __name__ == "__main__":
    main()
