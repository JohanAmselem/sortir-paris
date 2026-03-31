"""
Timeout Paris spider.
Source: https://www.timeout.com/paris/things-to-do
Major international events guide — excellent curated content for Paris.

Scrapes their "Things to do" listings for events, expos, concerts, etc.
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

BASE_URL = "https://www.timeout.com"

LISTING_PAGES = [
    (f"{BASE_URL}/paris/things-to-do", None),
    (f"{BASE_URL}/paris/music", "concerts"),
    (f"{BASE_URL}/paris/theatre", "theatre"),
    (f"{BASE_URL}/paris/art/best-exhibitions-in-paris", "expos"),
    (f"{BASE_URL}/paris/nightlife", "concerts"),
    (f"{BASE_URL}/paris/things-to-do/free-things-to-do-in-paris", None),
]


def fetch_events(max_pages: int = 3) -> Generator[dict, None, None]:
    """Fetch events from Timeout Paris."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    }

    seen_slugs = set()

    for listing_url, default_category in LISTING_PAGES:
        print(f"  Fetching Timeout: {listing_url.split('/')[-1]}...")

        for page in range(1, max_pages + 1):
            url = f"{listing_url}?page={page}" if page > 1 else listing_url

            try:
                resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
                resp.raise_for_status()
            except Exception as e:
                print(f"  Error: {e}")
                break

            soup = BeautifulSoup(resp.text, "html.parser")

            cards = soup.select("article, .card, [class*='tile'], [class*='Card'], [data-testid*='card']")
            if not cards:
                cards = soup.select("[class*='article'], [class*='listing-item']")

            if not cards:
                break

            count = 0
            for card in cards:
                event = parse_timeout_card(card, default_category)
                if event and event["slug"] not in seen_slugs:
                    seen_slugs.add(event["slug"])
                    yield event
                    count += 1

            print(f"    Page {page}: {count} events")
            if count == 0:
                break


def parse_timeout_card(card, default_category: Optional[str]) -> Optional[dict]:
    """Parse a Timeout card element."""

    title_el = card.select_one("h2, h3, [class*='title'], [class*='heading']")
    if not title_el:
        return None

    title = clean_text(title_el.get_text())
    if not title or len(title) < 5:
        return None

    # Skip listicle titles like "12 best things to do..."
    if re.match(r"^\d+\s+(best|top|meilleur)", title.lower()):
        return None

    # Link
    link_el = card.select_one("a[href]")
    event_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Skip non-event links (listicles, guides)
    if event_url and any(x in event_url for x in ["/best-", "/top-", "/guide"]):
        return None

    # Venue
    venue_el = card.select_one("[class*='venue'], [class*='location'], [class*='address']")
    venue_name = clean_text(venue_el.get_text()) if venue_el else None

    # Date
    date_el = card.select_one("time, [class*='date'], [class*='when']")
    date_text = None
    if date_el:
        date_text = date_el.get("datetime") or clean_text(date_el.get_text())

    # Image
    img_el = card.select_one("img[src], img[data-src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src") or img_el.get("data-lazy-src")
        if src and src.startswith("http"):
            image_url = src

    # Price
    price_el = card.select_one("[class*='price'], [class*='cost']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)

    # Free detection
    is_free = price_data["is_free"]
    all_text = f"{title} {price_text or ''}".lower()
    if "gratuit" in all_text or "free" in all_text or "entrée libre" in all_text:
        is_free = True

    # Description
    desc_el = card.select_one("[class*='summary'], [class*='description'], [class*='excerpt'], p")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Category
    category_slug = default_category or detect_category(None, title, description)

    slug = generate_slug(title, date_text)
    quality = compute_quality_score(title=title, description=description, image_url=image_url, start_date=date_text, price_raw=price_text, booking_url=event_url)

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description),
        "image_url": image_url, "start_date": date_text, "end_date": None,
        "price_min": price_data["price_min"], "price_max": price_data["price_max"],
        "is_free": is_free,
        "booking_url": event_url, "source": "timeout",
        "source_url": event_url or BASE_URL, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None, "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }
