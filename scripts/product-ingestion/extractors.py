"""
Extractor Strategy — convert a product detail page into an ExtractedProduct.

Priority order (per spec section 8 & 9):
  1. JSON-LD (application/ld+json)  -> Product / Offer / AggregateRating / Brand / ImageObject
  2. Meta tags (og:*, product:*, twitter:*, meta description)
  3. Semantic HTML (<title>, <h1>, <img>, spec tables)
  4. CSS-selector / pattern fallback (regex on visible text — never a single hard-coded selector)
  5. Plain text fallback

We do NOT assume a fixed DOM. Each value records which strategy produced it
(`strategy` field) so downstream mapping can weigh provenance.
"""
from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser

from runtime import ExtractedProduct

_JSONLD_RE = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)
_META_RE = re.compile(r'<meta[^>]+(?:property|name)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']*)["\'][^>]*>', re.I)
_IMG_RE = re.compile(r'<img\b[^>]*>', re.I)
_SRC_ALT_RE = re.compile(r'(?:src|data-src)=["\']([^"\']+)["\']', re.I)
_ALT_RE = re.compile(r'alt=["\']([^"\']*)["\']', re.I)
_TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.S | re.I)
_H1_RE = re.compile(r'<h1[^>]*>(.*?)</h1>', re.S | re.I)
_TAG_STRIP = re.compile(r"<[^>]+>")

# Non-content blocks whose inner text must never leak into extracted fields
# (analytics scripts, CSS, hidden templates, HTML comments, etc.)
_BLOCK_RE = re.compile(
    r"<(script|style|noscript|head|svg|template|iframe)[^>]*>.*?</\1>",
    re.S | re.I,
)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)

# Images that are chrome (logo/nav/icon/decoration), not product media.
_LOGO_HINTS = (
    "logo", "favicon", "icon-", "/icon", "banner", "nav-", "navbar",
    "header", "footer", "bg-", "background", "arrow", "placeholder",
    "spinner", "loading", "pixel", "tracking", "1x1",
)


def _is_chrome_image(url: str) -> bool:
    u = (url or "").lower()
    if u.startswith("data:"):
        return True
    return any(h in u for h in _LOGO_HINTS)


def _strip_blocks(html_frag: str) -> str:
    s = _BLOCK_RE.sub(" ", html_frag or "")
    s = _COMMENT_RE.sub(" ", s)
    return s


