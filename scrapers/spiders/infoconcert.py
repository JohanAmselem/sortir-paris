"""
InfoConcert spider.
Source: https://www.infoconcert.com
Fetches concert listings in Paris from infoconcert.com.

Strategy: Use the sitemap to find Paris concert URLs, then fetch each
detail page to extract event data from meta tags and server-rendered HTML.
The listing page is Next.js RSC (client-rendered), but detail pages have
good server-rendered HTML with og: tags and structured content.
"""

import re
import hashlib
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Generator, Optional

import httpx
from bs4 import BeautifulSoup

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    compute_quality_score,
)

logger = logging.getLogger(__name__)

DOMAIN = "https://www.infoconcert.com"
SITEMAP_INDEX = f"{DOMAIN}/sitemap.xml"

FRENCH_MONTHS = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

REQUEST_DELAY = 0.5


def fetch_events(max_pages: int = 15, days_ahead: int = 90) -> Generator[dict, None, None]:
    """Fetch Paris concerts from InfoConcert via sitemap + detail pages."""

    cutoff = datetime.now() + timedelta(days=days_ahead)
    seen_ids: set[str] = set()

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        # Step 1: Get Paris concert URLs from sitemaps
        paris_urls = get_paris_concert_urls(client, max_sitemaps=max_pages)
        print(f"  Found {len(paris_urls)} Paris concert URLs in sitemaps")

        # Step 2: Fetch each detail page
        for i, url in enumerate(paris_urls):
            source_id = hashlib.md5(url.encode()).hexdigest()[:16]
            if source_id in seen_ids:
                continue

            event = fetch_concert_detail(client, url)
            if not event:
                continue

            seen_ids.add(source_id)
            event["source_id"] = source_id

            # Filter by date
            if event.get("start_date"):
                try:
                    event_dt = datetime.fromisoformat(event["start_date"])
                    if event_dt > cutoff:
                        continue
                    if event_dt < datetime.now():
                        continue
                except ValueError:
                    pass

            yield event

            if (i + 1) % 50 == 0:
                print(f"  Processed {i + 1}/{len(paris_urls)} concert pages")

            time.sleep(REQUEST_DELAY)

    logger.info("InfoConcert scrape complete. Total events: %d", len(seen_ids))


def get_paris_concert_urls(client: httpx.Client, max_sitemaps: int = 15) -> list[str]:
    """Get Paris concert URLs from the sitemap index."""
    urls = []

    try:
        # Fetch sitemap index
        resp = client.get(SITEMAP_INDEX)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # Find concert sitemaps
        concert_sitemaps = []
        for sitemap in root.findall("sm:sitemap", ns):
            loc = sitemap.find("sm:loc", ns)
            if loc is not None and "/concerts/" in loc.text:
                concert_sitemaps.append(loc.text)

        print(f"  Found {len(concert_sitemaps)} concert sitemaps")

        # Fetch each concert sitemap (most recent first — highest page numbers)
        for sitemap_url in concert_sitemaps[-max_sitemaps:]:
            try:
                resp = client.get(sitemap_url)
                resp.raise_for_status()
                sitemap_root = ET.fromstring(resp.text)

                for url_el in sitemap_root.findall("sm:url", ns):
                    loc = url_el.find("sm:loc", ns)
                    if loc is not None and "-paris-" in loc.text:
                        urls.append(loc.text)

                time.sleep(0.2)
            except Exception as e:
                logger.warning("Error fetching sitemap %s: %s", sitemap_url, e)
                continue

    except Exception as e:
        logger.error("Error fetching sitemap index: %s", e)
        # Fallback: try direct listing page approach
        urls = get_urls_from_listing(client, max_pages=5)

    return urls


def get_urls_from_listing(client: httpx.Client, max_pages: int = 5) -> list[str]:
    """Fallback: get concert URLs from the listing page HTML."""
    urls = []
    base = f"{DOMAIN}/ville/paris-s20.html"

    for page in range(1, max_pages + 1):
        params = {"page": page} if page > 1 else {}
        try:
            resp = client.get(base, params=params)
            resp.raise_for_status()

            # Find concert links in the HTML
            for match in re.findall(r'href="(/concerts/concert-[^"]+paris[^"]*)"', resp.text):
                full_url = f"{DOMAIN}{match}"
                if full_url not in urls:
                    urls.append(full_url)

            time.sleep(REQUEST_DELAY)
        except Exception as e:
            logger.warning("Error on listing page %d: %s", page, e)
            break

    return urls


