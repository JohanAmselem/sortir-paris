"""
FNAC Spectacles scraper — Concerts, Theatre, Comedy, Dance in Paris.
Source: https://www.fnacspectacles.com

Scrapes listing pages across multiple categories.
High volume: thousands of events.
"""

import httpx
import re
import json
import time
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

CATEGORY_URLS = {
    "concerts": "https://www.fnacspectacles.com/recherche/concerts/?lieu=paris",
    "theatre": "https://www.fnacspectacles.com/recherche/theatre/?lieu=paris",
    "humour": "https://www.fnacspectacles.com/recherche/one-man-show-humour/?lieu=paris",
    "danse": "https://www.fnacspectacles.com/recherche/danse-ballet-opera/?lieu=paris",
    "spectacles": "https://www.fnacspectacles.com/recherche/spectacle-enfant/?lieu=paris",
    "festivals": "https://www.fnacspectacles.com/recherche/festival/?lieu=paris",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

MONTHS_FR = {
    "janv": 1, "jan": 1, "fév": 2, "feb": 2, "mars": 3, "mar": 3,
    "avr": 4, "apr": 4, "mai": 5, "may": 5, "juin": 6, "jun": 6,
    "juil": 7, "jul": 7, "août": 8, "aug": 8, "sept": 9, "sep": 9,
    "oct": 10, "nov": 11, "déc": 12, "dec": 12,
    "janvier": 1, "février": 2, "avril": 4, "juillet": 7,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}


def _parse_french_date(text: str) -> Optional[str]:
    """Parse various French date formats → ISO date string."""
    text = text.lower().strip()

    # "15 avr. 2026", "15 avril 2026", etc.
    m = re.search(r'(\d{1,2})\s+(\w+)\.?\s+(\d{4})', text)
    if m:
        day = int(m.group(1))
        month_str = m.group(2).rstrip(".")
        year = int(m.group(3))
        month = MONTHS_FR.get(month_str)
        if month:
            return f"{year}-{month:02d}-{day:02d}"

    # "15/04/2026" or "15-04-2026"
    m = re.search(r'(\d{2})[/\-](\d{2})[/\-](\d{4})', text)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # "15 avr." without year
    m = re.search(r'(\d{1,2})\s+(\w+)\.?', text)
    if m:
        day = int(m.group(1))
        month_str = m.group(2).rstrip(".")
        month = MONTHS_FR.get(month_str)
        if month:
            year = datetime.now().year
            return f"{year}-{month:02d}-{day:02d}"

    return None


def _extract_time(text: str) -> Optional[str]:
    """Extract time from text like '20h30', '20:30', 'à 20h'."""
    m = re.search(r'(\d{1,2})[hH:](\d{2})?', text)
    if m:
        h = int(m.group(1))
        mins = m.group(2) or "00"
        return f"{h:02d}:{mins}"
    return None


def fetch_events(
    max_pages_per_cat: int = 5,
) -> Generator[dict, None, None]:
    """Fetch events from FNAC Spectacles across all categories."""
    client = httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True)
    seen = set()

    for cat_slug, base_url in CATEGORY_URLS.items():
        for page in range(1, max_pages_per_cat + 1):
            try:
                url = base_url if page == 1 else f"{base_url}&page={page}"
                resp = client.get(url)

                if resp.status_code != 200:
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Try JSON-LD first
                for script in soup.select('script[type="application/ld+json"]'):
                    try:
                        ld = json.loads(script.string or "")
                        items = ld if isinstance(ld, list) else [ld]
                        for item in items:
                            if item.get("@type") in ("Event", "MusicEvent", "TheaterEvent", "DanceEvent", "ComedyEvent"):
                                result = _parse_jsonld(item, cat_slug, seen)
                                if result:
                                    yield result
                    except (json.JSONDecodeError, KeyError):
                        pass

                # HTML cards
                cards = soup.select(".product-card, .card, .event-card, article.product, [class*=event-item], [class*=product-item], .result-item")
                if not cards:
                    cards = soup.select(".list-item, .search-result, article")

                if not cards and page > 1:
                    break  # No more results

                for card in cards:
                    result = _parse_card(card, cat_slug, base_url, seen)
                    if result:
                        yield result

                print(f"  FNAC: {cat_slug} page {page} OK ({len(cards)} cards)")
                time.sleep(1.5)

            except Exception as e:
                print(f"  FNAC: {cat_slug} page {page} error: {e}")
                time.sleep(2)

    client.close()


