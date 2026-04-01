"""
Que Faire à Paris spider.
Source: https://quefaire.paris.fr
Official City of Paris cultural events platform — powered by Algolia search.

Scrapes the listing pages and event detail pages from the city's official
cultural portal. Very comprehensive coverage of all event types.
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

BASE_URL = "https://quefaire.paris.fr"

# Category listing pages to scrape
CATEGORY_PAGES = [
    ("/fiches/all", None),  # All events
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_events(max_pages: int = 10) -> Generator[dict, None, None]:
    """Fetch events from Que Faire à Paris."""

    seen_slugs = set()

    # Try the main listing page with pagination
    for page in range(0, max_pages):
        offset = page * 20
        url = f"{BASE_URL}/fiches/all?offset={offset}" if offset > 0 else f"{BASE_URL}/fiches/all"
        print(f"  Fetching QueFaire page {page + 1} (offset={offset})...")

        try:
            resp = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            print(f"  Error fetching page: {e}")
            # Try alternative URL structure
            try:
                alt_url = f"{BASE_URL}/recherche?page={page + 1}"
                resp = httpx.get(alt_url, headers=HEADERS, timeout=30, follow_redirects=True)
                resp.raise_for_status()
            except Exception as e2:
                print(f"  Alt URL also failed: {e2}")
                break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Try multiple card selectors
        cards = soup.select(".qfap-search-hit, .event-card, .fiche, article, .card, [class*='evenement'], [class*='fiche']")
        if not cards:
            cards = soup.select("a[href*='/evenements/'], a[href*='/fiches/']")

        if not cards:
            print(f"  No events on page {page + 1}, stopping")
            break

        count = 0
        for card in cards:
            try:
                event = parse_quefaire_card(card, soup)
                if event and event["slug"] not in seen_slugs:
                    seen_slugs.add(event["slug"])
                    yield event
                    count += 1
            except Exception as e:
                print(f"  Error parsing card: {e}")
                continue

        print(f"  Found {count} events on page {page + 1}")
        if count == 0:
            break

    # Also try the main paris.fr/quefaire page
    if len(seen_slugs) < 20:
        yield from fetch_from_paris_fr(seen_slugs, max_pages=max_pages)


def fetch_from_paris_fr(seen_slugs: set, max_pages: int = 5) -> Generator[dict, None, None]:
    """Fallback: scrape from paris.fr/quefaire pages."""
    categories = [
        ("concert", "concert"),
        ("expo", "expo"),
        ("theatre", "theatre"),
        ("sport", "sport"),
        ("nuit", "spectacle"),
        ("ecrans", "cinema"),
    ]

    for cat_path, cat_slug in categories:
        url = f"https://www.paris.fr/quefaire/{cat_path}"
        print(f"  Fetching paris.fr/quefaire/{cat_path}...")

        try:
            resp = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            print(f"  Error: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find event links
        links = soup.select("a[href*='/evenements/']")
        count = 0
        for link in links:
            href = link.get("href", "")
            if not href or href in seen_slugs:
                continue

            try:
                event = parse_event_from_link(link, cat_slug)
                if event and event["slug"] not in seen_slugs:
                    seen_slugs.add(event["slug"])
                    yield event
                    count += 1
            except Exception as e:
                continue

        print(f"  Found {count} events in {cat_path}")


def parse_quefaire_card(card, soup) -> Optional[dict]:
    """Parse a QueFaire event card."""

    # Title
    title_el = card.select_one(".qfap-search-hit-title, h2, h3, .title, [class*='title']")
    if not title_el:
        # Maybe the card itself is a link
        title_text = clean_text(card.get_text())
        if title_text and len(title_text) > 5 and len(title_text) < 200:
            title = title_text
        else:
            return None
    else:
        title = clean_text(title_el.get_text())

    if not title or len(title) < 5:
        return None

    # Link
    link_el = card.select_one("a[href], .qfap-search-hit-link")
    if card.name == "a":
        link_el = card
    event_url = None
    if link_el and link_el.get("href"):
        href = link_el["href"]
        if href.startswith("http"):
            event_url = href
        elif href.startswith("/"):
            event_url = f"{BASE_URL}{href}"

    # Date
    date_el = card.select_one(".qfap-search-hit-date, .date, time, [class*='date']")
    date_text = None
    start_date = None
    end_date = None
    if date_el:
        date_text = clean_text(date_el.get_text())
        dates = parse_quefaire_dates(date_text)
        start_date = dates[0]
        end_date = dates[1]

    # Image
    img_el = card.select_one("img[src], img[data-src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src and not src.startswith("data:"):
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Description / audience
    desc_el = card.select_one(".qfap-search-hit-audience, .description, p, .resume")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Category from card content
    raw_category = None
    cat_el = card.select_one("mark, .category, [class*='category']")
    if cat_el:
        raw_category = clean_text(cat_el.get_text())

    category_slug = detect_category(raw_category, title, description)

    # Venue — often embedded in text
    venue_name = None
    venue_el = card.select_one(".lieu, .location, [class*='lieu'], [class*='location']")
    if venue_el:
        venue_name = clean_text(venue_el.get_text())

    # Arrondissement
    arrondissement = None
    all_text = f"{venue_name or ''} {event_url or ''}"
    arr_match = re.search(r"paris[- ]?(\d{1,2})(?:e|er|ème)?", all_text.lower())
    if arr_match:
        arrondissement = f"{arr_match.group(1)}e"

    # Price
    price_el = card.select_one(".prix, .price, [class*='prix'], [class*='price'], [class*='tarif']")
    price_text = clean_text(price_el.get_text()) if price_el else None
    price_data = parse_price(price_text)
    is_free = price_data["is_free"]
    if "gratuit" in (title + " " + (description or "")).lower():
        is_free = True

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=price_text, booking_url=event_url,
    )

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description),
        "image_url": image_url, "start_date": start_date, "end_date": end_date,
        "price_min": price_data["price_min"], "price_max": price_data["price_max"],
        "is_free": is_free,
        "booking_url": event_url, "source": "quefaire_paris",
        "source_url": event_url or BASE_URL, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": arrondissement,
        "venue_lat": None, "venue_lng": None,
        "raw_category": raw_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_event_from_link(link_el, default_category: str) -> Optional[dict]:
    """Parse a simple event link into an event dict."""
    href = link_el.get("href", "")
    title = clean_text(link_el.get_text())

    if not title or len(title) < 5:
        return None

    event_url = href if href.startswith("http") else f"https://www.paris.fr{href}"

    # Image nearby
    img = link_el.select_one("img")
    image_url = None
    if img:
        src = img.get("src") or img.get("data-src")
        if src:
            image_url = src if src.startswith("http") else f"https://www.paris.fr{src}"

    slug = generate_slug(title)
    category_slug = detect_category(default_category, title) or default_category

    quality = compute_quality_score(
        title=title, description=None, image_url=image_url,
        start_date=None, price_raw=None, booking_url=event_url,
    )

    return {
        "title": title, "slug": slug, "description": None,
        "short_desc": None,
        "image_url": image_url, "start_date": None, "end_date": None,
        "price_min": 0, "price_max": 0, "is_free": False,
        "booking_url": event_url, "source": "quefaire_paris",
        "source_url": event_url, "source_id": slug,
        "venue_name": None, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_quefaire_dates(text: str) -> tuple[Optional[str], Optional[str]]:
    """Parse QueFaire date formats.

    Examples:
        "29 avril - 25 juin 2026" -> (start_iso, end_iso)
        "Du 29 avril au 25 juin 2026" -> (start_iso, end_iso)
        "Samedi 5 avril 2026" -> (start_iso, None)
    """
    if not text:
        return (None, None)

    text = text.strip()
    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
    }

    def extract_date(s: str) -> Optional[str]:
        s = s.lower().strip()
        for month_name, month_num in months_fr.items():
            if month_name in s:
                day_match = re.search(r"(\d{1,2})\s*" + re.escape(month_name), s)
                if day_match:
                    day = int(day_match.group(1))
                    year = datetime.now().year
                    year_match = re.search(r"(\d{4})", s)
                    if year_match:
                        year = int(year_match.group(1))
                    try:
                        return datetime(year, month_num, day, 10, 0).isoformat()
                    except ValueError:
                        pass
        return None

    # Range: "Du X au Y" or "X - Y"
    range_match = re.split(r"\s*[-–]\s*|\s+au?\s+", text, maxsplit=1)
    if len(range_match) == 2:
        start = extract_date(range_match[0])
        end = extract_date(range_match[1])
        # If end has no year but start does, propagate year
        if start and not end:
            end_text = range_match[1]
            if not re.search(r"\d{4}", end_text):
                year_match = re.search(r"(\d{4})", range_match[0])
                if year_match:
                    end = extract_date(end_text + " " + year_match.group(1))
        return (start or end, end)

    return (extract_date(text), None)
