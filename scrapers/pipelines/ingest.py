"""
Main ingestion pipeline.
Receives normalized events from spiders and:
1. Deduplicates
2. Upserts to PostgreSQL
3. Syncs to Meilisearch
"""

import os
import json
import time
import psycopg2
import psycopg2.extras
import httpx
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
MEILISEARCH_HOST = os.getenv("MEILISEARCH_HOST", "http://localhost:7700")
MEILISEARCH_API_KEY = os.getenv("MEILISEARCH_API_KEY", "")


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def find_or_create_venue(cursor, event: dict) -> str | None:
    """Find existing venue or create new one. Returns venue ID."""
    venue_name = event.get("venue_name")
    if not venue_name:
        return None

    # Try to find by name (exact match first)
    cursor.execute(
        "SELECT id FROM venues WHERE lower(name) = lower(%s) LIMIT 1",
        (venue_name,),
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    # Create new venue
    from utils.normalize import generate_slug

    slug = generate_slug(venue_name)

    cursor.execute(
        """
        INSERT INTO venues (name, slug, address, city, zip_code, lat, lng)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        """,
        (
            venue_name,
            slug,
            event.get("venue_address"),
            event.get("venue_city", "Paris"),
            event.get("venue_zip"),
            event.get("venue_lat"),
            event.get("venue_lng"),
        ),
    )
    return cursor.fetchone()[0]


def find_category_id(cursor, category_slug: str | None) -> str | None:
    """Find category ID by slug."""
    if not category_slug:
        return None
    cursor.execute("SELECT id FROM categories WHERE slug = %s", (category_slug,))
    row = cursor.fetchone()
    return row[0] if row else None


def upsert_event(cursor, event: dict, venue_id: str | None, category_id: str | None) -> tuple[str, str]:
    """Upsert event. Returns (event_id, action) where action is 'new', 'updated', or 'duplicate'."""

    # Check dedup by source + source_id
    cursor.execute(
        "SELECT id FROM events WHERE source = %s AND source_id = %s",
        (event["source"], event["source_id"]),
    )
    existing = cursor.fetchone()

    if existing:
        # Update existing
        cursor.execute(
            """
            UPDATE events SET
                title = %s, description = %s, short_desc = %s,
                image_url = %s, start_date = %s, end_date = %s,
                price_min = %s, price_max = %s, is_free = %s,
                booking_url = %s, category_id = %s, venue_id = %s,
                quality_score = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (
                event["title"], event["description"], event.get("short_desc"),
                event.get("image_url"), event["start_date"], event.get("end_date"),
                event["price_min"], event["price_max"], event["is_free"],
                event.get("booking_url"), category_id, venue_id,
                event.get("quality_score", 0), existing[0],
            ),
        )
        return existing[0], "updated"

    # Check fuzzy dedup: same title + same date + same venue
    if venue_id and event.get("start_date"):
        cursor.execute(
            """
            SELECT id FROM events
            WHERE venue_id = %s
              AND DATE(start_date) = DATE(%s)
              AND similarity(lower(title), lower(%s)) > 0.6
            LIMIT 1
            """,
            (venue_id, event["start_date"], event["title"]),
        )
        fuzzy = cursor.fetchone()
        if fuzzy:
            return fuzzy[0], "duplicate"

    # Insert new
    cursor.execute(
        """
        INSERT INTO events (
            title, slug, description, short_desc, image_url,
            start_date, end_date, price_min, price_max, is_free,
            booking_url, category_id, venue_id,
            source, source_url, source_id,
            status, quality_score
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s
        )
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
        """,
        (
            event["title"], event["slug"], event["description"], event.get("short_desc"),
            event.get("image_url"),
            event["start_date"], event.get("end_date"),
            event["price_min"], event["price_max"], event["is_free"],
            event.get("booking_url"), category_id, venue_id,
            event["source"], event.get("source_url"), event["source_id"],
            "active" if event.get("quality_score", 0) >= 30 else "draft",
            event.get("quality_score", 0),
        ),
    )
    row = cursor.fetchone()
    if row:
        return row[0], "new"
    return "", "duplicate"


def sync_to_meilisearch(events_to_sync: list[dict]):
    """Push events to Meilisearch index."""
    if not events_to_sync:
        return

    response = httpx.post(
        f"{MEILISEARCH_HOST}/indexes/events/documents",
        json=events_to_sync,
        headers={"Authorization": f"Bearer {MEILISEARCH_API_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    print(f"  Synced {len(events_to_sync)} events to Meilisearch")


def run_pipeline(events: list[dict], source_name: str):
    """Run the full ingestion pipeline for a batch of events."""

    print(f"\n{'='*50}")
    print(f"Ingesting {len(events)} events from {source_name}")
    print(f"{'='*50}")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Enable pg_trgm for fuzzy matching
    cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    stats = {"new": 0, "updated": 0, "duplicate": 0, "errors": 0}
    meili_batch: list[dict] = []

    for event in events:
        try:
            venue_id = find_or_create_venue(cursor, event)
            category_id = find_category_id(cursor, event.get("category_slug"))
            event_id, action = upsert_event(cursor, event, venue_id, category_id)
            stats[action] += 1

            if action in ("new", "updated") and event_id:
                # Prepare Meilisearch document
                start_ts = None
                if event.get("start_date"):
                    try:
                        start_ts = int(datetime.fromisoformat(event["start_date"]).timestamp())
                    except (ValueError, TypeError):
                        pass

                meili_batch.append({
                    "id": event_id,
                    "title": event["title"],
                    "slug": event["slug"],
                    "shortDesc": event.get("short_desc"),
                    "description": event.get("description"),
                    "imageUrl": event.get("image_url"),
                    "startDate": start_ts,
                    "priceMin": event["price_min"],
                    "priceMax": event["price_max"],
                    "isFree": event["is_free"],
                    "bookingUrl": event.get("booking_url"),
                    "categorySlug": event.get("category_slug"),
                    "saveCount": 0,
                    "qualityScore": event.get("quality_score", 0),
                    "tags": event.get("tags_raw", []),
                    "ambiances": [],
                })

        except Exception as e:
            stats["errors"] += 1
            print(f"  Error processing '{event.get('title', '?')}': {e}")

    conn.commit()

    # Log ingestion
    cursor.execute(
        """
        INSERT INTO ingestion_logs (source, started_at, finished_at, status, events_found, events_new, events_updated, events_duped, errors)
        VALUES (%s, %s, NOW(), %s, %s, %s, %s, %s, %s)
        """,
        (
            source_name,
            datetime.now(),
            "success" if stats["errors"] == 0 else "partial",
            len(events),
            stats["new"],
            stats["updated"],
            stats["duplicate"],
            json.dumps([]),
        ),
    )
    conn.commit()

    # Sync to Meilisearch
    if meili_batch:
        try:
            sync_to_meilisearch(meili_batch)
        except Exception as e:
            print(f"  Meilisearch sync error: {e}")

    cursor.close()
    conn.close()

    print(f"\nResults: {stats}")
    return stats
