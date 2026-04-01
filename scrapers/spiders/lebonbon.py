"""
Le Bonbon Paris spider.
Source: https://www.lebonbon.fr/paris/sorties/
Trendy Parisian events guide — soirées, festivals, concerts, loisirs, culture.

Pages embed JSON data (JSON-LD / inline JS). Pagination via ?page=N.
Multiple category sub-pages for broad coverage.
"""

import hashlib
import httpx
import json
import re
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

BASE_URL = "https://www.lebonbon.fr"

# (path, default_category_slug)
LISTING_PAGES = [
    ("/paris/sorties/", None),
    ("/paris/sorties/soirees/", "concert"),
    ("/paris/sorties/festivals-concerts/", "concert"),
    ("/paris/sorties/loisirs/", "atelier"),
    ("/paris/sorties/culture/", "expo"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_DELAY = 1.2  # seconds between requests


def fetch_events(max_pages: int = 10) -> Generator[dict, None, None]:
    """Fetch events from Le Bonbon Paris."""
    seen_slugs: set[str] = set()

    with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        for listing_path, default_cat in LISTING_PAGES:
            for page in range(1, max_pages + 1):
                url = f"{BASE_URL}{listing_path}"
                if page > 1:
                    url += f"?page={page}"

                cat_label = listing_path.rstrip("/").split("/")[-1] or "all"
                print(f"  [LeBonbon] {cat_label} page {page}...")

                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                except Exception as e:
                    print(f"  [LeBonbon] Error fetching {url}: {e}")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")
                count = 0

                # Strategy 1: JSON-LD
                for event in _extract_jsonld(soup, default_cat):
                    if event and event["slug"] not in seen_slugs:
                        seen_slugs.add(event["slug"])
                        yield event
                        count += 1

                # Strategy 2: Embedded JS data (__NEXT_DATA__ or inline JSON)
                if count == 0:
                    for event in _extract_inline_json(soup, resp.text, default_cat):
                        if event and event["slug"] not in seen_slugs:
                            seen_slugs.add(event["slug"])
                            yield event
                            count += 1

                # Strategy 3: HTML card parsing
                if count == 0:
                    for event in _parse_html_cards(soup, default_cat):
                        if event and event["slug"] not in seen_slugs:
                            seen_slugs.add(event["slug"])
                            yield event
                            count += 1

                print(f"  [LeBonbon] Found {count} events")
                if count == 0:
                    break

                time.sleep(REQUEST_DELAY)


# ---------------------------------------------------------------------------
# Extraction strategies
# ---------------------------------------------------------------------------

def _extract_jsonld(soup: BeautifulSoup, default_cat: Optional[str]) -> Generator[dict, None, None]:
    """Extract events from JSON-LD <script> tags."""
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "")
            items = []
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                if data.get("@type") == "Event":
                    items = [data]
                elif "itemListElement" in data:
                    items = [
                        el.get("item", el)
                        for el in data["itemListElement"]
                        if isinstance(el, dict)
                    ]
            for item in items:
                if item.get("@type") == "Event":
                    event = _build_from_jsonld(item, default_cat)
                    if event:
                        yield event
        except (json.JSONDecodeError, TypeError, KeyError):
            continue


def _extract_inline_json(
    soup: BeautifulSoup, raw_html: str, default_cat: Optional[str]
) -> Generator[dict, None, None]:
    """Extract events from inline JS data (window.__NEXT_DATA__, etc.)."""
    # Look for __NEXT_DATA__
    next_data_tag = soup.select_one("script#__NEXT_DATA__")
    if next_data_tag and next_data_tag.string:
        try:
            data = json.loads(next_data_tag.string)
            yield from _walk_json_for_events(data, default_cat)
            return
        except (json.JSONDecodeError, TypeError):
            pass

    # Look for inline JSON blobs with event-like data
    patterns = [
        r"window\.__DATA__\s*=\s*({.+?})\s*;",
        r"window\.__INITIAL_STATE__\s*=\s*({.+?})\s*;",
        r'"posts_title"\s*:\s*"',  # Le Bonbon specific
    ]
    for script in soup.select("script:not([src])"):
        text = script.string or ""
        if not text:
            continue

        # Try to find JSON assignments
        for pattern in patterns[:2]:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(1))
                    yield from _walk_json_for_events(data, default_cat)
                    return
                except (json.JSONDecodeError, TypeError):
                    continue

        # Le Bonbon specific: look for arrays of post objects
        if "posts_title" in text:
            # Find JSON arrays in the script
            for arr_match in re.finditer(r"\[{.+?}\]", text, re.DOTALL):
                try:
                    arr = json.loads(arr_match.group(0))
                    if isinstance(arr, list):
                        for item in arr:
                            if isinstance(item, dict) and item.get("posts_title"):
                                event = _build_from_bonbon_post(item, default_cat)
                                if event:
                                    yield event
                except (json.JSONDecodeError, TypeError):
                    continue


