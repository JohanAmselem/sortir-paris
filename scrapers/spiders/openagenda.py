"""
OpenAgenda API spider.
Source: https://openagenda.com
API docs: https://developers.openagenda.com/

This is the primary data source — structured API, reliable, high quality.
"""

import httpx
from datetime import datetime, timedelta
from typing import Generator

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)


# OpenAgenda agenda IDs for Paris cultural institutions
# These are discovered via https://openagenda.com/agendas?search=paris+culture
AGENDA_IDS = [
    # Add real agenda IDs here after research
    # Examples:
    # "quefaireaparis",       # Mairie de Paris
    # "philharmoniedeparis",  # Philharmonie
    # "centrepompidou",       # Centre Pompidou
]

API_BASE = "https://api.openagenda.com/v2"


def fetch_events(
    api_key: str,
    agenda_uid: str,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 100,
) -> Generator[dict, None, None]:
    """Fetch events from an OpenAgenda agenda."""

    if not from_date:
        from_date = datetime.now().strftime("%Y-%m-%d")
    if not to_date:
        to_date = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")

    offset = 0
    total = None

    while total is None or offset < total:
        params = {
            "key": api_key,
            "timings[gte]": from_date,
            "timings[lte]": to_date,
            "size": limit,
            "from": offset,
            "detailed": 1,
        }

        response = httpx.get(
            f"{API_BASE}/agendas/{agenda_uid}/events",
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        total = data.get("total", 0)
        events = data.get("events", [])

        if not events:
            break

        for event in events:
            yield transform_event(event, agenda_uid)

        offset += limit


def transform_event(raw: dict, agenda_uid: str) -> dict:
    """Transform OpenAgenda event into our raw event format."""

    # Get French text (OpenAgenda supports multilingual)
    title = raw.get("title", {}).get("fr") or raw.get("title", {}).get("en", "")
    description = raw.get("description", {}).get("fr") or raw.get("description", {}).get("en")
    long_desc = raw.get("longDescription", {}).get("fr") or raw.get("longDescription", {}).get("en")

    # Location
    location = raw.get("location", {})
    venue_name = location.get("name")
    venue_address = location.get("address")
    venue_city = location.get("city")
    venue_zip = location.get("postalCode")

    # Timing — take the next upcoming timing
    timings = raw.get("timings", [])
    start_date = None
    end_date = None
    if timings:
        next_timing = timings[0]
        start_date = next_timing.get("begin")
        end_date = next_timing.get("end")

    # Image
    image = raw.get("image")
    image_url = image.get("base") + image.get("filename") if image and image.get("base") else None

    # Price
    price_raw = None
    registration = raw.get("registration", [])
    if registration:
        price_raw = registration[0].get("price") if registration[0].get("price") else None
    conditions = raw.get("conditions", {}).get("fr")
    if not price_raw and conditions:
        price_raw = conditions

    # Category from tags/keywords
    keywords = raw.get("keywords", {}).get("fr", [])
    category_raw = " ".join(keywords) if keywords else None

    # Build normalized event
    cleaned_title = clean_text(title) or ""
    cleaned_desc = clean_text(long_desc or description)
    price_data = parse_price(price_raw)

    return {
        "source": "openagenda",
        "source_id": str(raw.get("uid", "")),
        "source_url": raw.get("canonicalUrl", f"https://openagenda.com/events/{raw.get('uid')}"),
        "title": cleaned_title,
        "description": cleaned_desc,
        "short_desc": truncate(cleaned_desc),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_data["price_min"],
        "price_max": price_data["price_max"],
        "is_free": price_data["is_free"],
        "booking_url": raw.get("registration", [{}])[0].get("link") if raw.get("registration") else None,
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": venue_city or "Paris",
        "venue_zip": venue_zip,
        "category_slug": detect_category(category_raw, cleaned_title, cleaned_desc),
        "tags_raw": keywords,
        "slug": generate_slug(cleaned_title, start_date),
        "quality_score": compute_quality_score(
            cleaned_title, cleaned_desc, image_url, start_date, price_raw, None
        ),
    }


if __name__ == "__main__":
    import os
    import json
    from dotenv import load_dotenv

    load_dotenv()
    api_key = os.getenv("OPENAGENDA_API_KEY", "")

    # Test with a known agenda
    for agenda_id in AGENDA_IDS[:1]:
        print(f"\nFetching from agenda: {agenda_id}")
        for i, event in enumerate(fetch_events(api_key, agenda_id)):
            print(json.dumps(event, indent=2, ensure_ascii=False))
            if i >= 2:
                break
