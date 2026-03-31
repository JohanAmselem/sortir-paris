"""
New Morning spider.
Source: https://www.newmorning.com/programmation
Legendary Paris jazz/world music venue.

Scrapes the programming page for upcoming concerts.
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
    compute_quality_score,
)

BASE_URL = "https://www.newmorning.com"
PROG_URL = f"{BASE_URL}/programmation"


def fetch_events(max_pages: int = 5) -> Generator[dict, None, None]:
    """Fetch concerts from New Morning website."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    for page in range(1, max_pages + 1):
        url = f"{PROG_URL}?page={page}" if page > 1 else PROG_URL
        print(f"  Fetching New Morning page {page}...")

        try:
            resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            print(f"  Error fetching page {page}: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find event cards — New Morning uses article or div elements for events
        event_cards = soup.select("article.event, .event-card, .programmation-item, .views-row")
        if not event_cards:
            # Try alternative selectors
            event_cards = soup.select("[class*='event'], [class*='concert'], .node--type-event")

        if not event_cards:
            print(f"  No events found on page {page}, stopping")
            break

        count = 0
        for card in event_cards:
            event = parse_event_card(card)
            if event:
                yield event
                count += 1

        print(f"  Found {count} events on page {page}")

        if count == 0:
            break


def parse_event_card(card) -> Optional[dict]:
    """Parse a single event card from New Morning."""

    # Title
    title_el = card.select_one("h2, h3, .event-title, .title, .field--name-title")
    if not title_el:
        title_el = card.select_one("a[href*='/event'], a[href*='/concert']")
    if not title_el:
        return None

    title = clean_text(title_el.get_text())
    if not title:
        return None

    # Link
    link_el = card.select_one("a[href]")
    event_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Date
    date_el = card.select_one(".date, .event-date, time, [class*='date'], .field--name-field-date")
    date_text = clean_text(date_el.get_text()) if date_el else None
    start_date = parse_french_date(date_text) if date_text else None

    # Image
    img_el = card.select_one("img[src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src:
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Price
    price_el = card.select_one(".price, .tarif, [class*='price'], [class*='tarif']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)

    # Description
    desc_el = card.select_one(".description, .body, .summary, p, .field--name-body")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Build normalized event
    slug = generate_slug(title, start_date)

    quality = compute_quality_score(
        title=title,
        description=description,
        image_url=image_url,
        start_date=start_date,
        price_raw=price_text,
        booking_url=event_url,
    )

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "short_desc": truncate(description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": None,
        "price_min": price_data["price_min"],
        "price_max": price_data["price_max"],
        "is_free": price_data["is_free"],
        "booking_url": event_url,
        "source": "newmorning",
        "source_url": event_url or PROG_URL,
        "source_id": slug,
        "venue_name": "New Morning",
        "venue_address": "7-9 Rue des Petites-Écuries",
        "venue_city": "Paris",
        "venue_zip": "75010",
        "venue_arrondissement": "10e",
        "venue_lat": 48.8719,
        "venue_lng": 2.3492,
        "raw_category": "concert",
        "category_slug": "concerts",
        "tags": ["jazz", "musique live", "new morning"],
        "quality_score": quality,
    }


def parse_french_date(text: str) -> Optional[str]:
    """Parse French date strings like 'Mar 15 avril 2026' or '15/04/2026'."""

    if not text:
        return None

    text = text.strip().lower()

    # Try DD/MM/YYYY
    match = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text)
    if match:
        day, month, year = match.groups()
        try:
            return datetime(int(year), int(month), int(day), 20, 0).isoformat()
        except ValueError:
            pass

    # French month names
    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "janv": 1, "févr": 2, "avr": 4, "juil": 7, "sept": 9, "oct": 10, "nov": 11, "déc": 12,
    }

    for month_name, month_num in months_fr.items():
        if month_name in text:
            day_match = re.search(r"(\d{1,2})", text)
            if day_match:
                day = int(day_match.group(1))
                year = datetime.now().year
                year_match = re.search(r"(\d{4})", text)
                if year_match:
                    year = int(year_match.group(1))
                try:
                    # Default time 20h for concerts
                    return datetime(year, month_num, day, 20, 0).isoformat()
                except ValueError:
                    pass
                break

    return None
