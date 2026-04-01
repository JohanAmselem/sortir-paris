"""
Daily cron job — scrapes all sources and syncs to Meilisearch.
Designed to run on Railway/Render as a scheduled task.

Usage:
    python cron.py              # Run all sources
    python cron.py --source paris_opendata   # Run one source only
"""

import os
import sys
import time
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from run import SOURCES, run_paris_opendata, run_openagenda


def sync_meilisearch():
    """Re-sync all active events to Meilisearch after scraping."""
    import httpx
    import psycopg2
    import psycopg2.extras

    db_url = os.getenv("DATABASE_URL", "")
    meili_host = os.getenv("MEILISEARCH_HOST", "")
    meili_key = os.getenv("MEILISEARCH_API_KEY", "")

    if not meili_host or "localhost" in meili_host:
        print("Meilisearch not configured, skipping sync")
        return

    print("\nSyncing all active events to Meilisearch...")
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cursor.execute("""
        SELECT
            e.id, e.title, e.slug, e.short_desc, e.description,
            e.image_url, e.start_date, e.end_date,
            e.price_min, e.price_max, e.is_free,
            e.booking_url, e.save_count, e.view_count,
            e.quality_score, e.source, e.source_url,
            c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            v.name AS venue_name, v.address AS venue_address,
            v.arrondissement, v.lat, v.lng, v.city
        FROM events e
        LEFT JOIN categories c ON c.id = e.category_id
        LEFT JOIN venues v ON v.id = e.venue_id
        WHERE e.status = 'active'
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    print(f"  Found {len(rows)} active events")

    # Transform for Meilisearch
    documents = []
    for r in rows:
        start_ts = None
        if r["start_date"]:
            try:
                start_ts = int(r["start_date"].timestamp())
            except (ValueError, AttributeError):
                pass

        doc = {
            "id": r["id"],
            "title": r["title"],
            "slug": r["slug"],
            "shortDesc": r["short_desc"],
            "description": (r["description"] or "")[:500],
            "imageUrl": r["image_url"],
            "startDate": start_ts,
            "startDateISO": r["start_date"].isoformat() if r["start_date"] else None,
            "priceMin": r["price_min"] or 0,
            "priceMax": r["price_max"] or 0,
            "isFree": r["is_free"] or False,
            "bookingUrl": r["booking_url"],
            "saveCount": r["save_count"] or 0,
            "viewCount": r["view_count"] or 0,
            "qualityScore": r["quality_score"] or 0,
            "source": r["source"],
            "sourceUrl": r["source_url"],
            "category": r["category_name"],
            "categorySlug": r["category_slug"],
            "categoryIcon": r["category_icon"],
            "venueName": r["venue_name"],
            "venueAddress": r["venue_address"],
            "arrondissement": r["arrondissement"],
            "city": r["city"],
        }
        if r["lat"] and r["lng"]:
            doc["_geo"] = {"lat": r["lat"], "lng": r["lng"]}
        documents.append(doc)

    # Send in batches of 500
    BATCH_SIZE = 500
    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i:i + BATCH_SIZE]
        resp = httpx.post(
            f"{meili_host}/indexes/events/documents",
            json=batch,
            headers={
                "Authorization": f"Bearer {meili_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        print(f"  Batch {i // BATCH_SIZE + 1}: sent {len(batch)} docs")

    print(f"  Meilisearch sync complete: {len(documents)} events")


def main():
    parser = argparse.ArgumentParser(description="Sortir Paris — Daily Cron")
    parser.add_argument("--source", choices=list(SOURCES.keys()), help="Run one source only")
    parser.add_argument("--all", action="store_true", help="Run all sources")
    args = parser.parse_args()

    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"  Sortir Paris — Cron Job")
    print(f"  Started: {start.isoformat()}")
    print(f"{'='*60}")

    # 1. Scrape
    if args.source:
        print(f"\nRunning source: {args.source}")
        SOURCES[args.source]()
    elif args.all:
        print("\nRunning all sources...")
        for name, runner in SOURCES.items():
            try:
                runner()
            except Exception as e:
                print(f"Error running {name}: {e}")

    # 2. Geocode venues with missing coordinates
    try:
        from utils.geocode import geocode_missing_venues
        geocode_missing_venues()
    except Exception as e:
        print(f"Geocoding error: {e}")

    # 3. Full Meilisearch re-sync
    try:
        sync_meilisearch()
    except Exception as e:
        print(f"Meilisearch sync error: {e}")

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n{'='*60}")
    print(f"  Cron complete in {elapsed:.1f}s")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
