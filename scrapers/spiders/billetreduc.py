"""
BilletReduc spider.
Source: https://www.billetreduc.com
Major French discount ticketing platform — excellent for theatre, stand-up,
spectacles, and comedy shows in Paris. Great coverage of small venues.

Strategy: Fetch listing pages to collect show URLs, then fetch each detail page
which contains JSON-LD structured data with full event info (dates, venue, price).
"""

import json
import re
import time
from datetime import datetime
from typing import Generator, Optional
from bs4 import BeautifulSoup
import httpx

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    compute_quality_score,
)

BASE_URL = "https://www.billetreduc.com"

# Updated URLs — site moved from /theatre-paris.htm to /theatre etc.
LISTING_URLS = [
    (f"{BASE_URL}/theatre", "theatre"),
    (f"{BASE_URL}/humour", "spectacles"),
    (f"{BASE_URL}/spectacles", "spectacles"),
    (f"{BASE_URL}/concerts", "concerts"),
    (f"{BASE_URL}/comedie", "spectacles"),
    (f"{BASE_URL}/a-paris/", None),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}


def fetch_events(max_pages_per_cat: int = 3) -> Generator[dict, None, None]:
    """Fetch events from BilletReduc listing + detail pages with JSON-LD."""

    seen_urls: set[str] = set()

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        for listing_url, default_category in LISTING_URLS:
            cat_name = listing_url.rstrip("/").split("/")[-1]
            print(f"  Fetching BilletReduc: {cat_name}...")

            for page in range(1, max_pages_per_cat + 1):
                url = f"{listing_url}?page={page}" if page > 1 else listing_url

                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                except Exception as e:
                    print(f"  Error fetching {url}: {e}")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Collect show detail links from listing
                show_links = set()
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    if "/spectacle/" in href:
                        full_url = href if href.startswith("http") else f"{BASE_URL}{href}"
                        if full_url not in seen_urls:
                            show_links.add(full_url)

                if not show_links:
                    print(f"    Page {page}: no show links found, stopping")
                    break

                count = 0
                for show_url in show_links:
                    seen_urls.add(show_url)
                    event = fetch_show_detail(client, show_url, default_category)
                    if event:
                        yield event
                        count += 1
                    time.sleep(0.3)  # polite delay

                print(f"    Page {page}: {count} events from {len(show_links)} links")
                time.sleep(0.5)


def fetch_show_detail(client: httpx.Client, url: str, default_category: Optional[str]) -> Optional[dict]:
    """Fetch a show detail page and extract JSON-LD Event data."""
    try:
        resp = client.get(url)
        resp.raise_for_status()
    except Exception as e:
        print(f"    Error fetching detail {url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract JSON-LD structured data
    json_ld = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and data.get("@type") == "Event":
                json_ld = data
                break
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "Event":
                        json_ld = item
                        break
        except (json.JSONDecodeError, TypeError):
            continue

    if json_ld:
        return parse_json_ld(json_ld, url, default_category)

    # Fallback: parse HTML directly
    return parse_detail_html(soup, url, default_category)


def parse_json_ld(data: dict, url: str, default_category: Optional[str]) -> Optional[dict]:
    """Parse a JSON-LD Event object into our standard format."""
    title = clean_text(data.get("name"))
    if not title:
        return None

    description = clean_text(data.get("description"))
    start_date = data.get("startDate")
    end_date = data.get("endDate")
    image_url = data.get("image")
    if isinstance(image_url, list):
        image_url = image_url[0] if image_url else None

    # Venue
    location = data.get("location", {})
    venue_name = None
    venue_address = None
    venue_zip = None
    if isinstance(location, dict):
        venue_name = location.get("name")
        address = location.get("address", {})
        if isinstance(address, dict):
            venue_address = address.get("streetAddress")
            venue_zip = address.get("postalCode")
        elif isinstance(address, str):
            venue_address = address

    # Price from offers
    price_min = None
    price_max = None
    is_free = False
    offers = data.get("offers", {})
    if isinstance(offers, dict):
        price_val = offers.get("price")
        if price_val is not None:
            try:
                price_min = int(float(price_val) * 100)
            except (ValueError, TypeError):
                pass
    elif isinstance(offers, list):
        prices = []
        for offer in offers:
            p = offer.get("price")
            if p is not None:
                try:
                    prices.append(int(float(p) * 100))
                except (ValueError, TypeError):
                    pass
        if prices:
            price_min = min(prices)
            price_max = max(prices) if len(prices) > 1 else None

    if price_min is not None and price_min == 0:
        is_free = True

    # Category
    category_slug = default_category
    if not category_slug:
        all_text = f"{title} {description or ''}".lower()
        if any(kw in all_text for kw in ["concert", "musique", "live"]):
            category_slug = "concerts"
        elif any(kw in all_text for kw in ["humour", "stand-up", "one man", "sketch"]):
            category_slug = "spectacles"
        elif any(kw in all_text for kw in ["danse", "ballet"]):
            category_slug = "danse"
        elif any(kw in all_text for kw in ["exposition", "expo"]):
            category_slug = "expos"
        else:
            category_slug = "theatre"

    # Arrondissement from zip
    arrondissement = None
    if venue_zip and venue_zip.startswith("750"):
        try:
            arrondissement = str(int(venue_zip[3:]))
        except ValueError:
            pass

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=str(price_min) if price_min else None,
        booking_url=url,
    )

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "short_desc": truncate(description),
        "image_url": image_url,
        "start_date": start_date,
        "end_date": end_date,
        "price_min": price_min,
        "price_max": price_max,
        "is_free": is_free,
        "booking_url": url,
        "source": "billetreduc",
        "source_url": url,
        "source_id": slug,
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_city": "Paris",
        "venue_zip": venue_zip,
        "venue_arrondissement": arrondissement,
        "venue_lat": None,
        "venue_lng": None,
        "raw_category": default_category or category_slug,
        "category_slug": category_slug,
        "tags": [],
        "quality_score": quality,
    }


def parse_detail_html(soup: BeautifulSoup, url: str, default_category: Optional[str]) -> Optional[dict]:
    """Fallback: parse the detail page HTML when no JSON-LD is present."""
    title_el = soup.find("h1")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 3:
        return None

    # Description
    desc_el = soup.select_one(".description, .synopsis, [class*='description'], [class*='synopsis']")
    description = clean_text(desc_el.get_text()) if desc_el else None

    # Image
    og_img = soup.find("meta", property="og:image")
    image_url = og_img["content"] if og_img and og_img.get("content") else None

    # Venue
    venue_el = soup.select_one("[class*='lieu'], [class*='theatre'], [class*='venue']")
    venue_name = clean_text(venue_el.get_text()) if venue_el else None

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
        "booking_url": url, "source": "billetreduc",
        "source_url": url, "source_id": slug,
        "venue_name": venue_name, "venue_address": None,
        "venue_city": "Paris", "venue_zip": None,
        "venue_arrondissement": None,
        "venue_lat": None, "venue_lng": None,
        "raw_category": default_category or "theatre",
        "category_slug": default_category or "theatre",
        "tags": [], "quality_score": quality,
    }
