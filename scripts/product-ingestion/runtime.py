"""
Runtime data containers used across the ingestion pipeline.
(Separate from product_master.py, which is the static Product Master schema.)
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class DiscoveredURL:
    url: str
    source: str            # sitemap | collection | product_detail | category
    discovered_at: str = field(default_factory=_now)
    page_type: str = "product"


@dataclass
class RawRecord:
    source_url: str
    scraped_at: str = field(default_factory=_now)
    raw_html: str = ""
    raw_text: str = ""
    raw_json_ld: list = field(default_factory=list)
    raw_images: list = field(default_factory=list)
    status_code: int = 0
    error: str = ""


@dataclass
class ExtractedProduct:
    url: str
    # basic
    name: str = ""
    sku: str = ""
    model: str = ""
    description: str = ""
    short_description: str = ""
    category_text: str = ""
    subcategory_text: str = ""
    # images: list of {url, role, original_url}
    images: list = field(default_factory=list)
    # attributes bag (raw strings/values as found on page)
    attributes: dict = field(default_factory=dict)
    # which extraction strategy produced the core data
    strategy: str = ""
    jsonld_present: bool = False
    # raw extracted text (fallback)
    text: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FieldValue:
    """A single mapped Product Master field with provenance."""
    value: Any
    source_type: str          # official | catalog | sales_input | ai_inference | manual
    source_reference: str     # where it came from (url, jsonld, meta, ai, manual)
    confidence: float = 1.0   # 0..1
    last_verified: str = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)
