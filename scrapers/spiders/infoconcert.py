"""
InfoConcert spider.
Source: https://www.infoconcert.com/ville/paris-s20.html
Fetches concert listings in Paris from infoconcert.com (357+ pages).

Pagination via ?page=N query parameter.
The site uses Next.js SSR so content is pre-rendered HTML.
"""

import re
import hashlib
import logging
import time
from datetime import datetime, timedelta
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

logger = logging.getLogger(__name__)

BASE_URL = "https://www.infoconcert.com/ville/paris-s20.html"
DOMAIN = "https://www.infoconcert.com"

# French month mapping
FRENCH_MONTHS = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}

USER_AGENT = "SortirParis/1.0 (+https://sortir.paris)"
REQUEST_DELAY = 1.2  # polite crawl delay in seconds


def _parse_french_date(text: str) -> Optional[str]:
    """Parse a French date string into ISO 8601 datetime.

    Supports:
        - "Mardi 31 mars 2026 à 19h00" -> "2026-03-31T19:00:00"
        - "Samedi 5 avril 2026 à 20h30" -> "2026-04-05T20:30:00"
        - "Du 7 au 31 mars 2026 à 16h30" -> returns start date only
    """
    if not text:
        return None

    text = text.strip().lower()

    # Extract time (e.g. "19h00", "20h30", "21h")
    time_match = re.search(r"(\d{1,2})h(\d{2})?", text)
    hour = int(time_match.group(1)) if time_match else 0
    minute = int(time_match.group(2) or 0) if time_match else 0

    # Try single date: "mardi 31 mars 2026"
    single_match = re.search(
        r"(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|"
        r"août|septembre|octobre|novembre|décembre)\s+(\d{4})",
        text,
    )
    if single_match:
        day = int(single_match.group(1))
        month = FRENCH_MONTHS[single_match.group(2)]
        year = int(single_match.group(3))
        try:
            dt = datetime(year, month, day, hour, minute)
            return dt.isoformat()
        except ValueError:
            return None

    return None


