"""
Raw storage — keep the ORIGINAL fetched page so any field error is reproducible.

Per spec section 7 & 17: raw HTML/text/JSON-LD/images are preserved separately
from the normalized Product Master row (never stuffed into `products`).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from config import RAW_DIR
from runtime import RawRecord
from crawler import canonicalize

import re

_SLUG_RE = re.compile(r"[^A-Za-z0-9]+")


def _slug_for(url: str) -> str:
    c = canonicalize(url)
    h = hashlib.sha256(c.encode("utf-8")).hexdigest()[:12]
    # human-readable prefix from path
    path = re.sub(_SLUG_RE, "_", c.split("?")[0])[:80].strip("_")
    return f"{path}__{h}"


def save_raw(record: RawRecord) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{_slug_for(record.source_url)}.json"
    payload = {
        "source_url": record.source_url,
        "scraped_at": record.scraped_at,
        "raw_html": record.raw_html,
        "raw_text": record.raw_text,
        "raw_json_ld": record.raw_json_ld,
        "raw_images": record.raw_images,
        "status_code": record.status_code,
        "error": record.error,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_raw(url: str) -> dict | None:
    path = RAW_DIR / f"{_slug_for(url)}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def list_raw() -> list[Path]:
    return sorted(RAW_DIR.glob("*.json"))
