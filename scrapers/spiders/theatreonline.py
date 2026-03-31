"""
TheatreOnline spider.
Source: https://www.theatreonline.com
Major French theatre ticketing platform — excellent coverage of Paris theatres.

Scrapes current shows in Paris.
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

BASE_URL = "https://www.theatreonline.com"
LISTING_URL = f"{BASE_URL}/guide/paris"


def fetch_events(max_pages: int = 10) -> Generator[dict, None, None]:
    """Fetch theatre shows from TheatreOnline."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    for page in range(1, max_pages + 1):
        url = f"{LISTING_URL}?page={page}" if page > 1 else LISTING_URL
        print(f"  Fetching TheatreOnline page {page}...")

        try:
            resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            print(f"  Error fetching page {page}: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find show cards
        show_cards = soup.select(".show-card, .spectacle, article, .liste-spectacle .item, .show-item")
        if not show_cards:
            show_cards = soup.select("[class*='spectacle'], [class*='show']")

        if not show_cards:
            print(f"  No shows found on page {page}, stopping")
            break

        count = 0
        for card in show_cards:
            event = parse_show_card(card)
            if event:
                yield event
                count += 1

        print(f"  Found {count} shows on page {page}")
        if count == 0:
            break


def parse_show_card(card) -> Optional[dict]:
    """Parse a single show card."""

    # Title
    title_el = card.select_one("h2, h3, .title, .show-title, .spectacle-titre, a[title]")
    if not title_el:
        return None

    title = clean_text(title_el.get_text())
    if not title or len(title) < 3:
        return None

    # Link
    link_el = card.select_one("a[href]")
    show_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        show_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Venue
    venue_el = card.select_one(".venue, .theatre, .lieu, [class*='theatre'], [class*='lieu']")
    venue_name = clean_text(venue_el.get_text()) if venue_el else None

    # Date
    date_el = card.select_one(".date, .dates, time, [class*='date']")
    date_text = clean_text(date_el.get_text()) if date_el else None
    start_date = parse_theatre_date(date_text) if date_text else None

    # Image
    img_el = card.select_one("img[src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src") or img_el.get("data-lazy-src")
        if src:
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Price
    price_el = card.select_one(".price, .tarif, [class*='prix'], [class*='price']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)

    # Category / genre
    genre_el = card.select_one(".genre, .category, [class*='genre']")
    genre_text = clean_text(genre_el.get_text()) if genre_el else None

    # Description
    desc_el = card.select_one(".description, .resume, .synopsis, p")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Detect sub-category
    category_slug = "theatre"
    all_text = f"{title} {genre_text or ''} {description or ''}".lower()
    if any(kw in all_text for kw in ["humour", "stand-up", "stand up", "one man", "one woman", "sketch"]):
        category_slug = "spectacles"

    slug = generate_slug(title, start_date)

    quality = compute_quality_score(
        title=title,
        description=description,
        image_url=image_url,
        start_date=start_date,
        price_raw=price_text,
        booking_url=show_url,
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
        "booking_url": show_url,
        "source": "theatreonline",
        "source_url": show_url or LISTING_URL,
        "source_id": slug,
        "venue_name": venue_name,
        "venue_address": None,
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": genre_text or "théâtre",
        "category_slug": category_slug,
        "tags": [genre_text] if genre_text else ["théâtre"],
        "quality_score": quality,
    }


def parse_theatre_date(text: str) -> Optional[str]:
    """Parse theatre date ranges like 'Du 15 mars au 30 avril 2026'."""
    if not text:
        return None

    text = text.strip().lower()

    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
    }

    # Try "du DD month au DD month YYYY" — use the start date
    for month_name, month_num in months_fr.items():
        if month_name in text:
            day_match = re.search(r"(\d{1,2})\s*" + re.escape(month_name), text)
            if day_match:
                day = int(day_match.group(1))
                year = datetime.now().year
                year_match = re.search(r"(\d{4})", text)
                if year_match:
                    year = int(year_match.group(1))
                try:
                    return datetime(year, month_num, day, 20, 30).isoformat()
                except ValueError:
                    pass
                break

    return None
