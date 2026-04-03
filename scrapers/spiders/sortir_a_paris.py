"""
SortirAParis spider.
Source: https://www.sortiraparis.com
Major French events guide — extensive coverage of Paris events, expos,
festivals, concerts, family activities, etc.

Strategy: Scrape article listing pages by category. Each card is an <a> tag
wrapping an image, h3/h4 title, and a description paragraph. Dates are
extracted from the description text.
"""

import re
import time
from datetime import datetime
from typing import Generator, Optional

import httpx
from bs4 import BeautifulSoup

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)

BASE_URL = "https://www.sortiraparis.com"

# Updated URL paths (site restructured)
LISTING_PAGES = [
    (f"{BASE_URL}/arts-culture/exposition", "expos"),
    (f"{BASE_URL}/scenes/concert-musique", "concerts"),
    (f"{BASE_URL}/scenes/theatre", "theatre"),
    (f"{BASE_URL}/loisirs/salon", "expos"),
    (f"{BASE_URL}/musique-nuit", "concerts"),
    (f"{BASE_URL}/loisirs/sport", "sport"),
    (f"{BASE_URL}/bons-plans/sorties-gratuites", None),
    (f"{BASE_URL}/arts-culture", None),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

# French month mapping for date extraction from descriptions
MONTHS_FR = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}


def fetch_events(max_pages: int = 3) -> Generator[dict, None, None]:
    """Fetch events from SortirAParis category pages."""

    seen_slugs: set[str] = set()

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        for listing_url, default_category in LISTING_PAGES:
            cat_name = listing_url.rstrip("/").split("/")[-1]
            print(f"  Fetching SortirAParis: {cat_name}...")

            for page in range(1, max_pages + 1):
                url = f"{listing_url}?page={page}" if page > 1 else listing_url

                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                except Exception as e:
                    print(f"  Error: {e}")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Find article links with meaningful text content
                # SortirAParis uses <a href="/category/articles/ID-slug">Title text</a>
                cards = []
                seen_hrefs = set()
                for a_tag in soup.find_all("a", href=re.compile(r"/articles/\d+")):
                    href = a_tag.get("href", "")
                    text = a_tag.get_text(strip=True)
                    if href in seen_hrefs:
                        continue
                    # Only keep links that have meaningful title text (not just images)
                    if text and len(text) > 10:
                        seen_hrefs.add(href)
                        cards.append(a_tag)

                if not cards:
                    print(f"    Page {page}: no cards found, stopping")
                    break

                count = 0
                for card in cards:
                    event = parse_card(card, default_category)
                    if event and event["slug"] not in seen_slugs:
                        seen_slugs.add(event["slug"])
                        yield event
                        count += 1

                print(f"    Page {page}: {count} events")
                if count == 0:
                    break

                time.sleep(0.5)


def parse_card(card, default_category: Optional[str]) -> Optional[dict]:
    """Parse a SortirAParis article card.

    Cards are <a> tags where the title is either in h3/h4 children
    or is the direct text content of the link itself.
    """

    # Title: try h3/h4 first, then the link text itself
    title_el = card.find(["h2", "h3", "h4"])
    if title_el:
        title = clean_text(title_el.get_text())
    else:
        title = clean_text(card.get_text())

    if not title or len(title) < 10:
        return None

    # Skip listicle/guide titles
    if re.match(r"^\d+\s+(meilleur|best|top|idée)", title.lower()):
        return None

    # Link
    href = card.get("href", "")
    event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Image from CDN
    img_el = card.find("img")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src") or img_el.get("data-lazy-src")
        if src:
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Description
    desc_el = card.find("p")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Extract dates from description text (common pattern: "Du X au Y mois 2026")
    all_text = f"{title} {description or ''}"
    start_date, end_date = extract_dates_from_text(all_text)

    # Free detection
    is_free = False
    if "gratuit" in all_text.lower() or "entrée libre" in all_text.lower():
        is_free = True

    # Category
    category_slug = default_category or detect_category(None, title, description)

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=None, booking_url=event_url,
    )

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "short_desc": truncate(description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": None,
        "price_max": None,
        "is_free": is_free,
        "booking_url": event_url,
        "source": "sortiraparis",
        "source_url": event_url,
        "source_id": slug,
        "venue_name": None,
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


def extract_dates_from_text(text: str) -> tuple[Optional[str], Optional[str]]:
    """Extract start/end dates from French text.

    Patterns:
        - "du 3 avril au 13 septembre 2026"
        - "dès le 31 mars 2026"
        - "le 15 avril 2026"
        - "3 avril 2026"
    """
    if not text:
        return None, None

    lower = text.lower()
    month_pattern = "|".join(MONTHS_FR.keys())

    # Range: "du X month au Y month 2026"
    range_diff = re.search(
        rf"du\s+(\d{{1,2}})\s+({month_pattern})\s+au\s+(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if range_diff:
        try:
            start = datetime(
                int(range_diff.group(5)),
                MONTHS_FR[range_diff.group(2)],
                int(range_diff.group(1)), 10, 0,
            )
            end = datetime(
                int(range_diff.group(5)),
                MONTHS_FR[range_diff.group(4)],
                int(range_diff.group(3)), 22, 0,
            )
            return start.isoformat(), end.isoformat()
        except ValueError:
            pass

    # Range same month: "du X au Y month 2026"
    range_same = re.search(
        rf"du\s+(\d{{1,2}})\s+au\s+(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if range_same:
        try:
            month = MONTHS_FR[range_same.group(3)]
            year = int(range_same.group(4))
            start = datetime(year, month, int(range_same.group(1)), 10, 0)
            end = datetime(year, month, int(range_same.group(2)), 22, 0)
            return start.isoformat(), end.isoformat()
        except ValueError:
            pass

    # Single date: "dès le X month 2026" or "le X month 2026" or "X month 2026"
    single = re.search(
        rf"(?:dès\s+le\s+|le\s+)?(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if single:
        try:
            dt = datetime(
                int(single.group(3)),
                MONTHS_FR[single.group(2)],
                int(single.group(1)), 10, 0,
            )
            return dt.isoformat(), None
        except ValueError:
            pass

    return None, None
