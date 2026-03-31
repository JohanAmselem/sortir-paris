"""
DICE spider.
Source: https://dice.fm/partner/discover?location=paris
Major platform for concerts, festivals, and nightlife events.

Uses their public API for event listings.
"""

import httpx
from datetime import datetime
from typing import Generator, Optional

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    compute_quality_score,
)

API_URL = "https://api.dice.fm/v1/events"
BASE_URL = "https://dice.fm"


def fetch_events(days_ahead: int = 60, max_pages: int = 10) -> Generator[dict, None, None]:
    """Fetch events from DICE."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    # Try API first, fallback to HTML
    try:
        resp = httpx.get(
            f"{BASE_URL}/partner/discover",
            params={"location": "paris", "format": "json"},
            headers=headers,
            timeout=30,
            follow_redirects=True,
        )
        if resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
            data = resp.json()
            events = data.get("events") or data.get("data") or data.get("results") or []
            for event_data in events:
                event = parse_api_event(event_data)
                if event:
                    yield event
            return
    except Exception as e:
        print(f"  DICE API not available: {e}")

    # Fallback: scrape HTML
    yield from fetch_events_html(max_pages)


def fetch_events_html(max_pages: int = 5) -> Generator[dict, None, None]:
    """Scrape DICE HTML listing."""
    from bs4 import BeautifulSoup

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    url = f"{BASE_URL}/partner/discover?location=paris"
    print(f"  Fetching DICE HTML listing...")

    try:
        resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:
        print(f"  Error fetching DICE: {e}")
        return

    soup = BeautifulSoup(resp.text, "html.parser")

    # DICE uses React — look for JSON data in script tags
    for script in soup.select("script[type='application/json'], script#__NEXT_DATA__"):
        try:
            import json
            data = json.loads(script.string or "")
            # Navigate through Next.js data structure
            props = data.get("props", {}).get("pageProps", {})
            events = props.get("events") or props.get("initialEvents") or props.get("data", {}).get("events") or []
            for event_data in events:
                event = parse_api_event(event_data)
                if event:
                    yield event
            if events:
                return
        except (json.JSONDecodeError, AttributeError):
            continue

    # Standard HTML parsing
    cards = soup.select("[class*='EventCard'], [class*='event-card'], article, [data-testid*='event']")
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

        venue_el = card.select_one("[class*='venue'], [class*='location']")
        venue_name = clean_text(venue_el.get_text()) if venue_el else None

        date_el = card.select_one("time, [class*='date']")
        date_text = date_el.get("datetime") if date_el and date_el.get("datetime") else None

        img_el = card.select_one("img[src]")
        image_url = None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src")
            if src and src.startswith("http"):
                image_url = src

        price_el = card.select_one("[class*='price']")
        price_text = clean_text(price_el.get_text()) if price_el else None

        slug = generate_slug(title, date_text)
        quality = compute_quality_score(title=title, description=None, image_url=image_url, start_date=date_text, price_raw=price_text, booking_url=event_url)

        yield {
            "title": title, "slug": slug, "description": None, "short_desc": None,
            "image_url": image_url, "start_date": date_text, "end_date": None,
            "price_min": 0, "price_max": 0, "is_free": False,
            "booking_url": event_url, "source": "dice",
            "source_url": event_url or url, "source_id": slug,
            "venue_name": venue_name, "venue_address": None,
            "venue_city": "Paris", "venue_zip": None, "venue_arrondissement": None,
            "venue_lat": None, "venue_lng": None,
            "raw_category": "concert", "category_slug": "concerts",
            "tags": ["concert", "live"], "quality_score": quality,
        }


def parse_api_event(data: dict) -> Optional[dict]:
    """Parse a DICE API event."""
    title = data.get("name") or data.get("title")
    if not title:
        return None

    title = clean_text(title)
    if not title:
        return None

    start_date = data.get("date") or data.get("start_time") or data.get("doors_open")
    end_date = data.get("end_time") or data.get("end_date")

    venue = data.get("venue") or data.get("location") or {}
    venue_name = venue.get("name") if isinstance(venue, dict) else str(venue) if venue else None
    venue_address = venue.get("address") if isinstance(venue, dict) else None
    venue_lat = venue.get("latitude") or venue.get("lat") if isinstance(venue, dict) else None
    venue_lng = venue.get("longitude") or venue.get("lng") if isinstance(venue, dict) else None

    image_url = data.get("image_url") or data.get("cover_image") or data.get("apple_music_image")
    if isinstance(data.get("images"), list) and data["images"]:
        image_url = data["images"][0].get("url") if isinstance(data["images"][0], dict) else data["images"][0]

    price_min = price_max = 0
    is_free = False
    if data.get("price"):
        if isinstance(data["price"], dict):
            price_min = int(float(data["price"].get("min", 0)) * 100)
            price_max = int(float(data["price"].get("max", price_min / 100)) * 100)
        elif isinstance(data["price"], (int, float)):
            price_min = price_max = int(float(data["price"]) * 100)
    if data.get("is_free") or data.get("free"):
        is_free = True

    event_url = data.get("url") or data.get("link")
    if not event_url and data.get("slug"):
        event_url = f"{BASE_URL}/event/{data['slug']}"

    description = clean_text(data.get("description") or data.get("about"))
    slug = generate_slug(title, start_date)
    quality = compute_quality_score(title=title, description=description, image_url=image_url, start_date=start_date, price_raw=str(price_min) if price_min else None, booking_url=event_url)

    return {
        "title": title, "slug": slug, "description": description, "short_desc": truncate(description),
        "image_url": image_url, "start_date": start_date, "end_date": end_date,
        "price_min": price_min, "price_max": price_max, "is_free": is_free,
        "booking_url": event_url, "source": "dice",
        "source_url": event_url or f"{BASE_URL}/partner/discover?location=paris",
        "source_id": str(data.get("id", slug)),
        "venue_name": venue_name, "venue_address": venue_address,
        "venue_city": "Paris", "venue_zip": None, "venue_arrondissement": None,
        "venue_lat": venue_lat, "venue_lng": venue_lng,
        "raw_category": data.get("genre") or data.get("category") or "concert",
        "category_slug": "concerts",
        "tags": data.get("tags") or data.get("genres") or ["concert", "live"],
        "quality_score": quality,
    }
