"""
Ingestion pipeline: validated, idempotent upserts into Postgres.

- One SAVEPOINT per event: a bad row never rolls back its neighbours (AUDIT D5 / C1).
- validation.validate() decides status: active / draft / rejected / cancelled (+ quality_reasons).
- Updates never overwrite good data with NULL (COALESCE); prices only when known.
- Slug conflicts get a short hash suffix instead of silently dropping the event.
- Every upsert sets last_seen_at = now().
- Meilisearch is NOT touched here: one full sync runs at the end (pipelines/meili.py).
- Cross-source dedup runs after all sources (pipelines/dedup.py).
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from utils.event import stable_id
from utils.keywords import extract_keywords, keywords_to_search_string
from utils.matching import dedup_title
from utils.normalize import generate_slug
from validation import decide_status, validate
from pipelines.venues import VenueResolver

BATCH_SIZE = 200
MAX_LOGGED_ERRORS = 50
PLACEHOLDER_MIN_TITLES = 3


def get_db_connection():
    import psycopg2

    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    conn = psycopg2.connect(url, connect_timeout=15, application_name="panameclub-scrapers")
    with conn.cursor() as cur:
        cur.execute("SET TIME ZONE 'UTC'")
        cur.execute("SET statement_timeout = '60s'")
    conn.commit()
    return conn


def drop_placeholder_images(events: List[dict], min_titles: int = PLACEHOLDER_MIN_TITLES) -> int:
    """An image URL shared by ≥ min_titles unrelated events is a placeholder (e.g. the
    InfoConcert 'Muse' picture on 444 concerts) → removed. Returns #events changed."""
    titles_by_image: Dict[str, set] = defaultdict(set)
    for ev in events:
        if ev.get("image_url"):
            titles_by_image[ev["image_url"]].add(dedup_title(ev.get("title")))
    shared = {img for img, titles in titles_by_image.items() if len(titles) >= min_titles}
    changed = 0
    for ev in events:
        if ev.get("image_url") in shared:
            ev["image_url"] = None
            changed += 1
    return changed


class CategoryCache:
    def __init__(self, cur):
        cur.execute("SELECT slug, id FROM categories")
        self.ids = {slug: cid for slug, cid in cur.fetchall()}

    def get(self, slug: Optional[str]) -> Optional[str]:
        return self.ids.get(slug) if slug else None


class SlugRegistry:
    """Event slugs already taken, loaded once per connection (one query instead of one per event)."""

    def __init__(self, cur):
        cur.execute("SELECT slug FROM events")
        self.taken = {row[0] for row in cur.fetchall()}

    def reserve(self, base: str, source: str, source_id: str) -> str:
        slug = base if base not in self.taken else f"{base}-{stable_id(source, source_id)[:6]}"
        if slug in self.taken:
            slug = f"{base}-{stable_id(source, source_id, 'x')[:8]}"
        self.taken.add(slug)
        return slug


def load_existing(cur, source: str) -> Dict[str, str]:
    """source_id → event id for one source (one query)."""
    cur.execute("SELECT source_id, id FROM events WHERE source = %s", (source,))
    return {sid: eid for sid, eid in cur.fetchall()}


UPDATE_SQL = """
UPDATE events SET
    title = %(title)s,
    description = COALESCE(%(description)s, description),
    short_desc = COALESCE(%(short_desc)s, short_desc),
    image_url = COALESCE(%(image_url)s, image_url),
    start_date = %(start_date)s,
    end_date = CASE WHEN %(end_date)s::timestamptz IS NOT NULL THEN %(end_date)s::timestamptz
                    WHEN end_date >= %(start_date)s::timestamptz THEN end_date
                    ELSE NULL END,
    time_known = %(time_known)s,
    price_min = CASE WHEN %(price_status)s <> 'unknown' THEN %(price_min)s ELSE price_min END,
    price_max = CASE WHEN %(price_status)s <> 'unknown' THEN %(price_max)s ELSE price_max END,
    is_free = CASE WHEN %(price_status)s <> 'unknown' THEN %(is_free)s ELSE is_free END,
    price_status = CASE WHEN %(price_status)s <> 'unknown' THEN %(price_status)s ELSE price_status END,
    booking_url = COALESCE(%(booking_url)s, booking_url),
    source_url = COALESCE(%(source_url)s, source_url),
    category_id = COALESCE(%(category_id)s, category_id),
    venue_id = COALESCE(%(venue_id)s, venue_id),
    keywords = COALESCE(%(keywords)s, keywords),
    status = %(status)s,
    quality_score = %(quality_score)s,
    quality_reasons = %(quality_reasons)s::jsonb,
    last_seen_at = now(),
    updated_at = now()
WHERE id = %(id)s
"""

