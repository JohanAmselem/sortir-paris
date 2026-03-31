"""
Shotgun spider.
Source: https://shotgun.live/fr/events?location=paris
Major platform for electronic music events, club nights, and parties in Paris.

Uses their public API endpoint for event listings.
"""

import httpx
from datetime import datetime
from typing import Generator, Optional

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    compute_quality_score,
)

# Shotgun has a public-facing API for their event listings
API_URL = "https://api.shotgun.live/api/v1/events"
BASE_URL = "https://shotgun.live"


def fetch_events(days_ahead: int = 60, max_pages: int = 10) -> Generator[dict, None, None]:
    """Fetch events from Shotgun API."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
    }

    # Shotgun uses lat/lng for Paris
    params = {
        "latitude": "48.8566",
        "longitude": "2.3522",
        "radius": "15",  # km
        "sort": "date",
        "per_page": "50",
    }

    for page in range(1, max_pages + 1):
        params["page"] = str(page)
        print(f"  Fetching Shotgun page {page}...")

        try:
            resp = httpx.get(API_URL, params=params, headers=headers, timeout=30)

            # If API returns non-JSON, try scraping the HTML listing
            if resp.status_code != 200 or "application/json" not in resp.headers.get("content-type", ""):
                yield from fetch_events_html(max_pages)
                return

            data = resp.json()
        except Exception as e:
            print(f"  Shotgun API error: {e}, falling back to HTML scraping")
            yield from fetch_events_html(max_pages)
            return

        events = data.get("events") or data.get("data") or []
        if isinstance(data, list):
            events = data

        if not events:
            break

        for event_data in events:
            event = parse_api_event(event_data)
            if event:
                yield event

        print(f"  Found {len(events)} events on page {page}")


def fetch_events_html(max_pages: int = 5) -> Generator[dict, None, None]:
    """Fallback: scrape Shotgun HTML listing page."""

    from bs4 import BeautifulSoup

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    listing_url = f"{BASE_URL}/fr/events?location=paris"

    try:
        resp = httpx.get(listing_url, headers=headers, timeout=30, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:
        print(f"  Error fetching Shotgun HTML: {e}")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.select("[class*='EventCard'], [class*='event-card'], article, .event-item")

    for card in cards:
        title_el = card.select_one("h2, h3, [class*='title'], [class*='name']")
        if not title_el:
            continue

        title = clean_text(title_el.get_text())
        if not title:
            continue

        link_el = card.select_one("a[href]")
        event_url = None
        if link_el and link_el.get("href"):
            href = link_el["href"]
            event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

        # Venue
        venue_el = card.select_one("[class*='venue'], [class*='location']")
        venue_name = clean_text(venue_el.get_text()) if venue_el else None

        # Date
        date_el = card.select_one("time, [class*='date']")
        date_text = date_el.get("datetime") if date_el and date_el.get("datetime") else (clean_text(date_el.get_text()) if date_el else None)

        # Image
        img_el = card.select_one("img[src]")
        image_url = None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src")
            if src and src.startswith("http"):
                image_url = src

        # Price
        price_el = card.select_one("[class*='price']")
        price_text = clean_text(price_el.get_text()) if price_el else None
        price_data = parse_price(price_text)

        slug = generate_slug(title, date_text)

        quality = compute_quality_score(
            title=title, description=None, image_url=image_url,
            start_date=date_text, price_raw=price_text, booking_url=event_url,
        )

        yield {
            "title": title,
            "slug": slug,
            "description": None,
            "short_desc": None,
            "image_url": image_url,
            "start_date": date_text,
            "end_date": None,
            "price_min": price_data["price_min"],
            "price_max": price_data["price_max"],
            "is_free": price_data["is_free"],
            "booking_url": event_url,
            "source": "shotgun",
            "source_url": event_url or listing_url,
            "source_id": slug,
            "venue_name": venue_name,
            "venue_address": None,
            "venue_city": "Paris",
            "venue_zip": None,
            "venue_arrondissement": None,
            "venue_lat": None,
            "venue_lng": None,
            "raw_category": "soirée",
            "category_slug": "concerts",
            "tags": ["soirée", "clubbing", "électro"],
            "quality_score": quality,
        }


def parse_api_event(data: dict) -> Optional[dict]:
    """Parse a Shotgun API event object."""

    title = data.get("name") or data.get("title")
    if not title:
        return None

    title = clean_text(title)
    if not title:
        return None

    # Dates
    start_date = data.get("start_time") or data.get("start_date") or data.get("date")
    end_date = data.get("end_time") or data.get("end_date")

    # Venue
    venue = data.get("venue") or data.get("location") or {}
    venue_name = venue.get("name") if isinstance(venue, dict) else None
    venue_address = venue.get("address") if isinstance(venue, dict) else None
    venue_lat = venue.get("latitude") or venue.get("lat") if isinstance(venue, dict) else None
    venue_lng = venue.get("longitude") or venue.get("lng") if isinstance(venue, dict) else None

    # Image
    image_url = data.get("cover_url") or data.get("image_url") or data.get("flyer_url")
    if not image_url and isinstance(data.get("images"), list) and data["images"]:
        image_url = data["images"][0].get("url") if isinstance(data["images"][0], dict) else data["images"][0]

    # Price
    price_min = 0
    price_max = 0
    is_free = False
    if data.get("price"):
        if isinstance(data["price"], dict):
            price_min = int(float(data["price"].get("min", 0)) * 100)
            price_max = int(float(data["price"].get("max", 0)) * 100)
        elif isinstance(data["price"], (int, float)):
            price_min = price_max = int(float(data["price"]) * 100)
    if data.get("free") or data.get("is_free") or price_min == 0:
        is_free = True

    # URL
    event_url = data.get("url") or data.get("link")
    if not event_url and data.get("slug"):
        event_url = f"{BASE_URL}/fr/events/{data['slug']}"

    description = clean_text(data.get("description"))

    slug = generate_slug(title, start_date)

    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=str(price_min) if price_min else None,
        booking_url=event_url,
    )

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "short_desc": truncate(description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_min,
        "price_max": price_max,
        "is_free": is_free,
        "booking_url": event_url,
        "source": "shotgun",
        "source_url": event_url or f"{BASE_URL}/fr/events?location=paris",
        "source_id": str(data.get("id", slug)),
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": venue_lat,
        "venue_lng": venue_lng,
        "raw_category": data.get("category") or "soirée",
        "category_slug": "concerts",
        "tags": data.get("tags") or ["soirée", "clubbing"],
        "quality_score": quality,
    }
