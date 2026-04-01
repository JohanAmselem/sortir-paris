"""
L'Officiel des Spectacles spider.
Source: https://www.offi.fr
Comprehensive cultural event listings for Paris — theatre, cinema,
concerts, exhibitions, spectacles.

Uses httpx + BeautifulSoup. Scrapes listing pages, then follows detail
links for richer data (description, exact dates, prices).
"""

import hashlib
import logging
import re
import time
from datetime import datetime
from typing import Generator, Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, Tag

from config import REQUEST_DELAY, USER_AGENT
from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)

logger = logging.getLogger(__name__)

BASE_URL = "https://www.offi.fr"

# Category pages to scrape with their canonical category slug.
CATEGORY_PAGES = {
    "theatre": {
        "url": "https://www.offi.fr/theatre/",
        "category_slug": "theatre",
    },
    "cinema": {
        "url": "https://www.offi.fr/cinema/",
        "category_slug": "cinema",
    },
    "concerts": {
        "url": "https://www.offi.fr/concerts/",
        "category_slug": "concerts",
    },
    "expositions": {
        "url": "https://www.offi.fr/expositions/",
        "category_slug": "expos",
    },
    "spectacles": {
        "url": "https://www.offi.fr/spectacles/",
        "category_slug": "spectacles",
    },
}