INSERT_SQL = """
INSERT INTO events (
    title, slug, description, short_desc, image_url,
    start_date, end_date, time_known,
    price_min, price_max, is_free, price_status,
    booking_url, category_id, venue_id, keywords,
    source, source_url, source_id,
    status, quality_score, quality_reasons, last_seen_at
) VALUES (
    %(title)s, %(slug)s, %(description)s, %(short_desc)s, %(image_url)s,
    %(start_date)s, %(end_date)s, %(time_known)s,
    %(price_min)s, %(price_max)s, %(is_free)s, %(price_status)s,
    %(booking_url)s, %(category_id)s, %(venue_id)s, %(keywords)s,
    %(source)s, %(source_url)s, %(source_id)s,
    %(status)s, %(quality_score)s, %(quality_reasons)s::jsonb, now()
)
ON CONFLICT (slug) DO NOTHING
RETURNING id
"""

# Hard reasons that mean "not worth a new row" (existing rows are still updated).
# Out-of-zone / online / junk rows are not stored at all (they used to be inserted as
# "rejected", which bloated the table with thousands of useless rows).
SKIP_INSERT = {"no_title", "no_start_date", "ended", "too_far_ahead", "out_of_zone", "online", "junk_title"}
UNSTORABLE = {"no_title", "no_start_date"}


def plan_event(cur, raw: dict, ctx: "IngestContext"):
    """Validate one event and decide what to write.

    Returns (action, kind, params): action in new/updated/rejected/skipped,
    kind in "insert" / "update" / None. Only venue creation/enrichment may hit
    the database here (rare: venues are resolved from an in-memory index).
    """
    ev, hard, soft, score = validate(raw)
    if ev is None or set(hard) & UNSTORABLE:
        return "rejected", None, None

    existing_id = ctx.existing.get(ev.source_id)
    if not existing_id and set(hard) & SKIP_INSERT:
        return "skipped", None, None  # e.g. already ended: not worth a row (and no venue creation)

    venue_id, geocoded = ctx.venues.resolve(cur, raw) if raw.get("venue_name") else (None, False)
    ev, hard, soft, score = validate(raw, venue_geocoded=geocoded)
    status = decide_status(hard, score)
    if hard and set(hard) <= {"ended"}:
        status = "expired"

    params = {
        "title": ev.title,
        "description": ev.description,
        "short_desc": ev.short_desc,
        "image_url": ev.image_url,
        "start_date": ev.start_date,
        "end_date": ev.end_date if (ev.end_date is None or ev.end_date >= ev.start_date) else None,
        "time_known": ev.time_known,
        "price_min": min(ev.price_min, ev.price_max) if ev.price_max else ev.price_min,
        "price_max": max(ev.price_min, ev.price_max),
        "is_free": ev.is_free and ev.price_max == 0,
        "price_status": ev.price_status,
        "booking_url": ev.booking_url,
        "source_url": ev.source_url,
        "category_id": ctx.categories.get(ev.category_slug),
        "venue_id": venue_id,
        "keywords": keywords_to_search_string(
            extract_keywords(ev.title, ev.description, ev.short_desc, ev.category_slug,
                             ev.venue_name, is_free=ev.price_status == "free")
        ) or None,
        "source": ev.source,
        "source_id": ev.source_id,
        "status": status,
        "quality_score": score,
        "quality_reasons": json.dumps(hard + soft),
    }
    if params["price_status"] == "free":
        params["price_min"] = params["price_max"] = 0

    if existing_id:
        params["id"] = existing_id
        return "updated", "update", params

    base = ev.slug or generate_slug(ev.title, ev.start_date.isoformat())
    params["slug"] = ctx.slugs.reserve(base, ev.source, ev.source_id)
    ctx.existing[ev.source_id] = "pending"  # same source_id twice in one run → second is an update no-op
    return ("new" if status != "rejected" else "rejected"), "insert", params