def _parse_french_date_range(text: str) -> tuple[Optional[str], Optional[str]]:
    """Parse a date range, returning (start_iso, end_iso).

    Handles:
        - "Du 7 au 31 mars 2026 à 16h30"
        - "Du 28 mars au 5 avril 2026 à 20h00"
        - Single dates: "Mardi 31 mars 2026 à 19h00"
    """
    if not text:
        return None, None

    lower = text.strip().lower()

    # Extract time
    time_match = re.search(r"(\d{1,2})h(\d{2})?", lower)
    hour = int(time_match.group(1)) if time_match else 0
    minute = int(time_match.group(2) or 0) if time_match else 0

    month_pattern = (
        r"janvier|février|mars|avril|mai|juin|juillet|"
        r"août|septembre|octobre|novembre|décembre"
    )

    # Range with different months: "du 28 mars au 5 avril 2026"
    range_diff = re.search(
        rf"du\s+(\d{{1,2}})\s+({month_pattern})\s+au\s+(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if range_diff:
        day1 = int(range_diff.group(1))
        month1 = FRENCH_MONTHS[range_diff.group(2)]
        day2 = int(range_diff.group(3))
        month2 = FRENCH_MONTHS[range_diff.group(4)]
        year = int(range_diff.group(5))
        try:
            start = datetime(year, month1, day1, hour, minute)
            end = datetime(year, month2, day2, hour, minute)
            return start.isoformat(), end.isoformat()
        except ValueError:
            pass

    # Range same month: "du 7 au 31 mars 2026"
    range_same = re.search(
        rf"du\s+(\d{{1,2}})\s+au\s+(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if range_same:
        day1 = int(range_same.group(1))
        day2 = int(range_same.group(2))
        month = FRENCH_MONTHS[range_same.group(3)]
        year = int(range_same.group(4))
        try:
            start = datetime(year, month, day1, hour, minute)
            end = datetime(year, month, day2, hour, minute)
            return start.isoformat(), end.isoformat()
        except ValueError:
            pass

    # Single date fallback
    start_iso = _parse_french_date(text)
    return start_iso, None


def _extract_source_id(url: str) -> str:
    """Extract a stable source ID from the event URL."""
    # Use the URL path as a unique identifier
    return hashlib.md5(url.encode()).hexdigest()[:16]


def _extract_arrondissement(text: Optional[str]) -> Optional[str]:
    """Try to extract Paris arrondissement from address text.

    Looks for patterns like "75011", "75001", "Paris 11e", etc.
    """
    if not text:
        return None
    zip_match = re.search(r"750(\d{2})", text)
    if zip_match:
        arr = int(zip_match.group(1))
        if 1 <= arr <= 20:
            return str(arr)
    arr_match = re.search(r"(\d{1,2})\s*(?:e|er|ème|eme)\s*arr", text, re.IGNORECASE)
    if arr_match:
        arr = int(arr_match.group(1))
        if 1 <= arr <= 20:
            return str(arr)
    return None


def _extract_zipcode(text: Optional[str]) -> Optional[str]:
    """Extract a Paris zipcode (750xx) from text."""
    if not text:
        return None
    match = re.search(r"(750\d{2})", text)
    return match.group(1) if match else None


def _fetch_page(client: httpx.Client, page: int) -> Optional[BeautifulSoup]:
    """Fetch a single listing page and return parsed soup."""
    params = {"page": page} if page > 1 else {}
    try:
        response = client.get(BASE_URL, params=params, timeout=30)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except httpx.HTTPStatusError as e:
        logger.warning("HTTP %s on page %d: %s", e.response.status_code, page, e)
        return None
    except httpx.RequestError as e:
        logger.warning("Request error on page %d: %s", page, e)
        return None


def _parse_card(card) -> Optional[dict]:
    """Parse a single event card element into a raw event dict."""

    # --- Title ---
    title_el = card.find(["h2", "h3"])
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title:
        return None

    # --- Event link ---
    event_link_el = card.find("a", href=re.compile(r"/concerts?/"))
    if not event_link_el:
        # Fallback: any link in the card
        event_link_el = card.find("a", href=True)
    event_url = None
    if event_link_el:
        href = event_link_el.get("href", "")
        event_url = href if href.startswith("http") else DOMAIN + href

    # --- Date ---
    date_text = None
    # Look for date patterns in the card text
    for el in card.find_all(["span", "p", "div", "time"]):
        el_text = el.get_text(strip=True)
        if el_text and re.search(
            r"(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|du\s+\d)",
            el_text.lower(),
        ):
            date_text = el_text
            break

    # If no date found in specific elements, search full card text
    if not date_text:
        card_text = card.get_text(" ", strip=True)
        date_match = re.search(
            r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|du)\s+"
            r"\d{1,2}.*?\d{4}(?:\s+à\s+\d{1,2}h\d{0,2})?",
            card_text,
            re.IGNORECASE,
        )
        if date_match:
            date_text = date_match.group(0)

    start_date, end_date = _parse_french_date_range(date_text) if date_text else (None, None)

    # --- Venue ---
    venue_link = card.find("a", href=re.compile(r"/salle/"))
    venue_name = clean_text(venue_link.get_text()) if venue_link else None
    venue_url = None
    if venue_link:
        href = venue_link.get("href", "")
        venue_url = href if href.startswith("http") else DOMAIN + href

    # Try to get address info from venue element's parent or nearby text
    venue_address = None
    venue_zip = None
    venue_arrondissement = None
    card_full_text = card.get_text(" ", strip=True)

    venue_zip = _extract_zipcode(card_full_text)
    venue_arrondissement = _extract_arrondissement(card_full_text)

    # --- Price ---
    price_text = None
    for el in card.find_all(["span", "p", "div"]):
        el_text = el.get_text(strip=True)
        if el_text and ("€" in el_text or "gratuit" in el_text.lower()):
            price_text = el_text
            break

    price_data = parse_price(price_text)

    # --- Image ---
    img_el = card.find("img")
    image_url = None
    if img_el:
        image_url = img_el.get("src") or img_el.get("data-src")
        if image_url and not image_url.startswith("http"):
            image_url = DOMAIN + image_url

    # --- Source ID ---
    source_id = _extract_source_id(event_url or title)
    source_url = event_url

    # --- Build the event ---
    slug = generate_slug(title, start_date)

    # Short description from card (if any descriptive text exists)
    desc_el = card.find("p")
    description = clean_text(desc_el.get_text()) if desc_el else None
    # Avoid using date/price text as description
    if description and (
        re.search(r"\d{4}", description or "")
        and re.search(r"(janvier|février|mars|avril|mai)", (description or "").lower())
    ):
        description = None

    short_desc = truncate(description) if description else None

    quality = compute_quality_score(
        title, description, image_url, start_date, price_text, source_url
    )

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "short_desc": short_desc,
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_data["price_min"],
        "price_max": price_data["price_max"],
        "is_free": price_data["is_free"],
        "booking_url": source_url,
        "source": "infoconcert",
        "source_url": source_url,
        "source_id": source_id,
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": "Paris",
        "venue_zip": venue_zip,
        "venue_arrondissement": venue_arrondissement,
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": "concert",
        "category_slug": "concerts",
        "tags": ["concert", "musique"],
        "quality_score": quality,
    }


