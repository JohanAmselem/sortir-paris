"""
BilletReduc spider.
Source: https://www.billetreduc.com
Major French discount ticketing platform — excellent for theatre, stand-up,
spectacles, and comedy shows in Paris. Great coverage of small venues.
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

BASE_URL = "https://www.billetreduc.com"

# Multiple listing pages for different categories
LISTING_URLS = [
    (f"{BASE_URL}/theatre-paris.htm", "theatre"),
    (f"{BASE_URL}/humour-paris.htm", "spectacles"),
    (f"{BASE_URL}/spectacle-paris.htm", "spectacles"),
    (f"{BASE_URL}/concert-paris.htm", "concerts"),
    (f"{BASE_URL}/danse-paris.htm", "danse"),
]


def fetch_events(max_pages_per_cat: int = 3) -> Generator[dict, None, None]:
    """Fetch events from BilletReduc."""

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    seen_titles = set()

    for listing_url, default_category in LISTING_URLS:
        print(f"  Fetching BilletReduc: {default_category}...")

        for page in range(1, max_pages_per_cat + 1):
            url = f"{listing_url}?page={page}" if page > 1 else listing_url

            try:
                resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
                resp.raise_for_status()
            except Exception as e:
                print(f"  Error: {e}")
                break

            soup = BeautifulSoup(resp.text, "html.parser")

            cards = soup.select(".spectacle, .show, article, .result-item, .liste-item, tr[class], .billet-item")
            if not cards:
                cards = soup.select("[class*='spectacle'], [class*='billet']")

            if not cards:
                break

            count = 0
            for card in cards:
                event = parse_billetreduc_card(card, default_category)
                if event and event["title"] not in seen_titles:
                    seen_titles.add(event["title"])
                    yield event
                    count += 1

            print(f"    Page {page}: {count} events")
            if count == 0:
                break


def parse_billetreduc_card(card, default_category: str) -> Optional[dict]:
    """Parse a BilletReduc show card."""

    title_el = card.select_one("h2, h3, .titre, .title, a.titre, [class*='titre']")
    if not title_el:
        title_el = card.select_one("a[href*='/spectacle/'], a[href*='/theatre/']")
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
    venue_el = card.select_one(".lieu, .theatre, .venue, [class*='lieu'], [class*='theatre']")
    venue_name = clean_text(venue_el.get_text()) if venue_el else None

    # Date
    date_el = card.select_one(".date, .dates, [class*='date']")
    date_text = clean_text(date_el.get_text()) if date_el else None

    # Try to extract a start date
    start_date = None
    if date_text:
        months_fr = {
            "janvier": 1, "février": 2, "mars": 3, "avril": 4,
            "mai": 5, "juin": 6, "juillet": 7, "août": 8,
            "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        }
        for month_name, month_num in months_fr.items():
            if month_name in date_text.lower():
                day_match = re.search(r"(\d{1,2})\s*" + re.escape(month_name), date_text.lower())
                if day_match:
                    day = int(day_match.group(1))
                    year = datetime.now().year
                    year_match = re.search(r"(\d{4})", date_text)
                    if year_match:
                        year = int(year_match.group(1))
                    try:
                        start_date = datetime(year, month_num, day, 20, 30).isoformat()
                    except ValueError:
                        pass
                break

    # Image
    img_el = card.select_one("img[src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src:
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Price
    price_el = card.select_one(".prix, .price, .tarif, [class*='prix'], [class*='price']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)

    # Rating / note
    rating_el = card.select_one(".note, .rating, [class*='note']")

    # Description
    desc_el = card.select_one(".resume, .description, .synopsis, p")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Category detection
    category_slug = default_category
    all_text = f"{title} {description or ''}".lower()
    if any(kw in all_text for kw in ["humour", "stand-up", "stand up", "one man", "sketch", "comedie"]):
        category_slug = "spectacles"

    slug = generate_slug(title, start_date)

    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=price_text, booking_url=show_url,
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
        "source": "billetreduc",
        "source_url": show_url or BASE_URL,
        "source_id": slug,
        "venue_name": venue_name,
        "venue_address": None,
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": default_category,
        "category_slug": category_slug,
        "tags": [],
        "quality_score": quality,
    }
