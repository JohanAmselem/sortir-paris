"""
THE Meilisearch sync (single source of truth for the document shape — AUDIT R-3).

Indexes only live, displayable events:
    status = 'active' AND canonical_event_id IS NULL AND coalesce(end_date, start_date) >= now()

Builds a fresh temporary index, waits for every task, then atomically swaps it with the
live index — so deleted/expired events never linger as stale documents.

Key: MEILISEARCH_WRITE_KEY (preferred: a scoped key limited to the indexes `events` and
`events_tmp` with actions indexes.create, indexes.get, indexes.delete, indexes.swap,
documents.add, settings.update, tasks.get) — falls back to MEILISEARCH_API_KEY.

Usage: python -m pipelines.meili [--force]
"""

from __future__ import annotations

import os
import sys
import time
from typing import List, Optional

import httpx

INDEX = os.getenv("MEILISEARCH_INDEX", "events")
TMP_INDEX = f"{INDEX}_tmp"
BATCH = 1000

SETTINGS = {
    "searchableAttributes": [
        "title", "keywords", "tags", "venueName", "shortDesc", "description", "categoryName",
    ],
    "filterableAttributes": [
        "categorySlug", "arrondissement", "isFree", "priceStatus", "startDate", "endDate", "_geo",
    ],
    "sortableAttributes": ["startDate", "qualityScore", "_geo"],
    "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    "typoTolerance": {"enabled": True, "minWordSizeForTypos": {"oneTypo": 3, "twoTypos": 6}},
    "synonyms": {
        "concert": ["live", "show", "musique"],
        "expo": ["exposition", "galerie", "musée"],
        "gratuit": ["free", "entrée libre"],
        "theatre": ["théâtre", "pièce", "représentation"],
        "danse": ["ballet", "chorégraphie"],
        "cinema": ["cinéma", "film", "projection"],
        "soirée": ["party", "fête", "clubbing"],
        "enfants": ["famille", "jeune public", "kids"],
        "classique": ["orchestre", "symphonique", "opéra"],
        "electro": ["techno", "house"],
        "hip-hop": ["rap", "hip hop"],
        "stand-up": ["humour", "one man show"],
    },
    "faceting": {"maxValuesPerFacet": 100},
    "pagination": {"maxTotalHits": 5000},
}

QUERY = """
SELECT
    e.id, e.title, e.slug, e.short_desc, e.description, e.image_url,
    e.start_date, e.end_date, e.time_known,
    e.price_min, e.price_max, e.price_status, e.is_free,
    e.keywords, e.quality_score,
    c.slug AS category_slug, c.name AS category_name,
    v.name AS venue_name, v.slug AS venue_slug, v.arrondissement, v.lat, v.lng,
    COALESCE((SELECT array_agg(t.name ORDER BY t.name)
              FROM event_tags et JOIN tags t ON t.id = et.tag_id
              WHERE et.event_id = e.id), '{}') AS tags
FROM events e
LEFT JOIN categories c ON c.id = e.category_id
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.status = 'active'
  AND e.canonical_event_id IS NULL
  AND coalesce(e.end_date, e.start_date) >= now()
"""


def build_document(r: dict) -> dict:
    """Row → Meilisearch document (the ONE shape used by the web app)."""
    def ts(v) -> Optional[int]:
        return int(v.timestamp()) if v is not None else None

    doc = {
        "id": str(r["id"]),
        "title": r["title"],
        "slug": r["slug"],
        "shortDesc": r.get("short_desc"),
        "description": (r.get("description") or "")[:500] or None,
        "imageUrl": r.get("image_url"),
        "startDate": ts(r["start_date"]),
        "endDate": ts(r.get("end_date")),
        "timeKnown": bool(r.get("time_known", True)),
        "priceMin": r.get("price_min") or 0,
        "priceMax": r.get("price_max") or 0,
        "priceStatus": r.get("price_status") or "unknown",
        "isFree": bool(r.get("is_free")),
        "categorySlug": r.get("category_slug"),
        "categoryName": r.get("category_name"),
        "venueName": r.get("venue_name"),
        "venueSlug": r.get("venue_slug"),
        "arrondissement": r.get("arrondissement"),
        "lat": r.get("lat"),
        "lng": r.get("lng"),
        "keywords": r.get("keywords") or "",
        "tags": list(r.get("tags") or []),
        "qualityScore": r.get("quality_score") or 0,
    }
    if r.get("lat") is not None and r.get("lng") is not None:
        doc["_geo"] = {"lat": float(r["lat"]), "lng": float(r["lng"])}
    return doc


