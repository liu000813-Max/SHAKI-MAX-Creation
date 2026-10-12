"""
Configuration & environment for the SHAKI product ingestion pipeline.

All secrets / site URLs are read from environment — NEVER hardcoded.
Copy .env.example to .env and fill in.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Project root = repo root (this file lives in scripts/product-ingestion)
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
PRODUCTS_DIR = DATA_DIR / "products"

# Prisma / production DB lives here too (see ../../prisma/schema.prisma)
DEFAULT_SQLITE = PROCESSED_DIR / "shaki_product_intelligence.db"

# Try to load a local .env if present (stdlib only; no python-dotenv dependency)
def _load_dotenv(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)

_load_dotenv(REPO_ROOT / ".env")
_load_dotenv(Path(__file__).resolve().parent / ".env")


@dataclass
class Settings:
    # --- Crawl target (REQUIRED for live mode; omit to run on fixtures) ---
    shaki_website_url: str = field(default_factory=lambda: os.getenv("SHAKI_WEBSITE_URL", "").rstrip("/"))

    # --- Rate limiting / politeness ---
    request_delay: float = field(default_factory=lambda: float(os.getenv("REQUEST_DELAY", "1.5")))
    concurrency: int = field(default_factory=lambda: int(os.getenv("CONCURRENCY", "2")))
    request_timeout: int = field(default_factory=lambda: int(os.getenv("REQUEST_TIMEOUT", "30")))
    max_retries: int = field(default_factory=lambda: int(os.getenv("MAX_RETRIES", "3")))
    user_agent: str = field(default_factory=lambda: os.getenv(
        "USER_AGENT", "SHAKIProductBot/1.0 (+https://shaki.com; product-intel)"))

    # --- Database ---
    # Local dev uses SQLite (zero-install). Production swaps to Postgres via
    # DATABASE_URL + prisma/schema.prisma (see README).
    database_url: str = field(default_factory=lambda: os.getenv(
        "DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE}"))

    # --- AI enrichment ---
    # Provider is OpenAI-compatible. Doubao (豆包) is OpenAI-compatible, so it drops in.
    ai_provider: str = field(default_factory=lambda: os.getenv("AI_PROVIDER", "heuristic"))  # heuristic|openai|doubao
    ai_api_key: str = field(default_factory=lambda: os.getenv("AI_API_KEY", ""))
    ai_base_url: str = field(default_factory=lambda: os.getenv(
        "AI_BASE_URL", "https://api.openai.com/v1"))
    ai_model: str = field(default_factory=lambda: os.getenv("AI_MODEL", "gpt-4o-mini"))
    ai_temperature: float = field(default_factory=lambda: float(os.getenv("AI_TEMPERATURE", "0.2")))

    # --- Thresholds (configurable, not hard-coded — per PRD Table 11) ---
    data_completeness_min: int = field(default_factory=lambda: int(os.getenv("DATA_COMPLETENESS_MIN", "75")))
    hard_filter_data_completeness: int = 75

    def ensure_dirs(self):
        for d in (RAW_DIR, PROCESSED_DIR, PRODUCTS_DIR):
            d.mkdir(parents=True, exist_ok=True)


SETTINGS = Settings()
SETTINGS.ensure_dirs()