def _parse_jsonld(data: dict, cat_slug: str, seen: set) -> Optional[dict]:
    """Parse JSON-LD Event from FNAC Spectacles."""
    title = data.get("name", "")
    if not title:
        return None

    location = data.get("location", {})
    venue_name = location.get("name", "")
    address = location.get("address", {})
    if isinstance(address, str):
        address = {"streetAddress": address}

    start = data.get("startDate")
    end = data.get("endDate")
    desc = data.get("description", "")
    image = data.get("image")
    if isinstance(image, list) and image:
        image = image[0]
    url = data.get("url", "")

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    offers = data.get("offers", {})
    if isinstance(offers, list) and offers:
        offers = offers[0]
    price_raw = ""
    if isinstance(offers, dict):
        low = offers.get("lowPrice") or offers.get("price")
        high = offers.get("highPrice")
        if low and high:
            price_raw = f"{low}€ - {high}€"
        elif low:
            price_raw = f"{low}€"
    booking_url = offers.get("url") if isinstance(offers, dict) else url

    price = parse_price(price_raw)
    category = detect_category(cat_slug, title, desc) or cat_slug

    return {
        "title": clean_text(title),
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)),
        "start_date": start,
        "end_date": end,
        "image_url": image,
        **price,
        "booking_url": booking_url or url,
        "source": "fnacspectacles",
        "source_id": f"fnac-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": address.get("streetAddress", ""),
        "venue_city": address.get("addressLocality", "Paris"),
        "venue_zip": address.get("postalCode"),
        "venue_arrondissement": _zip_to_arrondissement(address.get("postalCode")),
        "category_slug": category,
        "tags": [cat_slug],
        "quality_score": compute_quality_score(clean_text(title), clean_text(desc), image, start, price_raw, url),
    }


def _parse_card(card, cat_slug: str, base_url: str, seen: set) -> Optional[dict]:
    """Parse an HTML event card from FNAC Spectacles."""
    title_el = card.select_one("h2, h3, .title, [class*=title], [class*=name], a.product-title")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 3:
        return None

    # Skip noise
    if title.lower() in ("voir plus", "résultats", "page suivante"):
        return None

    # Link
    link_el = card.select_one("a[href]")
    url = ""
    if link_el:
        url = link_el.get("href", "")
        if url and not url.startswith("http"):
            url = f"https://www.fnacspectacles.com{url}"

    # Image
    img_el = card.select_one("img[src], img[data-src], img[data-lazy]")
    image = None
    if img_el:
        image = img_el.get("data-src") or img_el.get("data-lazy") or img_el.get("src")
        if image and image.startswith("//"):
            image = "https:" + image

    # Date
    date_el = card.select_one("time, .date, [class*=date]")
    start = None
    if date_el:
        start = date_el.get("datetime")
        if not start:
            date_text = clean_text(date_el.get_text())
            start = _parse_french_date(date_text) if date_text else None
            time_str = _extract_time(date_text) if date_text else None
            if start and time_str:
                start = f"{start}T{time_str}:00"
            elif start:
                start = f"{start}T20:00:00"

    # Venue
    venue_el = card.select_one("[class*=venue], [class*=lieu], [class*=location], .place")
    venue_name = clean_text(venue_el.get_text()) if venue_el else ""

    # Price
    price_el = card.select_one("[class*=price], [class*=prix], .price")
    price_raw = clean_text(price_el.get_text()) if price_el else ""
    price = parse_price(price_raw)

    # Description
    desc_el = card.select_one("p, .description, [class*=desc], [class*=synopsis]")
    desc = clean_text(desc_el.get_text()) if desc_el else None

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    category = detect_category(cat_slug, title, desc) or cat_slug

    return {
        "title": title,
        "slug": slug,
        "description": desc,
        "short_desc": truncate(desc) if desc else None,
        "start_date": start,
        "end_date": None,
        "image_url": image,
        **price,
        "booking_url": url,
        "source": "fnacspectacles",
        "source_id": f"fnac-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": "",
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "category_slug": category,
        "tags": [cat_slug],
        "quality_score": compute_quality_score(title, desc, image, start, price_raw, url),
    }


def _zip_to_arrondissement(zip_code: Optional[str]) -> Optional[str]:
    """Convert 750XX postal code to arrondissement."""
    if not zip_code:
        return None
    m = re.match(r'750(\d{2})', zip_code)
    if m:
        arr = int(m.group(1))
        if 1 <= arr <= 20:
            return f"{arr}e" if arr != 1 else "1er"
    return None
