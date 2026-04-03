"""
Timeout Paris spider.
Source: https://www.timeout.fr/paris (redirected from timeout.com)
Major international events guide — excellent curated content for Paris.

Strategy: Fetch listing pages from timeout.fr (new domain after redirect).
Extract event cards from server-rendered HTML. Follow detail page links
to get JSON-LD structured data when available.
"""

import json
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

# Site redirected from timeout.com to timeout.fr
BASE_URL = "https://www.timeout.fr"

LISTING_PAGES = [
    (f"{BASE_URL}/paris/que-faire-a-paris", None),
    (f"{BASE_URL}/paris/musique", "concerts"),
    (f"{BASE_URL}/paris/theatre", "theatre"),
    (f"{BASE_URL}/paris/art", "expos"),
    (f"{BASE_URL}/paris/nightlife", "concerts"),
    (f"{BASE_URL}/paris/que-faire-a-paris/activites-gratuites-a-paris", None),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


def fetch_events(max_pages: int = 3) -> Generator[dict, None, None]:
    """Fetch events from Timeout Paris."""

    seen_slugs: set[str] = set()

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        for listing_url, default_category in LISTING_PAGES:
            cat_name = listing_url.rstrip("/").split("/")[-1]
            print(f"  Fetching Timeout: {cat_name}...")

            for page in range(1, max_pages + 1):
                url = f"{listing_url}?page={page}" if page > 1 else listing_url

                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                except Exception as e:
                    print(f"  Error: {e}")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Strategy 1: Extract from JSON-LD on the page
                events_from_ld = extract_json_ld_events(soup, default_category)
                if events_from_ld:
                    for event in events_from_ld:
                        if event["slug"] not in seen_slugs:
                            seen_slugs.add(event["slug"])
                            yield event
                    print(f"    Page {page}: {len(events_from_ld)} events (JSON-LD)")
                    continue

                # Strategy 2: Parse HTML cards
                # Cards are <a> tags linking to /paris/ subpages with img + h3
                cards = []
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    # Filter for event-like links (not /paris/restaurants, /paris/hotels, etc.)
                    if not re.search(r"/paris/[a-z-]+/[a-z0-9-]+", href):
                        continue
                    # Must have a title-like element
                    title_el = a_tag.find(["h2", "h3", "h4"])
                    if title_el:
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

                print(f"    Page {page}: {count} events (HTML)")
                if count == 0:
                    break

                time.sleep(0.5)

        # Strategy 3: Fetch detail pages for richer data
        # For top events, follow links to get JSON-LD from detail pages
        print("  Fetching Timeout detail pages for enrichment...")
        detail_count = 0
        for listing_url, default_category in LISTING_PAGES[:3]:
            try:
                resp = client.get(listing_url)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "html.parser")

                detail_links = set()
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    full_url = href if href.startswith("http") else f"{BASE_URL}{href}"
                    if re.search(r"/paris/[a-z-]+/[a-z0-9-]+$", href) and full_url not in seen_slugs:
                        # Skip listicle/guide links
                        if not any(x in href for x in ["/best-", "/top-", "/meilleur", "/guide", "/calendrier"]):
                            detail_links.add(full_url)

                for detail_url in list(detail_links)[:15]:
                    event = fetch_detail_page(client, detail_url, default_category)
                    if event and event["slug"] not in seen_slugs:
                        seen_slugs.add(event["slug"])
                        yield event
                        detail_count += 1
                    time.sleep(0.3)

            except Exception:
                continue

        if detail_count:
            print(f"  Detail pages: {detail_count} additional events")


def extract_json_ld_events(soup: BeautifulSoup, default_category: Optional[str]) -> list[dict]:
    """Extract events from JSON-LD scripts on a listing page."""
    events = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and item.get("@type") == "Event":
                    event = parse_json_ld_event(item, default_category)
                    if event:
                        events.append(event)
        except (json.JSONDecodeError, TypeError):
            continue
    return events


