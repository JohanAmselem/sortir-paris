"""
Paris.fr spider.
Source: https://www.paris.fr/evenements
Official City of Paris events portal.

Scrapes the events listing from the city's official website.
Excellent coverage of municipal events, free activities, sports, culture.
"""

import httpx
import re
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

BASE_URL = "https://www.paris.fr"
LISTING_URL = f"{BASE_URL}/evenements"


def fetch_events(max_pages: int = 5) -> Generator[dict, None, None]:
    """Fetch events from Paris.fr."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    seen_slugs = set()

    for page in range(1, max_pages + 1):
        url = f"{LISTING_URL}?page={page}" if page > 1 else LISTING_URL
        print(f"  Fetching Paris.fr page {page}...")

        try:
            resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            print(f"  Error: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")

        cards = soup.select("article, .event-card, .card, .listing-item, [class*='evenement']")
        if not cards:
            cards = soup.select("[class*='card'], [class*='event'], [class*='article']")

        if not cards:
            print(f"  No events on page {page}, stopping")
            break

        count = 0
        for card in cards:
            event = parse_paris_card(card)
            if event and event["slug"] not in seen_slugs:
                seen_slugs.add(event["slug"])
                yield event
                count += 1

        print(f"  Found {count} events on page {page}")
        if count == 0:
            break


def parse_paris_card(card) -> Optional[dict]:
    """Parse a Paris.fr event card."""

    title_el = card.select_one("h2, h3, .title, [class*='title'], [class*='heading']")
    if not title_el:
        return None

    title = clean_text(title_el.get_text())
    if not title or len(title) < 5:
        return None

    # Link
    link_el = card.select_one("a[href]")
    event_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Venue / location
    venue_el = card.select_one(".lieu, .location, .venue, [class*='lieu'], [class*='location'], [class*='address']")
    venue_name = clean_text(venue_el.get_text()) if venue_el else None

    # Arrondissement
    arrondissement = None
    if venue_name:
        arr_match = re.search(r"(\d{1,2})(?:e|er|ème)\s*(?:arr)?", venue_name.lower())
        if arr_match:
            arrondissement = f"{arr_match.group(1)}e"

    # Date
    date_el = card.select_one("time, .date, [class*='date']")
    date_text = None
    start_date = None
    if date_el:
        date_text = date_el.get("datetime") or clean_text(date_el.get_text())
        start_date = parse_paris_date(date_text) if date_text else None

    # Image
    img_el = card.select_one("img[src], img[data-src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src:
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Price — most city events are free
    price_el = card.select_one(".prix, .price, [class*='prix'], [class*='price']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)
    is_free = price_data["is_free"]
    if "gratuit" in (title + " " + (price_text or "")).lower():
        is_free = True

    # Description
    desc_el = card.select_one(".description, .resume, .excerpt, p, .chapeau")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Category detection
    category_slug = detect_category(None, title, description)

    # Sport detection
    sport_kw = ["sport", "course", "yoga", "fitness", "gym", "running", "marathon", "natation", "basketball", "foot", "tennis", "boxe", "danse sportive", "vélo", "escalade"]
    all_text = f"{title} {description or ''}".lower()
    if any(kw in all_text for kw in sport_kw):
        category_slug = "sport"

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(title=title, description=description, image_url=image_url, start_date=start_date, price_raw=price_text, booking_url=event_url)

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description),
        "image_url": image_url, "start_date": start_date, "end_date": None,
        "price_min": price_data["price_min"], "price_max": price_data["price_max"],
        "is_free": is_free,
        "booking_url": event_url, "source": "paris_fr",
        "source_url": event_url or LISTING_URL, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": arrondissement,
        "venue_lat": None, "venue_lng": None,
        "raw_category": None, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_paris_date(text: str) -> Optional[str]:
    """Parse Paris.fr date formats."""
    if not text:
        return None

    text = text.strip()

    # ISO
    iso_match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if iso_match:
        return f"{iso_match.group(1)}T10:00:00"

    text_lower = text.lower()
    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
    }

    for month_name, month_num in months_fr.items():
        if month_name in text_lower:
            day_match = re.search(r"(\d{1,2})\s*" + re.escape(month_name), text_lower)
            if day_match:
                day = int(day_match.group(1))
                year = datetime.now().year
                year_match = re.search(r"(\d{4})", text)
                if year_match:
                    year = int(year_match.group(1))
                try:
                    return datetime(year, month_num, day, 10, 0).isoformat()
                except ValueError:
                    pass
            break

    return None
