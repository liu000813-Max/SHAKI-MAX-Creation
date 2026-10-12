"""Inspect data/processed/products.json + phase3 results to see usable real product attributes."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def peek(path: Path, max_items: int = 2) -> None:
    print(f"\n########## {path.relative_to(ROOT)} ##########")
    if not path.exists():
        print("(missing)")
        return
    print("size:", path.stat().st_size, "bytes")
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print("JSON parse error:", e)
        return
    print("type:", type(d).__name__, "len:", len(d) if hasattr(d, "__len__") else "-")
    if isinstance(d, dict):
        print("top keys:", list(d)[:20])
        items = d.get("products") or d.get("items") or d.get("data") or []
    else:
        items = d
    if isinstance(items, list) and items:
        print(f"first {max_items} item(s):")
        for it in items[:max_items]:
            if isinstance(it, dict):
                keys = list(it)
                print("  keys:", keys[:40])
                # show a few high-value fields
                for k in [
                    "product_id", "sku", "product_name_cn", "product_name_en",
                    "primary_category", "price_level", "target_market",
                    "data_completeness", "product_intelligence_score",
                    "recommendation_eligible", "media", "images",
                ]:
                    if k in it:
                        v = it[k]
                        print(f"    {k} = {str(v)[:160]}")


def main() -> None:
    peek(ROOT / "data" / "processed" / "products.json")
    peek(ROOT / "data" / "processed" / "phase3_real_result.json")
    peek(ROOT / "data" / "processed" / "phase3_mock_result.json")


if __name__ == "__main__":
    main()