def _walk_json_for_events(data, default_cat: Optional[str], depth: int = 0):
    """Recursively walk JSON to find event-like objects."""
    if depth > 8:
        return
    if isinstance(data, dict):
        # JSON-LD event
        if data.get("@type") == "Event" and data.get("name"):
            event = _build_from_jsonld(data, default_cat)
            if event:
                yield event
        # Le Bonbon post format
        elif data.get("posts_title"):
            event = _build_from_bonbon_post(data, default_cat)
            if event:
                yield event
        else:
            for v in data.values():
                yield from _walk_json_for_events(v, default_cat, depth + 1)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_json_for_events(item, default_cat, depth + 1)


def _parse_html_cards(
    soup: BeautifulSoup, default_cat: Optional[str]
) -> Generator[dict, None, None]:
    """Fallback: parse HTML article/card elements."""
    # Try common card selectors
    cards = soup.select(
        "article, [class*='card'], [class*='post'], "
        "[class*='event'], [class*='article-item']"
    )
    if not cards:
        # Broader: any link with an image + heading nearby
        cards = soup.select("a[href*='/paris/']")

    for card in cards:
        try:
            event = _build_from_html_card(card, default_cat)
            if event:
                yield event
        except Exception:
            continue


# ---------------------------------------------------------------------------
# Event builders
# ---------------------------------------------------------------------------

def _build_from_jsonld(data: dict, default_cat: Optional[str]) -> Optional[dict]:
    """Build standard event dict from a JSON-LD Event object."""
    title = clean_text(data.get("name", ""))
    if not title or len(title) < 5:
        return None

    description = clean_text(data.get("description", ""))
    image_url = _extract_image(data.get("image"))

    start_date = _parse_iso_date(data.get("startDate"))
    end_date = _parse_iso_date(data.get("endDate"))

    venue_name, venue_address, venue_city, venue_zip, arrondissement = _extract_location(
        data.get("location", {})
    )

    price_min, price_max, is_free = _extract_offers(data.get("offers"))

    event_url = data.get("url", "")
    if event_url and not event_url.startswith("http"):
        event_url = f"{BASE_URL}{event_url}"

    category_slug = detect_category(default_cat, title, description) or default_cat

    slug = generate_slug(title, start_date)
    source_id = _make_source_id(event_url, title)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date,
        price_raw=str(price_min) if price_min else None,
        booking_url=event_url,
    )

    return _make_event_dict(
        title=title, slug=slug, description=description,
        image_url=image_url, start_date=start_date, end_date=end_date,
        price_min=price_min, price_max=price_max, is_free=is_free,
        event_url=event_url, source_id=source_id,
        venue_name=venue_name, venue_address=venue_address,
        venue_city=venue_city, venue_zip=venue_zip,
        arrondissement=arrondissement,
        category_slug=category_slug, quality=quality,
    )