def fetch_detail_page(client: httpx.Client, url: str, default_category: Optional[str]) -> Optional[dict]:
    """Fetch a detail page and extract event from JSON-LD."""
    try:
        resp = client.get(url)
        resp.raise_for_status()
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try JSON-LD first
    events = extract_json_ld_events(soup, default_category)
    if events:
        return events[0]

    # Fallback: parse the detail page HTML
    title_el = soup.find("h1")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 5:
        return None

    # Skip listicles
    if re.match(r"^\d+\s+(meilleur|best|top)", title.lower()):
        return None

    description = None
    for sel in ["[class*='summary']", "[class*='description']", "article p"]:
        desc_el = soup.select_one(sel)
        if desc_el:
            description = clean_text(desc_el.get_text())
            if description and len(description) > 30:
                break

    og_img = soup.find("meta", property="og:image")
    image_url = og_img["content"] if og_img and og_img.get("content") else None

    category_slug = default_category or detect_category(None, title, description)
    slug = generate_slug(title, None)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=None, price_raw=None, booking_url=url,
    )

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description), "image_url": image_url,
        "start_date": None, "end_date": None,
        "price_min": None, "price_max": None, "is_free": False,
        "booking_url": url, "source": "timeout",
        "source_url": url, "source_id": slug,
        "venue_name": None, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_json_ld_event(data: dict, default_category: Optional[str]) -> Optional[dict]:
    """Parse a JSON-LD Event object."""
    title = clean_text(data.get("name"))
    if not title:
        return None

    description = clean_text(data.get("description"))
    start_date = data.get("startDate")
    end_date = data.get("endDate")
    image_url = data.get("image")
    if isinstance(image_url, list):
        image_url = image_url[0] if image_url else None
    event_url = data.get("url")

    location = data.get("location", {})
    venue_name = None
    if isinstance(location, dict):
        venue_name = location.get("name")

    offers = data.get("offers", {})
    price_min = None
    is_free = False
    if isinstance(offers, dict):
        price_val = offers.get("price")
        if price_val is not None:
            try:
                price_min = int(float(price_val) * 100)
            except (ValueError, TypeError):
                pass

    if price_min == 0:
        is_free = True

    all_text = f"{title} {description or ''}".lower()
    if "gratuit" in all_text or "free" in all_text or "entrée libre" in all_text:
        is_free = True

    category_slug = default_category or detect_category(None, title, description)
    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=None, booking_url=event_url,
    )

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description), "image_url": image_url,
        "start_date": start_date, "end_date": end_date,
        "price_min": price_min, "price_max": None, "is_free": is_free,
        "booking_url": event_url, "source": "timeout",
        "source_url": event_url or BASE_URL, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }


def parse_card(card, default_category: Optional[str]) -> Optional[dict]:
    """Parse an HTML card element from the listing page."""
    title_el = card.find(["h2", "h3", "h4"])
    if not title_el:
        return None

    title = clean_text(title_el.get_text())
    if not title or len(title) < 5:
        return None

    # Skip listicles
    if re.match(r"^\d+\s+(meilleur|best|top)", title.lower()):
        return None

    href = card.get("href", "")
    event_url = href if href.startswith("http") else f"{BASE_URL}{href}"

    # Skip non-event pages
    if any(x in event_url for x in ["/best-", "/top-", "/meilleur", "/guide", "/calendrier"]):
        return None

    img_el = card.find("img")
    image_url = None
    if img_el:
        src = img_el.get("src") or img_el.get("data-src")
        if src and src.startswith("http"):
            image_url = src

    description = None
    desc_el = card.find("p")
    if desc_el:
        description = clean_text(desc_el.get_text())

    is_free = False
    all_text = f"{title} {description or ''}".lower()
    if "gratuit" in all_text or "free" in all_text:
        is_free = True

    category_slug = default_category or detect_category(None, title, description)
    slug = generate_slug(title, None)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=None, price_raw=None, booking_url=event_url,
    )

    return {
        "title": title, "slug": slug, "description": description,
        "short_desc": truncate(description), "image_url": image_url,
        "start_date": None, "end_date": None,
        "price_min": None, "price_max": None, "is_free": is_free,
        "booking_url": event_url, "source": "timeout",
        "source_url": event_url, "source_id": slug,
        "venue_name": None, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category, "category_slug": category_slug,
        "tags": [], "quality_score": quality,
    }