def fetch_concert_detail(client: httpx.Client, url: str) -> Optional[dict]:
    """Fetch a concert detail page and extract event data."""
    try:
        resp = client.get(url)
        resp.raise_for_status()
    except Exception as e:
        logger.debug("Error fetching %s: %s", url, e)
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract from meta tags (most reliable on this SSR site)
    og_title = get_meta(soup, "og:title")
    og_desc = get_meta(soup, "og:description")

    if not og_title:
        # Try h1
        h1 = soup.find("h1")
        if h1:
            og_title = clean_text(h1.get_text())

    if not og_title:
        return None

    # Parse title: "Concert de ARTIST - VENUE City"
    title = clean_text(og_title)
    artist_name = title
    venue_name = None

    title_match = re.match(r"Concert\s+de\s+(.+?)\s*[-–]\s*(.+)", title, re.IGNORECASE)
    if title_match:
        artist_name = title_match.group(1).strip()
        venue_part = title_match.group(2).strip()
        # Remove city from venue: "L'OLYMPIA Paris" -> "L'OLYMPIA"
        venue_name = re.sub(r"\s+Paris$", "", venue_part).strip()
        title = f"{artist_name} — {venue_name}" if venue_name else artist_name

    # Image
    image_url = None
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if "statics-infoconcert" in src or "artiste" in src:
            image_url = src if src.startswith("http") else f"{DOMAIN}{src}"
            break
    if not image_url:
        image_url = get_meta(soup, "og:image")

    # Date and time from page text
    page_text = soup.get_text(" ", strip=True)
    start_date = extract_date_from_text(page_text)

    # Price
    price_text = None
    price_match = re.search(r"(\d+[.,]\d{2})\s*€", page_text)
    if price_match:
        price_text = price_match.group(0)
    price_data = parse_price(price_text)

    # Venue address / arrondissement
    venue_zip = None
    venue_arrondissement = None
    zip_match = re.search(r"(750\d{2})", page_text)
    if zip_match:
        venue_zip = zip_match.group(1)
        try:
            venue_arrondissement = str(int(venue_zip[3:]))
        except ValueError:
            pass

    # Description
    description = clean_text(og_desc)

    slug = generate_slug(title, start_date)
    quality = compute_quality_score(
        title=title, description=description, image_url=image_url,
        start_date=start_date, price_raw=price_text, booking_url=url,
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
        "booking_url": url,
        "source": "infoconcert",
        "source_url": url,
        "source_id": hashlib.md5(url.encode()).hexdigest()[:16],
        "venue_name": venue_name,
        "venue_address": None,
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


def get_meta(soup: BeautifulSoup, property_name: str) -> Optional[str]:
    """Get content of a meta tag by property or name."""
    tag = soup.find("meta", property=property_name)
    if not tag:
        tag = soup.find("meta", attrs={"name": property_name})
    return tag["content"] if tag and tag.get("content") else None


def extract_date_from_text(text: str) -> Optional[str]:
    """Extract a date from page text."""
    if not text:
        return None

    lower = text.lower()

    # Pattern: "vendredi 23 avril 2027 à 20h00" or "vendredi 23 avril 2027 20:00"
    month_pattern = "|".join(FRENCH_MONTHS.keys())
    match = re.search(
        rf"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+"
        rf"(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})"
        rf"(?:\s+(?:à\s+)?(\d{{1,2}})[h:](\d{{2}}))?",
        lower,
    )
    if match:
        day = int(match.group(1))
        month = FRENCH_MONTHS[match.group(2)]
        year = int(match.group(3))
        hour = int(match.group(4)) if match.group(4) else 20
        minute = int(match.group(5)) if match.group(5) else 0
        try:
            return datetime(year, month, day, hour, minute).isoformat()
        except ValueError:
            pass

    # Simpler pattern: "23 avril 2027"
    match = re.search(
        rf"(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}})",
        lower,
    )
    if match:
        try:
            return datetime(
                int(match.group(3)),
                FRENCH_MONTHS[match.group(2)],
                int(match.group(1)), 20, 0,
            ).isoformat()
        except ValueError:
            pass

    return None


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)
    print("Fetching InfoConcert events for Paris...")
    for i, event in enumerate(fetch_events(max_pages=3, days_ahead=90)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 4:
            break
    print("Done.")