class Meili:
    def __init__(self, host: str, key: str):
        self.client = httpx.Client(
            base_url=host.rstrip("/"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            timeout=60,
        )

    def _req(self, method: str, path: str, **kw) -> httpx.Response:
        resp = self.client.request(method, path, **kw)
        if resp.status_code >= 400 and resp.status_code != 404:
            raise RuntimeError(f"Meilisearch {method} {path} → {resp.status_code}: {resp.text[:300]}")
        return resp

    def wait(self, task_uid: int, timeout: float = 600) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            task = self._req("GET", f"/tasks/{task_uid}").json()
            status = task.get("status")
            if status == "succeeded":
                return
            if status in ("failed", "canceled"):
                raise RuntimeError(f"Meilisearch task {task_uid} {status}: {task.get('error')}")
            time.sleep(0.5)
        raise TimeoutError(f"Meilisearch task {task_uid} not finished after {timeout}s")

    def task(self, resp: httpx.Response) -> None:
        self.wait(resp.json()["taskUid"])

    def index_exists(self, uid: str) -> bool:
        return self._req("GET", f"/indexes/{uid}").status_code == 200

    def count(self, uid: str) -> int:
        resp = self._req("GET", f"/indexes/{uid}/stats")
        return resp.json().get("numberOfDocuments", 0) if resp.status_code == 200 else 0

    def create(self, uid: str) -> None:
        self.task(self._req("POST", "/indexes", json={"uid": uid, "primaryKey": "id"}))

    def delete(self, uid: str) -> None:
        resp = self._req("DELETE", f"/indexes/{uid}")
        if resp.status_code != 404:
            self.task(resp)


def fetch_rows(conn) -> List[dict]:
    import psycopg2.extras

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(QUERY)
        return [dict(r) for r in cur.fetchall()]


def sync(conn=None, force: bool = False) -> int:
    host = os.getenv("MEILISEARCH_HOST", "")
    key = os.getenv("MEILISEARCH_WRITE_KEY") or os.getenv("MEILISEARCH_API_KEY", "")
    if not host or "localhost" in host:
        print("[meili] MEILISEARCH_HOST not configured, skipping sync")
        return 0

    own = conn is None
    if own:
        from pipelines.ingest import get_db_connection

        conn = get_db_connection()
    try:
        docs = [build_document(r) for r in fetch_rows(conn)]
    finally:
        if own:
            conn.close()
    print(f"[meili] {len(docs)} live events to index")

    m = Meili(host, key)
    live_count = m.count(INDEX) if m.index_exists(INDEX) else 0
    if not force and live_count > 200 and len(docs) < 0.3 * live_count:
        raise RuntimeError(
            f"[meili] refusing to swap: {len(docs)} docs vs {live_count} live (use --force if intended)"
        )

    m.delete(TMP_INDEX)
    m.create(TMP_INDEX)
    m.task(m._req("PATCH", f"/indexes/{TMP_INDEX}/settings", json=SETTINGS))
    for i in range(0, len(docs), BATCH):
        m.task(m._req("POST", f"/indexes/{TMP_INDEX}/documents?primaryKey=id", json=docs[i: i + BATCH]))
    if not m.index_exists(INDEX):
        m.create(INDEX)
    m.task(m._req("POST", "/swap-indexes", json=[{"indexes": [INDEX, TMP_INDEX]}]))
    m.delete(TMP_INDEX)  # now holds the previous generation
    print(f"[meili] swapped: index '{INDEX}' now has {m.count(INDEX)} documents (was {live_count})")
    return len(docs)


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from dotenv import load_dotenv

    load_dotenv()
    sync(force="--force" in sys.argv)