def _build_from_bonbon_post(post: dict, default_cat: Optional[str]) -> Optional[dict]:
    """Build event dict from Le Bonbon's custom post format."""
    title = clean_text(post.get("posts_title", ""))
    if not title or len(title) < 5:
        return None

    # URL
    event_url = post.get("posts_url", "")
    if event_url and not event_url.startswith("http"):
        event_url = f"{BASE_URL}{event_url}"

    # Date
    date_str = post.get("posts_display_date") or post.get("posts_date")
    start_date = _parse_iso_date(date_str) if date_str else None

    # Image — Le Bonbon has multi-resolution pictures
    image_url = None
    pictures = post.get("pictures")
    if isinstance(pictures, dict):
        # Prefer 800px, fall back to largest available
        for size in ["800", "1200", "400", "2000", "180"]:
            if size in pictures:
                image_url = pictures[size]
                break
    elif isinstance(pictures, str):
        image_url = pictures

    # Category from post data
    raw_cat = post.get("categories_name", "")
    cat_map = {
        "soirées": "concert", "soirees": "concert",
        "festivals & concerts": "concert", "festivals": "festival",
        "culture": "expo", "loisirs": "atelier",
        "bons plans": None, "voyages": None,
    }
    mapped_cat = cat_map.get(raw_cat.lower()) if raw_cat else None
    category_slug = detect_category(mapped_cat or default_cat, title) or mapped_cat or default_cat

    description = clean_text(post.get("posts_excerpt", "")) or None

    slug = generate_slug(title, start_date)
    source_id = _make_source_id(event_url, title)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=None, booking_url=event_url,
    )

    return _make_event_dict(
        title=title, slug=slug, description=description,
        image_url=image_url, start_date=start_date, end_date=None,
        price_min=0, price_max=0, is_free=False,
        event_url=event_url, source_id=source_id,
        venue_name=None, venue_address=None,
        venue_city="Paris", venue_zip=None, arrondissement=None,
        category_slug=category_slug, quality=quality,
    )


