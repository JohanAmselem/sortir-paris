"""
Mapado scraper — Large aggregator of cultural events in Paris.
Source: https://www.mapado.com/paris

Covers concerts, theatre, expos, comedy, dance, and more.
High volume: thousands of events across all categories.
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

LISTING_URLS = [
    ("https://www.mapado.com/paris/concerts", "concerts"),
    ("https://www.mapado.com/paris/theatre", "theatre"),
    ("https://www.mapado.com/paris/humour", "spectacles"),
    ("https://www.mapado.com/paris/expositions", "expos"),
    ("https://www.mapado.com/paris/danse", "danse"),
    ("https://www.mapado.com/paris/spectacles-enfants", "spectacles"),
    ("https://www.mapado.com/paris/festivals", "festivals"),
    ("https://www.mapado.com/paris/soirees", "concerts"),
    ("https://www.mapado.com/paris/classique-opera", "concerts"),
    ("https://www.mapado.com/paris/conferences", "conferences"),
]

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
    """Parse French date string to ISO."""
    text = text.lower().strip()
    m = re.search(r'(\d{1,2})\s+(\w+)\.?\s+(\d{4})', text)
    if m:
        day = int(m.group(1))
        month_str = m.group(2).rstrip(".")
        month = MONTHS_FR.get(month_str)
        year = int(m.group(3))
        if month:
            return f"{year}-{month:02d}-{day:02d}"

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
    """Extract time from text."""
    m = re.search(r'(\d{1,2})[hH:](\d{2})?', text)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"
    return None


def _zip_to_arrondissement(zip_code: Optional[str]) -> Optional[str]:
    if not zip_code:
        return None
    m = re.match(r'750(\d{2})', zip_code)
    if m:
        arr = int(m.group(1))
        if 1 <= arr <= 20:
            return f"{arr}e" if arr != 1 else "1er"
    return None


def fetch_events(
    max_pages_per_cat: int = 5,
) -> Generator[dict, None, None]:
    """Fetch events from Mapado across all categories."""
    client = httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True)
    seen = set()

    for base_url, cat_slug in LISTING_URLS:
        for page in range(1, max_pages_per_cat + 1):
            try:
                url = base_url if page == 1 else f"{base_url}?page={page}"
                resp = client.get(url)

                if resp.status_code != 200:
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # JSON-LD extraction
                for script in soup.select('script[type="application/ld+json"]'):
                    try:
                        ld = json.loads(script.string or "")
                        items = ld if isinstance(ld, list) else [ld]
                        for item in items:
                            if item.get("@type") in ("Event", "MusicEvent", "TheaterEvent", "DanceEvent", "ExhibitionEvent"):
                                result = _parse_jsonld(item, cat_slug, seen)
                                if result:
                                    yield result
                            elif item.get("@type") == "ItemList":
                                for list_item in item.get("itemListElement", []):
                                    inner = list_item.get("item", list_item)
                                    if inner.get("@type") in ("Event", "MusicEvent", "TheaterEvent", "DanceEvent"):
                                        result = _parse_jsonld(inner, cat_slug, seen)
                                        if result:
                                            yield result
                    except (json.JSONDecodeError, KeyError):
                        pass

                # HTML cards
                cards = soup.select(".card, article, [class*=event-card], [class*=activity-card], .search-result, .list-item")
                if not cards:
                    cards = soup.select("a[href*='/evenement/'], a[href*='/spectacle/'], a[href*='/concert/']")

                if not cards and page > 1:
                    break

                for card in cards:
                    result = _parse_card(card, cat_slug, seen)
                    if result:
                        yield result

                # Also try __NEXT_DATA__ (if Next.js app)
                next_data = soup.select_one('script#__NEXT_DATA__')
                if next_data:
                    try:
                        nd = json.loads(next_data.string or "")
                        props = nd.get("props", {}).get("pageProps", {})
                        activities = props.get("activities", props.get("events", props.get("results", [])))
                        if isinstance(activities, list):
                            for act in activities:
                                result = _parse_nextdata_item(act, cat_slug, seen)
                                if result:
                                    yield result
                    except (json.JSONDecodeError, KeyError):
                        pass

                print(f"  Mapado: {cat_slug} page {page} OK")
                time.sleep(1.5)

            except Exception as e:
                print(f"  Mapado: {cat_slug} page {page} error: {e}")
                time.sleep(2)

    client.close()


def _parse_jsonld(data: dict, cat_slug: str, seen: set) -> Optional[dict]:
    """Parse JSON-LD Event."""
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
        if low:
            price_raw = f"{low}€" + (f" - {high}€" if high else "")

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
        "booking_url": url,
        "source": "mapado",
        "source_id": f"mapado-{slug}",
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


def _parse_card(card, cat_slug: str, seen: set) -> Optional[dict]:
    """Parse an HTML card from Mapado."""
    from bs4 import Tag
    if not isinstance(card, Tag):
        return None

    title_el = card.select_one("h2, h3, h4, .title, [class*=title], [class*=name]")
    if not title_el:
        # Try the card itself as a link
        if card.name == "a" and card.get("href"):
            title = clean_text(card.get("title") or card.get_text())
        else:
            return None
    else:
        title = clean_text(title_el.get_text())

    if not title or len(title) < 3:
        return None

    # Skip nav
    if title.lower() in ("voir plus", "résultats", "page suivante", "charger plus"):
        return None

    link_el = card.select_one("a[href]") if card.name != "a" else card
    url = ""
    if link_el:
        url = link_el.get("href", "")
        if url and not url.startswith("http"):
            url = f"https://www.mapado.com{url}"

    img_el = card.select_one("img[src], img[data-src]")
    image = None
    if img_el:
        image = img_el.get("data-src") or img_el.get("src")
        if image and image.startswith("//"):
            image = "https:" + image

    date_el = card.select_one("time, .date, [class*=date], [class*=when]")
    start = None
    if date_el:
        start = date_el.get("datetime")
        if not start:
            dt = clean_text(date_el.get_text())
            if dt:
                start = _parse_french_date(dt)
                t = _extract_time(dt)
                if start and t:
                    start = f"{start}T{t}:00"
                elif start:
                    start = f"{start}T20:00:00"

    venue_el = card.select_one("[class*=venue], [class*=lieu], [class*=location], [class*=place]")
    venue_name = clean_text(venue_el.get_text()) if venue_el else ""

    price_el = card.select_one("[class*=price], [class*=prix], [class*=tarif]")
    price_raw = clean_text(price_el.get_text()) if price_el else ""
    price = parse_price(price_raw)

    desc_el = card.select_one("p, .description, [class*=desc]")
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
        "source": "mapado",
        "source_id": f"mapado-{slug}",
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


def _parse_nextdata_item(item: dict, cat_slug: str, seen: set) -> Optional[dict]:
    """Parse an item from __NEXT_DATA__ props."""
    title = item.get("title") or item.get("name") or item.get("shortTitle")
    if not title:
        return None

    title = clean_text(title)
    start = item.get("firstDate") or item.get("startDate") or item.get("date")
    end = item.get("lastDate") or item.get("endDate")
    desc = item.get("description") or item.get("shortDescription")
    image = item.get("image") or item.get("imagePath") or item.get("poster")
    if image and not image.startswith("http"):
        image = f"https://www.mapado.com{image}" if image.startswith("/") else None

    url = item.get("url") or item.get("frontUrl") or ""
    if url and not url.startswith("http"):
        url = f"https://www.mapado.com{url}"

    venue = item.get("venue") or item.get("place") or {}
    venue_name = venue.get("name", "") if isinstance(venue, dict) else str(venue)

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    price_min = item.get("priceMin") or item.get("minPrice") or 0
    price_max = item.get("priceMax") or item.get("maxPrice") or 0
    is_free = item.get("isFree", False)

    # Convert to centimes if needed
    if isinstance(price_min, float) and price_min < 1000:
        price_min = int(price_min * 100)
    if isinstance(price_max, float) and price_max < 1000:
        price_max = int(price_max * 100)

    category = detect_category(cat_slug, title, desc) or cat_slug

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)) if desc else None,
        "start_date": start,
        "end_date": end,
        "image_url": image,
        "price_min": int(price_min) if price_min else 0,
        "price_max": int(price_max) if price_max else 0,
        "is_free": is_free,
        "booking_url": url,
        "source": "mapado",
        "source_id": f"mapado-{item.get('id', slug)}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": venue.get("address", "") if isinstance(venue, dict) else "",
        "venue_city": "Paris",
        "venue_zip": venue.get("postalCode") if isinstance(venue, dict) else None,
        "venue_arrondissement": _zip_to_arrondissement(venue.get("postalCode") if isinstance(venue, dict) else None),
        "category_slug": category,
        "tags": [cat_slug],
        "quality_score": compute_quality_score(title, clean_text(desc), image, start, None, url),
    }