def fetch_events(max_pages: int = 15, days_ahead: int = 90) -> Generator[dict, None, None]:
    """Fetch concert events from infoconcert.com.

    Args:
        max_pages: Maximum number of listing pages to scrape.
        days_ahead: Only yield events starting within this many days.

    Yields:
        Event dicts in the standard raw format.
    """
    cutoff = datetime.now() + timedelta(days=days_ahead)
    seen_ids: set[str] = set()

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
    }

    with httpx.Client(headers=headers, follow_redirects=True) as client:
        for page in range(1, max_pages + 1):
            logger.info("Fetching infoconcert page %d/%d", page, max_pages)

            soup = _fetch_page(client, page)
            if not soup:
                logger.warning("Could not fetch page %d, stopping.", page)
                break

            # Find event cards — try multiple selectors for robustness
            cards = soup.select("a[href*='/concerts/concert-']")
            if not cards:
                cards = soup.find_all("div", class_=re.compile(r"card|event|listing"))
            if not cards:
                # Fallback: look for containers holding concert links
                containers = []
                for link in soup.find_all("a", href=re.compile(r"/concerts?/")):
                    parent = link.find_parent(["div", "article", "li"])
                    if parent and parent not in containers:
                        containers.append(parent)
                cards = containers

            if not cards:
                logger.info("No event cards found on page %d, stopping.", page)
                break

            page_event_count = 0
            for card in cards:
                try:
                    event = _parse_card(card)
                    if not event:
                        continue

                    # Dedup within this run
                    if event["source_id"] in seen_ids:
                        continue
                    seen_ids.add(event["source_id"])

                    # Filter by date if we have one
                    if event["start_date"]:
                        try:
                            event_dt = datetime.fromisoformat(event["start_date"])
                            if event_dt > cutoff:
                                continue
                        except ValueError:
                            pass

                    yield event
                    page_event_count += 1

                except Exception:
                    logger.exception("Error parsing event card on page %d", page)
                    continue

            logger.info("Page %d: extracted %d events", page, page_event_count)

            # Polite delay between pages
            if page < max_pages:
                time.sleep(REQUEST_DELAY)

    logger.info("InfoConcert scrape complete. Total unique events: %d", len(seen_ids))


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)
    print("Fetching InfoConcert events for Paris...")
    for i, event in enumerate(fetch_events(max_pages=2)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 4:
            break
    print("Done.")