class IngestContext:
    def __init__(self, cur, source: str):
        self.categories = CategoryCache(cur)
        self.slugs = SlugRegistry(cur)
        self.existing = load_existing(cur, source)
        self.venues = VenueResolver(cur)


def _exec_many(cur, sql: str, rows: List[dict], page_size: int = BATCH_SIZE) -> None:
    """Send many statements per round trip (execute_batch) when the driver supports it."""
    if not rows:
        return
    if hasattr(cur, "mogrify"):
        from psycopg2.extras import execute_batch

        execute_batch(cur, sql, rows, page_size=page_size)
    else:  # test doubles
        for r in rows:
            cur.execute(sql, r)


def _flush(cur, pending: List[tuple], stats: dict, slugs: SlugRegistry) -> None:
    """Write a batch of planned rows. One savepoint for the batch; if anything fails,
    replay row by row (each in its own savepoint) so one bad row never blocks the others."""
    if not pending:
        return
    inserts = [p for _, kind, p, _ in pending if kind == "insert"]
    updates = [p for _, kind, p, _ in pending if kind == "update" and p["id"] != "pending"]
    cur.execute("SAVEPOINT batch")
    try:
        _exec_many(cur, UPDATE_SQL, updates)
        _exec_many(cur, INSERT_SQL, inserts)
        cur.execute("RELEASE SAVEPOINT batch")
        for action, kind, p, _ in pending:
            if kind == "update" and p["id"] == "pending":
                continue
            stats[action] += 1
        return
    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT batch")

    for action, kind, p, raw in pending:
        if kind == "update" and p["id"] == "pending":
            continue
        cur.execute("SAVEPOINT ev")
        try:
            if kind == "update":
                cur.execute(UPDATE_SQL, p)
            else:
                cur.execute(INSERT_SQL, p)
                if not cur.fetchone():  # lost a slug race (parallel job) → hashed slug
                    p["slug"] = slugs.reserve(f"{p['slug']}-{stable_id(p['source'], p['source_id'], 'y')[:4]}",
                                              p["source"], p["source_id"])
                    cur.execute(INSERT_SQL, p)
                    if not cur.fetchone():
                        raise RuntimeError("slug conflict")
            cur.execute("RELEASE SAVEPOINT ev")
            stats[action] += 1
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT ev")
            stats["errors"] += 1
            if len(stats["error_list"]) < MAX_LOGGED_ERRORS:
                stats["error_list"].append(f"{(raw.get('title') or '?')[:80]}: {str(e)[:200]}")
            if stats["errors"] <= 5:
                print(f"  Error processing '{raw.get('title', '?')}': {e}")


