"""
Database layer — Product Intelligence store.

Local dev uses SQLite (zero-install). Tables mirror the spec section 16/17:
  products, product_sources, product_media, product_tags, product_scores,
  product_relations, product_import_jobs, product_import_errors
plus products_history (version retention, spec section 22).

Raw content lives ONLY in product_sources — never stuffed into `products`.
Column set for `products` is generated from product_master.FIELD_ORDER so it
stays in lock-step with the Product Master (228 fields, same order as the xlsx).

A Prisma/Postgres production schema is provided at ../../prisma/schema.prisma.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from product_master import FIELD_ORDER, FIELD_BY_ID
from config import SETTINGS
from crawler import canonicalize
from validation import ProductRecord

COLUMNS = FIELD_ORDER  # dynamic, in Product_Master order

# DB-managed meta columns that are also present in the 228-field dictionary.
# They are declared explicitly in CREATE TABLE (with proper typing / PK), so we
# must NOT emit them again as dynamic TEXT columns.
META_NAMES = {
    "product_id", "sku", "canonical_url", "content_hash", "product_version",
    "provenance", "data_completeness", "recommendation_eligible",
    "needs_review", "compliance_verified", "created_at", "updated_at",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _val(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return v


def _content_hash(html: str) -> str:
    return hashlib.sha256((html or "").encode("utf-8")).hexdigest()


class Db:
    def __init__(self, url: str | None = None):
        u = url or SETTINGS.database_url
        if u.startswith("sqlite:///"):
            path = u[len("sqlite:///"):]
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            self.conn = sqlite3.connect(path)
        else:
            # Postgres URL passed but we run SQLite locally; for true Postgres use Prisma.
            raise RuntimeError("This SQLite backend only handles sqlite:/// URLs. "
                               "For Postgres, use prisma/schema.prisma + Prisma client.")
        self.conn.row_factory = sqlite3.Row
        self.init()

    # ---- schema ----
    def init(self):
        c = self.conn
        cols = ", ".join(f'"{cid}" TEXT' for cid in COLUMNS if cid not in META_NAMES)
        c.executescript(f"""
        CREATE TABLE IF NOT EXISTS products (
            product_id TEXT PRIMARY KEY,
            sku TEXT,
            canonical_url TEXT,
            content_hash TEXT,
            product_version INTEGER DEFAULT 1,
            {cols},
            provenance TEXT,
            data_completeness INTEGER,
            recommendation_eligible INTEGER,
            needs_review INTEGER,
            compliance_verified INTEGER,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS products_history (
            history_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, product_version INTEGER,
            fields_json TEXT, provenance_json TEXT, saved_at TEXT
        );
        CREATE TABLE IF NOT EXISTS product_sources (
            product_source_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, source_url TEXT, source_type TEXT,
            raw_content TEXT, scraped_at TEXT, content_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS product_media (
            media_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, url TEXT, role TEXT, original_url TEXT,
            width INTEGER, height INTEGER, mime_type TEXT, file_size INTEGER,
            ai_classified_role TEXT, fetched INTEGER DEFAULT 0,
            local_path TEXT
        );
        CREATE TABLE IF NOT EXISTS product_tags (
            tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, tag_group TEXT, tag_value TEXT,
            source_type TEXT, confidence REAL
        );
        CREATE TABLE IF NOT EXISTS product_scores (
            score_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, score_name TEXT, value REAL,
            source_type TEXT, computed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS product_relations (
            relation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT, related_product_id TEXT,
            relation_type TEXT, source_type TEXT
        );
        CREATE TABLE IF NOT EXISTS product_import_jobs (
            job_id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT, end_time TEXT, source_url TEXT,
            products_discovered INTEGER, products_created INTEGER,
            products_updated INTEGER, products_skipped INTEGER,
            products_failed INTEGER, errors TEXT
        );
        CREATE TABLE IF NOT EXISTS product_import_errors (
            error_id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER, url TEXT, error_type TEXT,
            error_message TEXT, retry_count INTEGER
        );
        """)
        # add local_path column to pre-existing DBs (safe / idempotent)
        try:
            self.conn.execute("ALTER TABLE product_media ADD COLUMN local_path TEXT")
        except sqlite3.OperationalError:
            pass
        self.conn.commit()

    # ---- raw source ----
    def add_source(self, product_id: str, url: str, raw_html: str, source_type="official"):
        cur = self.conn.execute(
            "INSERT INTO product_sources (product_id, source_url, source_type, raw_content, scraped_at, content_hash) "
            "VALUES (?,?,?,?,?,?)",
            (product_id, url, source_type, raw_html, _now(), _content_hash(raw_html)))
        self.conn.commit()
        return cur.lastrowid

    # ---- upsert product (with version retention) ----
    def upsert_product(self, rec: ProductRecord, canonical: str, content_hash: str):
        cur = self.conn.execute("SELECT * FROM products WHERE product_id=?", (rec.product_id,))
        existing = cur.fetchone()
        changed = True
        if not existing:
            new_version = 1
        elif existing["content_hash"] != content_hash:
            # retain old version (spec section 22)
            old_version = existing["product_version"] or 1
            old_fields = {k: existing[k] for k in COLUMNS if k in existing.keys()}
            old_prov = existing["provenance"]
            self.conn.execute(
                "INSERT INTO products_history (product_id, product_version, fields_json, provenance_json, saved_at) "
                "VALUES (?,?,?,?,?)",
                (rec.product_id, old_version, json.dumps(old_fields, ensure_ascii=False), old_prov, _now()))
            new_version = old_version + 1
        else:
            # identical content -> no new version (dedup, Test 04)
            new_version = existing["product_version"] or 1
            changed = False

        row = {cid: _val(rec.fields.get(cid)) for cid in COLUMNS}
        row.update({
            "product_id": rec.product_id, "sku": rec.sku, "canonical_url": canonical,
            "content_hash": content_hash, "product_version": new_version,
            "provenance": json.dumps(rec.provenance, ensure_ascii=False),
            "data_completeness": rec.data_completeness,
            "recommendation_eligible": int(rec.recommendation_eligible),
            "needs_review": int(rec.needs_review),
            "compliance_verified": int(rec.compliance_verified),
            "updated_at": _now(),
        })
        if existing:
            sets = ", ".join(f'"{k}"=?' for k in row)
            self.conn.execute(f"UPDATE products SET {sets} WHERE product_id=?",
                              tuple(row.values()) + (rec.product_id,))
        else:
            row["created_at"] = _now()
            keys = ", ".join(f'"{k}"' for k in row)
            ph = ", ".join("?" for _ in row)
            self.conn.execute(f"INSERT INTO products ({keys}) VALUES ({ph})", tuple(row.values()))
        self.conn.commit()
        return new_version, changed

    # ---- media / tags / scores ----
    def set_media(self, product_id: str, media: list[dict]):
        self.conn.execute("DELETE FROM product_media WHERE product_id=?", (product_id,))
        for m in media:
            self.conn.execute(
                "INSERT INTO product_media "
                "(product_id, url, role, original_url, width, height, mime_type, "
                " file_size, ai_classified_role, fetched, local_path) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (product_id, m.get("url"), m.get("role"), m.get("original_url"),
                 m.get("width"), m.get("height"), m.get("mime_type"),
                 m.get("file_size"), m.get("ai_classified_role"),
                 int(m.get("fetched") or 0), m.get("local_path")))
        self.conn.commit()

    def set_tags(self, product_id: str, fields: dict, provenance: dict):
        self.conn.execute("DELETE FROM product_tags WHERE product_id=?", (product_id,))
        for fid, val in fields.items():
            f = FIELD_BY_ID.get(fid)
            if not f or not f["id"].endswith("_tags"):
                continue
            group = fid
            vals = val if isinstance(val, list) else [val]
            prov = provenance.get(fid, {})
            for v in vals:
                self.conn.execute(
                    "INSERT INTO product_tags (product_id, tag_group, tag_value, source_type, confidence) "
                    "VALUES (?,?,?,?,?)",
                    (product_id, group, v, prov.get("source_type", "ai_inference"),
                     prov.get("confidence", 0.5)))
        self.conn.commit()

    def set_scores(self, product_id: str, fields: dict, provenance: dict):
        self.conn.execute("DELETE FROM product_scores WHERE product_id=?", (product_id,))
        score_fids = [k for k in fields if k.endswith("_score") or k in
                      ("data_completeness", "product_priority_score")]
        for fid in score_fids:
            v = fields.get(fid)
            if isinstance(v, (int, float)):
                prov = provenance.get(fid, {})
                self.conn.execute(
                    "INSERT INTO product_scores (product_id, score_name, value, source_type, computed_at) "
                    "VALUES (?,?,?,?,?)",
                    (product_id, fid, v, prov.get("source_type", "system"), _now()))
        self.conn.commit()

    # ---- jobs / errors ----
    def start_job(self, source_url: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO product_import_jobs (start_time, source_url) VALUES (?,?)",
            (_now(), source_url))
        self.conn.commit()
        return cur.lastrowid

    def end_job(self, job_id: int, stats: dict, errors: list):
        self.conn.execute(
            "UPDATE product_import_jobs SET end_time=?, products_discovered=?, products_created=?, "
            "products_updated=?, products_skipped=?, products_failed=?, errors=? WHERE job_id=?",
            (_now(), stats.get("discovered", 0), stats.get("created", 0),
             stats.get("updated", 0), stats.get("skipped", 0), stats.get("failed", 0),
             json.dumps(errors, ensure_ascii=False), job_id))
        self.conn.commit()

    def log_error(self, job_id: int, url: str, error_type: str, error_message: str, retry=0):
        self.conn.execute(
            "INSERT INTO product_import_errors (job_id, url, error_type, error_message, retry_count) "
            "VALUES (?,?,?,?,?)", (job_id, url, error_type, error_message, retry))
        self.conn.commit()

    # ---- queries ----
    def get_product(self, product_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
        return dict(row) if row else None

    def list_products(self) -> list[dict]:
        rows = self.conn.execute("SELECT product_id, sku, primary_category, product_status, "
                                 "data_completeness, recommendation_eligible, needs_review "
                                 "FROM products ORDER BY product_id").fetchall()
        return [dict(r) for r in rows]

    def recommend_eligible(self) -> list[dict]:
        rows = self.conn.execute("SELECT product_id, sku, product_intelligence_score, data_completeness "
                                 "FROM products WHERE recommendation_eligible=1 ORDER BY product_intelligence_score DESC").fetchall()
        return [dict(r) for r in rows]

    def close(self):
        self.conn.close()