# French month names -> month numbers
FRENCH_MONTHS = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
    # Abbreviated variants
    "janv": 1, "févr": 2, "avr": 4, "juil": 7,
    "sept": 9, "oct": 10, "nov": 11, "déc": 12,
}

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _get(client: httpx.Client, url: str) -> Optional[BeautifulSoup]:
    """GET a page and return parsed soup, or None on failure."""
    try:
        resp = client.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except httpx.HTTPError as exc:
        logger.warning("HTTP error fetching %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

def _parse_french_date(text: str) -> Optional[str]:
    """Parse a French date string into ISO-8601 (YYYY-MM-DDTHH:MM:SS).

    Handles patterns like:
        "15 mars 2026"
        "du 10 au 25 avril 2026"
        "15 mars"  (assumes current year)
        "jusqu'au 30 juin 2026"
    """
    if not text:
        return None

    text = text.lower().strip()

    # Pattern: DD month YYYY  (optionally with time HHhMM)
    m = re.search(
        r"(\d{1,2})\s+"
        r"(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre"
        r"|janv|févr|avr|juil|sept|oct|nov|déc)\.?\s*"
        r"(\d{4})?",
        text,
    )
    if not m:
        return None

    day = int(m.group(1))
    month = FRENCH_MONTHS.get(m.group(2))
    year = int(m.group(3)) if m.group(3) else datetime.now().year

    if not month:
        return None

    # Optional time
    time_match = re.search(r"(\d{1,2})\s*[h:]\s*(\d{2})?", text)
    hour = int(time_match.group(1)) if time_match else 0
    minute = int(time_match.group(2)) if time_match and time_match.group(2) else 0

    try:
        dt = datetime(year, month, day, hour, minute)
        return dt.isoformat()
    except ValueError:
        return None


def _parse_date_range(text: str) -> tuple[Optional[str], Optional[str]]:
    """Extract start and end dates from a French date range string.

    Examples:
        "du 10 mars au 25 avril 2026"
        "15 mars 2026"
        "jusqu'au 30 juin 2026"
    """
    if not text:
        return None, None

    lower = text.lower()

    # Range: "du DD month [YYYY] au DD month [YYYY]"
    range_pat = re.search(
        r"du\s+(.+?)\s+au\s+(.+)", lower
    )
    if range_pat:
        start = _parse_french_date(range_pat.group(1))
        end = _parse_french_date(range_pat.group(2))
        # If start has no year but end does, borrow from end
        if start and end and "T" in start and "T" in end:
            return start, end
        return start, end

    # "jusqu'au DD month YYYY"
    jusquau = re.search(r"jusqu['\u2019]au\s+(.+)", lower)
    if jusquau:
        end = _parse_french_date(jusquau.group(1))
        return None, end

    # Single date
    single = _parse_french_date(lower)
    return single, single


# ---------------------------------------------------------------------------
# Arrondissement extraction
# ---------------------------------------------------------------------------

_ARRONDISSEMENT_RE = re.compile(
    r"(?:750|paris\s*)(\d{2})|(\d{1,2})\s*(?:er?|[eè]me)\s*(?:arr)?",
    re.IGNORECASE,
)


def _extract_arrondissement(text: Optional[str]) -> Optional[str]:
    """Try to pull a Paris arrondissement (e.g. '75005') from an address."""
    if not text:
        return None
    # Direct zip code
    zip_match = re.search(r"(750\d{2})", text)
    if zip_match:
        return zip_match.group(1)
    m = _ARRONDISSEMENT_RE.search(text)
    if m:
        num = m.group(1) or m.group(2)
        return f"750{int(num):02d}"
    return None


# ---------------------------------------------------------------------------
# Source ID generation
# ---------------------------------------------------------------------------

def _source_id(url: str) -> str:
    """Derive a stable source_id from the event URL."""
    # Use the URL path as the unique key, hashed for compactness.
    return hashlib.md5(url.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Detail page scraping
# ---------------------------------------------------------------------------

def _scrape_detail(client: httpx.Client, url: str) -> dict:
    """Fetch an event detail page and extract rich info."""
    info: dict = {
        "description": None,
        "start_date": None,
        "end_date": None,
        "price_text": None,
        "venue_name": None,
        "venue_address": None,
        "image_url": None,
    }

    soup = _get(client, url)
    if not soup:
        return info

    # Description — look for common description containers
    for sel in [
        "div.description",
        "div.content-text",
        "div.bloc-texte",
        "article .text",
        "div.editorial",
        "div[itemprop='description']",
        "meta[name='description']",
    ]:
        el = soup.select_one(sel)
        if el:
            if el.name == "meta":
                info["description"] = clean_text(el.get("content"))
            else:
                info["description"] = clean_text(el.get_text(separator=" "))
            if info["description"]:
                break

    # Fallback: largest <p> block
    if not info["description"]:
        paragraphs = soup.find_all("p")
        if paragraphs:
            longest = max(paragraphs, key=lambda p: len(p.get_text()), default=None)
            if longest and len(longest.get_text()) > 80:
                info["description"] = clean_text(longest.get_text(separator=" "))

    # Dates
    date_el = soup.select_one(
        "span.dates, div.dates, .date-spectacle, time, [itemprop='startDate']"
    )
    if date_el:
        date_text = date_el.get("datetime") or date_el.get_text()
        if date_text:
            start, end = _parse_date_range(date_text)
            info["start_date"] = start
            info["end_date"] = end

    # Price
    price_el = soup.select_one(
        "span.price, div.tarifs, .tarif, [itemprop='price'], .prix"
    )
    if price_el:
        info["price_text"] = clean_text(price_el.get_text())

    # Venue
    venue_el = soup.select_one(
        "[itemprop='name'].lieu, .lieu a, .venue-name, h2.lieu, .salle a"
    )
    if venue_el:
        info["venue_name"] = clean_text(venue_el.get_text())

    address_el = soup.select_one(
        "[itemprop='address'], .adresse, .address, .lieu-adresse"
    )
    if address_el:
        info["venue_address"] = clean_text(address_el.get_text())

    # Image — og:image or first large image
    og_img = soup.select_one("meta[property='og:image']")
    if og_img and og_img.get("content"):
        info["image_url"] = og_img["content"]

    time.sleep(REQUEST_DELAY)
    return info


# ---------------------------------------------------------------------------
# Listing page parsing
# ---------------------------------------------------------------------------

def _extract_cards(soup: BeautifulSoup) -> list[dict]:
    """Extract event card data from a listing page."""
    cards: list[dict] = []

    # Try several common selectors for event cards
    card_selectors = [
        "div.card-spectacle",
        "div.card-event",
        "article.card",
        "div.item-spectacle",
        "li.item-spectacle",
        "div.bloc-spectacle",
        "div.event-item",
        "div.result-item",
    ]

    card_elements: list[Tag] = []
    for sel in card_selectors:
        card_elements = soup.select(sel)
        if card_elements:
            break

    # Fallback: look for any container with h3 or h4 links
    if not card_elements:
        for heading_tag in ["h3", "h4", "h2"]:
            headings = soup.select(f"{heading_tag} a[href]")
            if headings:
                # Wrap each heading's parent into a "card"
                card_elements = [h.find_parent() or h for h in headings]
                break

    for card in card_elements:
        try:
            # Title + link
            title_el = card.select_one("h3 a, h4 a, h2 a, a.title, a[title]")
            if not title_el:
                title_el = card.select_one("a[href]")
            if not title_el:
                continue

            title = clean_text(title_el.get_text())
            if not title:
                continue

            href = title_el.get("href", "")
            link = urljoin(BASE_URL, href) if href else None

            # Image
            img_el = card.select_one("img")
            image_url = None
            if img_el:
                image_url = img_el.get("src") or img_el.get("data-src")
                if image_url and not image_url.startswith("http"):
                    image_url = urljoin(BASE_URL, image_url)

            # Venue (often a secondary link or span)
            venue_el = card.select_one(".lieu, .venue, .salle, a[href*='salle']")
            venue_name = clean_text(venue_el.get_text()) if venue_el else None

            # Date snippet on listing card
            date_el = card.select_one(".date, .dates, time, .periode")
            date_text = clean_text(date_el.get_text()) if date_el else None

            cards.append({
                "title": title,
                "link": link,
                "image_url": image_url,
                "venue_name": venue_name,
                "date_text": date_text,
            })
        except Exception:
            logger.debug("Failed to parse a card element", exc_info=True)
            continue

    return cards


def _next_page_url(soup: BeautifulSoup, current_url: str) -> Optional[str]:
    """Find the URL of the next listing page, if any."""
    next_link = soup.select_one(
        "a.next, a[rel='next'], li.next a, .pagination a.suivant, "
        ".pagination a:contains('Suivant'), .pagination a:contains('>')"
    )
    if next_link and next_link.get("href"):
        return urljoin(current_url, next_link["href"])
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def fetch_events(max_pages: int = 5) -> Generator[dict, None, None]:
    """Scrape events from L'Officiel des Spectacles.

    Iterates over each category, scrapes listing pages (up to *max_pages*
    per category), follows detail links for richer data, and yields
    normalised event dicts.
    """
    with httpx.Client() as client:
        for cat_key, cat_info in CATEGORY_PAGES.items():
            logger.info("Scraping category: %s", cat_key)
            url: Optional[str] = cat_info["url"]
            pages_scraped = 0

            while url and pages_scraped < max_pages:
                soup = _get(client, url)
                if not soup:
                    break

                cards = _extract_cards(soup)
                if not cards:
                    logger.info("No cards found on %s — stopping.", url)
                    break

                for card in cards:
                    try:
                        event = _build_event(client, card, cat_key, cat_info)
                        if event:
                            yield event
                    except Exception:
                        logger.warning(
                            "Error processing card '%s'",
                            card.get("title", "?"),
                            exc_info=True,
                        )

                pages_scraped += 1
                url = _next_page_url(soup, url)
                time.sleep(REQUEST_DELAY)


def _build_event(
    client: httpx.Client,
    card: dict,
    cat_key: str,
    cat_info: dict,
) -> Optional[dict]:
    """Build a normalised event dict from a listing card + detail page."""
    title = card["title"]
    source_url = card["link"]

    if not source_url:
        return None

    sid = _source_id(source_url)

    # -- Detail page -----------------------------------------------------------
    detail = _scrape_detail(client, source_url)

    # -- Merge fields, preferring detail over listing --------------------------
    description = detail.get("description")
    image_url = detail.get("image_url") or card.get("image_url")
    venue_name = detail.get("venue_name") or card.get("venue_name")
    venue_address = detail.get("venue_address")

    # Dates
    start_date = detail.get("start_date")
    end_date = detail.get("end_date")
    if not start_date and card.get("date_text"):
        start_date, end_date = _parse_date_range(card["date_text"])

    # Price
    price_data = parse_price(detail.get("price_text"))

    # Arrondissement / zip
    venue_zip = _extract_arrondissement(venue_address)
    arrondissement = None
    if venue_zip:
        arr_num = int(venue_zip[-2:])
        if 1 <= arr_num <= 20:
            arrondissement = arr_num

    # Category: use our mapped slug, but let detect_category refine if needed
    raw_category = cat_key
    category_slug = (
        detect_category(raw_category, title, description)
        or cat_info["category_slug"]
    )

    # Tags
    tags: list[str] = []
    if raw_category:
        tags.append(raw_category)

    quality = compute_quality_score(
        title,
        description,
        image_url,
        start_date,
        detail.get("price_text"),
        source_url,
    )

    return {
        "title": title,
        "slug": generate_slug(title, start_date),
        "description": description,
        "short_desc": truncate(description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_data["price_min"],
        "price_max": price_data["price_max"],
        "is_free": price_data["is_free"],
        "booking_url": source_url,
        "source": "offi",
        "source_url": source_url,
        "source_id": sid,
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": "Paris",
        "venue_zip": venue_zip,
        "venue_arrondissement": arrondissement,
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": raw_category,
        "category_slug": category_slug,
        "tags": tags,
        "quality_score": quality,
    }


# ---------------------------------------------------------------------------
# CLI quick-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)
    print("Fetching L'Officiel des Spectacles events...")
    for i, event in enumerate(fetch_events(max_pages=2)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 9:
            break
    print("Done.")