def run_pipeline(events: List[dict], source_name: str, conn=None) -> dict:
    """Ingest a batch of events for one source. Returns stats (never raises per event).

    Reads are done once up front (existing ids, slugs, venues, categories) and
    writes are grouped BATCH_SIZE at a time: a few round trips per batch instead
    of ~7 per event (the GitHub runners are far from the database).
    """
    print(f"\n{'=' * 50}\nIngesting {len(events)} events from {source_name}\n{'=' * 50}")
    stats = {"found": len(events), "new": 0, "updated": 0, "duplicate": 0,
             "rejected": 0, "skipped": 0, "errors": 0, "error_list": []}
    if not events:
        return stats

    n_placeholder = drop_placeholder_images(events)
    if n_placeholder:
        print(f"  dropped placeholder images on {n_placeholder} events")

    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    # psycopg2 refuses to change autocommit while a transaction is open (the
    # caller may just have run a SELECT): only switch when needed.
    if conn.autocommit:
        conn.autocommit = False
    cur = conn.cursor()
    sources = {e.get("source") for e in events if e.get("source")}
    ctx = IngestContext(cur, sources.pop() if len(sources) == 1 else source_name)

    pending: List[tuple] = []
    for i, raw in enumerate(events):
        cur.execute("SAVEPOINT ev")
        try:
            action, kind, params = plan_event(cur, raw, ctx)
            cur.execute("RELEASE SAVEPOINT ev")
            ctx.venues.saved()
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT ev")
            ctx.venues.forget_unsaved()
            stats["errors"] += 1
            if len(stats["error_list"]) < MAX_LOGGED_ERRORS:
                stats["error_list"].append(f"{(raw.get('title') or '?')[:80]}: {str(e)[:200]}")
            if stats["errors"] <= 5:
                print(f"  Error processing '{raw.get('title', '?')}': {e}")
            continue
        if kind is None:
            stats[action] += 1
        else:
            pending.append((action, kind, params, raw))
        if len(pending) >= BATCH_SIZE:
            _flush(cur, pending, stats, ctx.slugs)
            pending = []
            conn.commit()
            print(f"  Progress: {i + 1}/{len(events)}", flush=True)

    _flush(cur, pending, stats, ctx.slugs)
    conn.commit()
    cur.close()
    if own_conn:
        conn.close()
    print(f"Results: { {k: v for k, v in stats.items() if k != 'error_list'} }")
    return stats


def log_start(conn, source: str, started_at: Optional[datetime] = None) -> Optional[str]:
    """Insert a 'running' row with the REAL start time of the source run."""
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO ingestion_logs (source, started_at, status)
               VALUES (%s, COALESCE(%s, now()), 'running') RETURNING id""",
            (source, started_at),
        )
        row = cur.fetchone()
    conn.commit()
    return row[0] if row else None


def compute_status(stats: dict, crashed: bool) -> str:
    """'failed' when nothing was found or nothing could be stored (AUDIT D5)."""
    if stats.get("found", 0) == 0 or stats.get("new", 0) + stats.get("updated", 0) == 0:
        return "failed"
    if crashed or stats.get("errors", 0):
        return "partial"
    return "success"


def log_finish(conn, log_id: Optional[str], source: str, stats: dict, crashed: bool, errors: List[str]) -> str:
    status = compute_status(stats, crashed)
    payload = json.dumps([e[:300] for e in errors][:MAX_LOGGED_ERRORS])
    with conn.cursor() as cur:
        if log_id:
            cur.execute(
                """UPDATE ingestion_logs SET finished_at = now(), status = %s, events_found = %s,
                       events_new = %s, events_updated = %s, events_duped = %s, errors = %s::jsonb
                   WHERE id = %s""",
                (status, stats.get("found", 0), stats.get("new", 0), stats.get("updated", 0),
                 stats.get("duplicate", 0), payload, log_id),
            )
        else:
            cur.execute(
                """INSERT INTO ingestion_logs (source, started_at, finished_at, status, events_found,
                       events_new, events_updated, events_duped, errors)
                   VALUES (%s, now(), now(), %s, %s, %s, %s, %s, %s::jsonb)""",
                (source, status, stats.get("found", 0), stats.get("new", 0), stats.get("updated", 0),
                 stats.get("duplicate", 0), payload),
            )
    conn.commit()
    return status


def last_successful_found(conn, source: str) -> Optional[int]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT events_found FROM ingestion_logs
               WHERE source = %s AND status IN ('success', 'partial') AND finished_at IS NOT NULL
               ORDER BY started_at DESC LIMIT 1""",
            (source,),
        )
        row = cur.fetchone()
    conn.rollback()  # read-only: close the implicit transaction
    return row[0] if row else None
