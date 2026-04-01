"""
Eventbrite Paris spider.
Source: https://www.eventbrite.fr/d/france--paris/events/
Major event ticketing platform — concerts, soirées, ateliers, expos, sport.

Scrapes listings via embedded JSON-LD structured data and HTML fallback.
Multiple category pages for broad coverage.
"""

import httpx
import re
import json
from datetime import datetime
from typing import Generator, Optional
from bs4 import BeautifulSoup

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)

BASE_URL = "https://www.eventbrite.fr"

# Category-specific listing URLs for comprehensive coverage
LISTING_URLS = [
    "/d/france--paris/events/",
    "/d/france--paris/music--events/",
    "/d/france--paris/performing-arts--events/",
    "/d/france--paris/arts--events/",
    "/d/france--paris/nightlife--events/",
    "/d/france--paris/film-and-media--events/",
    "/d/france--paris/sports-and-fitness--events/",
    "/d/france--paris/food-and-drink--events/",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_events(max_pages: int = 5) -> Generator[dict, None, None]:
    """Fetch events from Eventbrite Paris."""

    seen_slugs = set()

    for listing_path in LISTING_URLS:
        for page in range(1, max_pages + 1):
            url = f"{BASE_URL}{listing_path}"
            if page > 1:
                url += f"?page={page}"

            cat_name = listing_path.split("/")[-2] if listing_path != "/d/france--paris/events/" else "all"
            print(f"  Fetching Eventbrite {cat_name} page {page}...")

            try:
                resp = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
                resp.raise_for_status()
            except Exception as e:
                print(f"  Error: {e}")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            count = 0

            # Strategy 1: Extract from JSON-LD
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    data = json.loads(script.string or "")
                    events_data = []
                    if isinstance(data, list):
                        events_data = data
                    elif isinstance(data, dict):
                        if data.get("@type") == "Event":
                            events_data = [data]
                        elif "itemListElement" in data:
                            events_data = [item.get("item", item) for item in data["itemListElement"] if isinstance(item, dict)]

                    for ev in events_data:
                        if ev.get("@type") != "Event":
                            continue
                        event = parse_jsonld_event(ev)
                        if event and event["slug"] not in seen_slugs:
                            seen_slugs.add(event["slug"])
                            yield event
                            count += 1
                except (json.JSONDecodeError, TypeError):
                    continue

            # Strategy 2: Extract from __SERVER_DATA__
            if count == 0:
                for script in soup.select("script"):
                    text = script.string or ""
                    if "__SERVER_DATA__" in text or "window.__NEXT_DATA__" in text:
                        try:
                            json_match = re.search(r'=\s*({.+?})\s*;?\s*$', text, re.DOTALL)
                            if json_match:
                                server_data = json.loads(json_match.group(1))
                                for event in extract_from_server_data(server_data, seen_slugs):
                                    yield event
                                    count += 1
                        except (json.JSONDecodeError, TypeError):
                            continue

            # Strategy 3: Parse HTML cards
            if count == 0:
                cards = soup.select("[class*='event-card'], [class*='eds-card'], article, [data-testid*='event']")
                for card in cards:
                    try:
                        event = parse_html_card(card)
                        if event and event["slug"] not in seen_slugs:
                            seen_slugs.add(event["slug"])
                            yield event
                            count += 1
                    except Exception:
                        continue

            print(f"  Found {count} events")
            if count == 0:
                break


def parse_jsonld_event(data: dict) -> Optional[dict]:
    """Parse a JSON-LD Event object."""
    title = data.get("name", "")
    if not title or len(title) < 3:
        return None

    description = clean_text(data.get("description", ""))
    image_url = None
    if data.get("image"):
        img = data["image"]
        if isinstance(img, list):
            image_url = img[0] if img else None
        elif isinstance(img, str):
            image_url = img
        elif isinstance(img, dict):
            image_url = img.get("url")

    # Dates
    start_date = data.get("startDate")
    end_date = data.get("endDate")
    if start_date:
        try:
            start_date = datetime.fromisoformat(start_date.replace("Z", "+00:00")).isoformat()
        except (ValueError, AttributeError):
            pass

    if end_date:
        try:
            end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00")).isoformat()
        except (ValueError, AttributeError):
            end_date = None

    # Location
    venue_name = None
    venue_address = None
    venue_city = "Paris"
    venue_zip = None
    venue_lat = None
    venue_lng = None
    arrondissement = None

    location = data.get("location", {})
    if isinstance(location, dict):
        venue_name = location.get("name")
        address = location.get("address", {})
        if isinstance(address, dict):
            venue_address = address.get("streetAddress")
            venue_city = address.get("addressLocality", "Paris")
            venue_zip = address.get("postalCode")
        elif isinstance(address, str):
            venue_address = address
        geo = location.get("geo", {})
        if isinstance(geo, dict):
            venue_lat = geo.get("latitude")
            venue_lng = geo.get("longitude")

    if venue_zip and re.match(r"750\d{2}", venue_zip):
        arr_num = int(venue_zip[-2:])
        if 1 <= arr_num <= 20:
            arrondissement = f"{arr_num}e"
    elif venue_address:
        arr_match = re.search(r"750(\d{2})", venue_address)
        if arr_match:
            arr_num = int(arr_match.group(1))
            if 1 <= arr_num <= 20:
                arrondissement = f"{arr_num}e"

    # Price
    price_min = 0
    price_max = 0
    is_free = False
    offers = data.get("offers", {})
    if isinstance(offers, dict):
        price_val = offers.get("price")
        if price_val is not None:
            try:
                price_min = int(float(price_val) * 100)
                price_max = price_min
            except (ValueError, TypeError):
                pass
        if offers.get("priceCurrency") == "EUR" and price_min == 0:
            is_free = True
    elif isinstance(offers, list):
        prices = []
        for offer in offers:
            p = offer.get("price")
            if p is not None:
                try:
                    prices.append(int(float(p) * 100))
                except (ValueError, TypeError):
                    pass
        if prices:
            price_min = min(prices)
            price_max = max(prices)
            is_free = price_min == 0
        else:
            is_free = True

    event_url = data.get("url", "")
    category_slug = detect_category(None, title, description)

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=str(price_min) if price_min else None,
        booking_url=event_url,
    )

    # Extract source_id from URL
    source_id = slug
    id_match = re.search(r"-(\d+)(?:\?|$)", event_url)
    if id_match:
        source_id = f"eb-{id_match.group(1)}"

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description),
        "image_url": image_url, "start_date": start_date, "end_date": end_date,
        "price_min": price_min, "price_max": price_max, "is_free": is_free,
        "booking_url": event_url, "source": "eventbrite",
        "source_url": event_url, "source_id": source_id,
        "venue_name": venue_name, "venue_address": venue_address,
        "venue_city": venue_city, "venue_zip": venue_zip,
        "venue_arrondissement": arrondissement,
        "venue_lat": venue_lat, "venue_lng": venue_lng,
        "raw_category": None, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def extract_from_server_data(data: dict, seen_slugs: set) -> Generator[dict, None, None]:
    """Recursively search server data for event objects."""

    def find_events(obj, depth=0):
        if depth > 10:
            return
        if isinstance(obj, dict):
            if obj.get("@type") == "Event" or (obj.get("name") and obj.get("startDate")):
                event = parse_jsonld_event(obj)
                if event and event["slug"] not in seen_slugs:
                    seen_slugs.add(event["slug"])
                    yield event
            else:
                for v in obj.values():
                    yield from find_events(v, depth + 1)
        elif isinstance(obj, list):
            for item in obj:
                yield from find_events(item, depth + 1)

    yield from find_events(data)


