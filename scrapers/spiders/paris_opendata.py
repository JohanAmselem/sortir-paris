"""
Paris Open Data spider.
Source: https://opendata.paris.fr
Dataset: "Que faire à Paris ?" — événements culturels de la Ville de Paris.

Free, no API key needed, well-structured data.
"""

import httpx
from typing import Generator

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)

DATASET_URL = (
    "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
    "que-faire-a-paris-/records"
)


def fetch_events(limit: int = 100) -> Generator[dict, None, None]:
    """Fetch events from Paris Open Data."""

    offset = 0
    total = None

    while total is None or offset < total:
        params = {
            "limit": limit,
            "offset": offset,
            "order_by": "date_start DESC",
            "where": "date_end >= NOW()",
        }

        response = httpx.get(DATASET_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        total = data.get("total_count", 0)
        results = data.get("results", [])

        if not results:
            break

        for record in results:
            yield transform_event(record)

        offset += limit


def transform_event(raw: dict) -> dict:
    """Transform Paris Open Data record into our raw event format."""

    title = clean_text(raw.get("title")) or ""
    description = clean_text(raw.get("description"))
    lead_text = clean_text(raw.get("lead_text"))

    # Location
    venue_name = raw.get("address_name")
    venue_address = raw.get("address_street")
    venue_city = raw.get("address_city", "Paris")
    venue_zip = raw.get("address_zipcode")

    # Geo
    geo = raw.get("lat_lon")
    lat = geo.get("lat") if geo else None
    lng = geo.get("lon") if geo else None

    # Dates
    start_date = raw.get("date_start")
    end_date = raw.get("date_end")

    # Price
    price_raw = raw.get("price_type")
    if price_raw == "gratuit":
        price_data = {"price_min": 0, "price_max": 0, "is_free": True}
    else:
        price_detail = raw.get("price_detail")
        price_data = parse_price(price_detail)

    # Image
    image_url = raw.get("cover_url") or raw.get("image")

    # Category
    category_raw = raw.get("category")

    # URL
    source_url = raw.get("url") or raw.get("access_link")

    return {
        "source": "paris_opendata",
        "source_id": str(raw.get("id", "")),
        "source_url": source_url,
        "title": title,
        "description": description or lead_text,
        "short_desc": truncate(lead_text or description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_data["price_min"],
        "price_max": price_data["price_max"],
        "is_free": price_data["is_free"],
        "booking_url": raw.get("access_link"),
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": venue_city,
        "venue_zip": venue_zip,
        "venue_lat": lat,
        "venue_lng": lng,
        "category_slug": detect_category(category_raw, title, description),
        "tags_raw": [t.strip() for t in (raw.get("tags") or "").split(";") if t.strip()],
        "slug": generate_slug(title, start_date),
        "quality_score": compute_quality_score(
            title, description, image_url, start_date, price_raw, source_url
        ),
    }


if __name__ == "__main__":
    import json

    print("Fetching Paris Open Data events...")
    for i, event in enumerate(fetch_events(limit=10)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 4:
            break
    print("Done.")