def _clean(html_frag: str) -> str:
    # 1) drop non-content blocks (script/style/...) so analytics/markup never leaks
    # 2) decode HTML entities first (&lt;p&gt; -> <p>)
    # 3) strip remaining tags
    # 4) drop any trailing malformed/unclosed tag fragment
    s = _strip_blocks(html_frag or "")
    s = html.unescape(s)
    s = _TAG_STRIP.sub(" ", s)
    s = re.sub(r"<[^>]*$", " ", s)
    s = s.replace("&nbsp;", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _parse_jsonld(html: str) -> list[dict]:
    out = []
    for m in _JSONLD_RE.finditer(html):
        blob = m.group(1).strip()
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            # tolerate trailing commas / CDATA
            try:
                data = json.loads(blob.strip().strip(";").strip())
            except Exception:
                continue
        if isinstance(data, list):
            out.extend(data)
        elif isinstance(data, dict):
            if "@graph" in data:
                out.extend(data["@graph"])
            else:
                out.append(data)
    return out


def _find_product_node(nodes: list[dict]) -> dict | None:
    for n in nodes:
        t = (n.get("@type") or "")
        if isinstance(t, str) and t.lower() == "product":
            return n
        if isinstance(t, list) and any(str(x).lower() == "product" for x in t):
            return n
    # fallback: first node with sku/name
    for n in nodes:
        if n.get("sku") or n.get("name") or n.get("model"):
            return n
    return nodes[0] if nodes else None


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _images_from_jsonld(node: dict) -> list[dict]:
    imgs = []
    for img in _as_list(node.get("image")):
        if isinstance(img, str):
            imgs.append({"url": img, "role": "HERO", "original_url": img})
        elif isinstance(img, dict):
            url = img.get("url") or img.get("contentUrl") or ""
            if url:
                imgs.append({"url": url, "role": "HERO", "original_url": url})
    return imgs


def parse_jsonld(html: str) -> tuple[dict, list]:
    nodes = _parse_jsonld(html)
    node = _find_product_node(nodes)
    if not node:
        return {}, nodes
    offers = _as_list(node.get("offers"))
    offer = offers[0] if offers else {}
    brand = node.get("brand")
    brand_name = brand.get("name") if isinstance(brand, dict) else (brand or "")

    agg = node.get("aggregateRating") or {}
    attrs = {}
    for prop in _as_list(node.get("additionalProperty")):
        if isinstance(prop, dict):
            attrs[str(prop.get("name", "")).lower()] = prop.get("value")

    return {
        "name": node.get("name", ""),
        "sku": node.get("sku", "") or node.get("productID", ""),
        "model": node.get("model", ""),
        "description": _clean(node.get("description", "")),
        "category_text": (node.get("category") or ""),
        "price": offer.get("price", "") if isinstance(offer, dict) else "",
        "currency": offer.get("priceCurrency", "") if isinstance(offer, dict) else "",
        "brand": brand_name,
        "rating": agg.get("ratingValue", "") if isinstance(agg, dict) else "",
        "images": _images_from_jsonld(node),
        "attributes": attrs,
        "jsonld_present": True,
    }, nodes


def parse_meta(html: str) -> dict:
    meta = {}
    for m in _META_RE.finditer(html):
        meta[m.group(1).lower()] = m.group(2)
    out = {
        "name": _clean(meta.get("og:title", "") or meta.get("twitter:title", "")),
        "description": _clean(meta.get("description", "") or meta.get("og:description", "")),
        "images": [],
    }
    if meta.get("og:image") and not _is_chrome_image(meta["og:image"]):
        out["images"] = [{"url": meta["og:image"], "role": "HERO", "original_url": meta["og:image"]}]
    for k, v in meta.items():
        if k.startswith("product:"):
            out.setdefault("attributes", {})[k.replace("product:", "")] = _clean(v)
    return out


def _role_for_alt(alt: str, idx: int) -> str:
    a = (alt or "").lower()
    if any(w in a for w in ("hero", "main", "cover")):
        return "HERO"
    if "pack" in a or "box" in a:
        return "PACKAGING"
    if "life" in a or "scene" in a:
        return "LIFESTYLE"
    if "detail" in a:
        return "DETAIL"
    if "size" in a:
        return "SIZE"
    if "feature" in a:
        return "FEATURE"
    if "instruction" in a or "manual" in a:
        return "INSTRUCTION"
    if "side" in a:
        return "SIDE"
    if "front" in a:
        return "FRONT"
    return "HERO" if idx == 0 else "OTHER"


def parse_semantic(html: str) -> dict:
    title_m = _TITLE_RE.search(html)
    h1_m = _H1_RE.search(html)
    name = _clean(h1_m.group(1)) if h1_m else (title_m.group(1) if title_m else "")
    # strip brand prefix from title if " | " or " - "
    if " | " in name:
        name = name.split(" | ")[0].strip()
    imgs = []
    filtered_idx = 0
    for i, im in enumerate(_IMG_RE.finditer(html)):
        tag = im.group(0)
        src_m = _SRC_ALT_RE.search(tag)
        alt_m = _ALT_RE.search(tag)
        if not src_m:
            continue
        url = src_m.group(1)
        # skip logos, favicons, nav icons, data URIs, and other chrome
        if _is_chrome_image(url):
            continue
        imgs.append({"url": url, "role": _role_for_alt(alt_m.group(1) if alt_m else "", filtered_idx),
                     "original_url": url})
        filtered_idx += 1
    return {"name": name, "images": imgs, "title_tag": title_m.group(1) if title_m else ""}


# --- Pattern fallback: regex over visible text (no single hard-coded selector) ---
_ATTR_PATTERNS = {
    "main_material": r"(?:material|材质)[\s:：]*([A-Za-z ]{2,20}?)(?:\b|<|,)",
    "waterproof_rating": r"(?:waterproof|防水)[\s:：]*(IPX\d+|splash[-\s]?resistant|no waterproof)",
    "net_weight": r"(?:weight|净重)[\s:：]*([\d.]+\s?(?:g|kg|oz|lb))",
    "battery_capacity": r"(?:battery|电池)[\s:：]*([\d,]+\s?mAh)",
    "rechargeable": r"(rechargeable|可充电|usb charging)",
}


def parse_text_fallback(html: str) -> dict:
    text = _clean(html)
    text = re.sub(r"\s+", " ", text)
    attrs = {}
    for key, pat in _ATTR_PATTERNS.items():
        m = re.search(pat, text, re.I)
        if not m:
            continue
        # Some patterns (e.g. rechargeable) only assert presence, not a value.
        if m.groups():
            attrs[key] = m.group(1).strip().rstrip(",.;")
        else:
            attrs[key] = m.group(0).strip()
    return {"attributes": attrs, "text": text[:4000]}


class ExtractorStrategy:
    """Runs the 5 strategies in priority order and merges results."""

    def extract(self, html: str, url: str) -> ExtractedProduct:
        p = ExtractedProduct(url=url, text=_clean(html)[:4000])

        jd, _ = parse_jsonld(html)
        meta = parse_meta(html)
        sem = parse_semantic(html)
        fb = parse_text_fallback(html)

        p.jsonld_present = bool(jd.get("jsonld_present"))

        # name: JSON-LD > meta > semantic
        p.name = jd.get("name") or meta.get("name") or sem.get("name", "")
        p.sku = (jd.get("sku") or "").upper()
        p.model = jd.get("model", "")
        p.description = jd.get("description") or meta.get("description", "")
        p.category_text = jd.get("category_text", "")
        p.short_description = ""

        # images: merge, de-dup by url, keep earliest role
        seen = {}
        for src in (jd.get("images", []), meta.get("images", []), sem.get("images", [])):
            for im in src:
                seen.setdefault(im["url"], im)
        p.images = list(seen.values())

        # attributes bag from all strategies
        attrs: dict = {}
        attrs.update(jd.get("attributes", {}))
        attrs.update(meta.get("attributes", {}))
        attrs.update(fb.get("attributes", {}))
        # normalized booleans
        if attrs.get("rechargeable"):
            attrs["rechargeable"] = "Yes" if "recharge" in str(attrs["rechargeable"]).lower() else attrs["rechargeable"]
        p.attributes = attrs

        # decide dominant strategy
        if p.jsonld_present:
            p.strategy = "jsonld"
        elif meta.get("name"):
            p.strategy = "meta"
        elif sem.get("name"):
            p.strategy = "semantic_html"
        else:
            p.strategy = "text_fallback"
        return p