def _build_from_html_card(card, default_cat: Optional[str]) -> Optional[dict]:
    """Build event dict from an HTML card element."""
    # Title
    title_el = card.select_one("h2, h3, h4, [class*='title']")
    if not title_el:
        if card.name == "a" and card.get_text(strip=True):
            title = clean_text(card.get_text())
        else:
            return None
    else:
        title = clean_text(title_el.get_text())

    if not title or len(title) < 5 or len(title) > 300:
        return None

    # Link
    link = card.get("href") if card.name == "a" else None
    if not link:
        link_el = card.select_one("a[href]")
        if link_el:
            link = link_el.get("href")
    event_url = ""
    if link:
        event_url = link if link.startswith("http") else f"{BASE_URL}{link}"

    # Image
    img_el = card.select_one("img[src], img[data-src], img[data-lazy-src]")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src") or img_el.get("data-lazy-src")
        if src and not src.startswith("data:"):
            image_url = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Date
    time_el = card.select_one("time[datetime]")
    start_date = None
    if time_el and time_el.get("datetime"):
        start_date = _parse_iso_date(time_el["datetime"])
    if not start_date:
        date_el = card.select_one("[class*='date'], .date")
        if date_el:
            start_date = _parse_french_date(clean_text(date_el.get_text()))

    # Category badge
    cat_el = card.select_one("[class*='category'], [class*='tag'], .category")
    raw_cat = clean_text(cat_el.get_text()) if cat_el else None
    category_slug = detect_category(raw_cat or default_cat, title) or default_cat

    slug = generate_slug(title, start_date)
    source_id = _make_source_id(event_url, title)
    quality = compute_quality_score(
        title=title, description=None, image_url=image_url,
        start_date=start_date, price_raw=None, booking_url=event_url,
    )

    return _make_event_dict(
        title=title, slug=slug, description=None,
        image_url=image_url, start_date=start_date, end_date=None,
        price_min=0, price_max=0, is_free=False,
        event_url=event_url, source_id=source_id,
        venue_name=None, venue_address=None,
        venue_city="Paris", venue_zip=None, arrondissement=None,
        category_slug=category_slug, quality=quality,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_event_dict(**kwargs) -> dict:
    """Build the standard 26-field event dict."""
    return {
        "title": kwargs["title"],
        "slug": kwargs["slug"],
        "description": kwargs.get("description"),
        "short_desc": truncate(kwargs.get("description")),
        "image_url": kwargs.get("image_url"),
        "start_date": kwargs.get("start_date"),
        "end_date": kwargs.get("end_date"),
        "price_min": kwargs.get("price_min", 0),
        "price_max": kwargs.get("price_max", 0),
        "is_free": kwargs.get("is_free", False),
        "booking_url": kwargs.get("event_url", ""),
        "source": "lebonbon",
        "source_url": kwargs.get("event_url", ""),
        "source_id": kwargs.get("source_id", kwargs["slug"]),
        "venue_name": kwargs.get("venue_name"),
        "venue_address": kwargs.get("venue_address"),
        "venue_city": kwargs.get("venue_city", "Paris"),
        "venue_zip": kwargs.get("venue_zip"),
        "venue_arrondissement": kwargs.get("arrondissement"),
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": None,
        "category_slug": kwargs.get("category_slug"),
        "tags": [],
        "quality_score": kwargs.get("quality", 0),
    }


def _make_source_id(url: str, title: str) -> str:
    """Generate a stable source_id from URL or title."""
    key = url if url else title
    return f"lb-{hashlib.md5(key.encode()).hexdigest()[:12]}"


def _extract_image(img_data) -> Optional[str]:
    """Extract image URL from JSON-LD image field."""
    if isinstance(img_data, str):
        return img_data
    if isinstance(img_data, list) and img_data:
        return img_data[0] if isinstance(img_data[0], str) else None
    if isinstance(img_data, dict):
        return img_data.get("url")
    return None


def _extract_location(loc) -> tuple:
    """Extract venue info from JSON-LD location. Returns (name, address, city, zip, arrondissement)."""
    if not isinstance(loc, dict):
        return (None, None, "Paris", None, None)

    name = loc.get("name")
    address = loc.get("address", {})
    street = city = zipcode = None

    if isinstance(address, dict):
        street = address.get("streetAddress")
        city = address.get("addressLocality", "Paris")
        zipcode = address.get("postalCode")
    elif isinstance(address, str):
        street = address

    arrondissement = None
    if zipcode and re.match(r"750\d{2}", str(zipcode)):
        arr_num = int(str(zipcode)[-2:])
        if 1 <= arr_num <= 20:
            arrondissement = f"{arr_num}e"

    return (name, street, city or "Paris", zipcode, arrondissement)


def _extract_offers(offers) -> tuple[int, int, bool]:
    """Extract price info from JSON-LD offers. Returns (price_min, price_max, is_free) in centimes."""
    if not offers:
        return (0, 0, False)

    prices = []
    items = offers if isinstance(offers, list) else [offers]
    for offer in items:
        if not isinstance(offer, dict):
            continue
        p = offer.get("price")
        if p is not None:
            try:
                prices.append(int(float(p) * 100))
            except (ValueError, TypeError):
                pass

    if prices:
        return (min(prices), max(prices), min(prices) == 0)
    return (0, 0, False)


def _parse_iso_date(val) -> Optional[str]:
    """Parse an ISO 8601 date string, return normalized ISO or None."""
    if not val or not isinstance(val, str):
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt.isoformat()
    except (ValueError, TypeError):
        pass
    # Try just date portion
    try:
        dt = datetime.strptime(val[:10], "%Y-%m-%d")
        return dt.isoformat()
    except (ValueError, TypeError):
        pass
    return None


def _parse_french_date(text: str) -> Optional[str]:
    """Parse French date text (e.g. '15 avril 2026')."""
    if not text:
        return None
    months = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
    }
    text_lower = text.lower()
    for name, num in months.items():
        if name in text_lower:
            m = re.search(r"(\d{1,2})\s+" + re.escape(name), text_lower)
            if m:
                day = int(m.group(1))
                year = datetime.now().year
                ym = re.search(r"(\d{4})", text)
                if ym:
                    year = int(ym.group(1))
                try:
                    return datetime(year, num, day, 10, 0).isoformat()
                except ValueError:
                    pass
    return None