def parse_html_card(card) -> Optional[dict]:
    """Fallback: parse an HTML event card."""
    # Title
    title_el = card.select_one("h2, h3, [class*='title']")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 5:
        return None

    # Link
    link_el = card.select_one("a[href*='/e/'], a[href*='eventbrite']")
    if card.name == "a":
        link_el = card
    event_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Image
    img_el = card.select_one("img[src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src and "img.evbuc.com" in src:
            image_url = src

    # Date text
    date_text = None
    for el in card.select("time, [class*='date'], [class*='time']"):
        date_text = el.get("datetime") or clean_text(el.get_text())
        if date_text:
            break

    start_date = None
    if date_text:
        try:
            start_date = datetime.fromisoformat(date_text).isoformat()
        except (ValueError, TypeError):
            start_date = parse_french_date(date_text)

    # Venue
    venue_name = None
    venue_el = card.select_one("[class*='venue'], [class*='location']")
    if venue_el:
        venue_name = clean_text(venue_el.get_text())

    category_slug = detect_category(None, title)
    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=None, image_url=image_url,
        start_date=start_date, price_raw=None, booking_url=event_url,
    )

    return {
        "title": title, "slug": slug, "description": None,
        "short_desc": None,
        "image_url": image_url, "start_date": start_date, "end_date": None,
        "price_min": 0, "price_max": 0, "is_free": False,
        "booking_url": event_url, "source": "eventbrite",
        "source_url": event_url or BASE_URL, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": None, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_french_date(text: str) -> Optional[str]:
    """Parse French date strings."""
    if not text:
        return None
    months = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "janv": 1, "févr": 2, "avr": 4, "juil": 7,
        "sept": 9, "oct": 10, "nov": 11, "déc": 12,
    }
    text_lower = text.lower()
    for month_name, month_num in months.items():
        if month_name in text_lower:
            day_match = re.search(r"(\d{1,2})\s*" + re.escape(month_name), text_lower)
            if day_match:
                day = int(day_match.group(1))
                year = datetime.now().year
                year_match = re.search(r"(\d{4})", text)
                if year_match:
                    year = int(year_match.group(1))
                # Time
                hour, minute = 20, 0
                time_match = re.search(r"(\d{1,2})[h:](\d{2})?", text_lower)
                if time_match:
                    hour = int(time_match.group(1))
                    minute = int(time_match.group(2) or 0)
                try:
                    return datetime(year, month_num, day, hour, minute).isoformat()
                except ValueError:
                    pass
    return None
