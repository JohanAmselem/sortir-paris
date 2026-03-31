"""
Paris Jazz Club spider.
Source: https://www.parisjazzclub.net/fr/agenda
Scrapes jazz concert listings for Paris and surroundings.

The site has paginated listings with ~108 pages of events.
We scrape the HTML directly since there's no public API.
"""

import httpx
import re
from datetime import datetime, timedelta
from typing import Generator, Optional
from bs4 import BeautifulSoup

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    compute_quality_score,
)

BASE_URL = "https://www.parisjazzclub.net"
AGENDA_URL = f"{BASE_URL}/fr/agenda"

# Map arrondissement text to zip code
ARRONDISSEMENT_MAP = {
    "Paris 1er": "75001", "Paris 2ème": "75002", "Paris 3ème": "75003",
    "Paris 4ème": "75004", "Paris 5ème": "75005", "Paris 6ème": "75006",
    "Paris 7ème": "75007", "Paris 8ème": "75008", "Paris 9ème": "75009",
    "Paris 10ème": "75010", "Paris 11ème": "75011", "Paris 12ème": "75012",
    "Paris 13ème": "75013", "Paris 14ème": "75014", "Paris 15ème": "75015",
    "Paris 16ème": "75016", "Paris 17ème": "75017", "Paris 18ème": "75018",
    "Paris 19ème": "75019", "Paris 20ème": "75020",
}


def fetch_events(
    max_pages: int = 15,
    days_ahead: int = 30,
) -> Generator[dict, None, None]:
    """Fetch jazz events from Paris Jazz Club."""

    client = httpx.Client(
        timeout=30,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SortirParis/1.0",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "fr-FR,fr;q=0.9",
        },
        follow_redirects=True,
    )

    page = 1
    total_events = 0

    while page <= max_pages:
        try:
            print(f"  Fetching page {page}...", flush=True)

            params = {"page": page} if page > 1 else {}
            response = client.get(AGENDA_URL, params=params)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Find event articles/items
            event_elements = soup.select("article.concert, .concert-item, .concerts-items article, .agenda-item")

            # Fallback: try common patterns
            if not event_elements:
                event_elements = soup.select("[class*=concert], [class*=event]")

            if not event_elements:
                print(f"  No events found on page {page}, stopping.")
                break

            page_count = 0
            for element in event_elements:
                event = parse_event_element(element, soup)
                if event:
                    # Check if event is within our date range
                    if event.get("start_date"):
                        try:
                            event_date = datetime.fromisoformat(event["start_date"])
                            cutoff = datetime.now() + timedelta(days=days_ahead)
                            if event_date > cutoff:
                                continue
                        except (ValueError, TypeError):
                            pass

                    yield event
                    page_count += 1
                    total_events += 1

            print(f"  Page {page}: {page_count} events extracted", flush=True)

            if page_count == 0:
                break

            page += 1

        except httpx.HTTPError as e:
            print(f"  HTTP error on page {page}: {e}")
            break
        except Exception as e:
            print(f"  Error on page {page}: {e}")
            break

    client.close()
    print(f"  Total: {total_events} events from Paris Jazz Club")


def parse_event_element(element, soup) -> Optional[dict]:
    """Parse a single event element from the page."""

    try:
        # Extract link and title
        link_el = element.select_one("a[href*='/concert/'], a[href*='/fr/']")
        if not link_el:
            link_el = element.select_one("a")
        if not link_el:
            return None

        href = link_el.get("href", "")
        if href and not href.startswith("http"):
            href = BASE_URL + href

        # Title - try multiple selectors
        title_el = (
            element.select_one("h2, h3, .concert-title, .title, .artist-name, .event-title")
            or link_el
        )
        title = clean_text(title_el.get_text()) if title_el else None
        if not title or len(title) < 2:
            return None

        # Venue
        venue_el = element.select_one(".venue, .lieu, .location, .concert-venue, .club-name")
        venue_name = clean_text(venue_el.get_text()) if venue_el else None

        # Location / Arrondissement
        location_el = element.select_one(".district, .arrondissement, .city, .concert-location, .lieu-ville")
        location_text = clean_text(location_el.get_text()) if location_el else None

        venue_zip = None
        venue_city = "Paris"
        arrondissement = None
        if location_text:
            for arr_text, zip_code in ARRONDISSEMENT_MAP.items():
                if arr_text.lower() in location_text.lower():
                    venue_zip = zip_code
                    arrondissement = arr_text
                    break
            # Check for cities outside Paris
            outside_cities = ["Pantin", "Montreuil", "Saint-Denis", "Vincennes",
                            "Boulogne", "Nanterre", "Ivry", "Saint-Ouen"]
            for city in outside_cities:
                if city.lower() in location_text.lower():
                    venue_city = city
                    break

        # Time
        time_el = element.select_one(".time, .horaire, .hour, .concert-time, time")
        time_text = clean_text(time_el.get_text()) if time_el else None

        # Extract time from text
        event_time = None
        if time_text:
            time_match = re.search(r"(\d{1,2})[h:](\d{2})?", time_text)
            if time_match:
                hour = int(time_match.group(1))
                minute = int(time_match.group(2) or "0")
                event_time = f"{hour:02d}:{minute:02d}"

        # Date - try to extract from link or page context
        start_date = None
        date_match = re.search(r"(\d{4})/(\d{2})/(\d{2})", href)
        if date_match:
            date_str = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"
            time_part = event_time or "20:00"
            start_date = f"{date_str}T{time_part}:00"
        else:
            # Try date from element
            date_el = element.select_one(".date, [datetime], time[datetime]")
            if date_el:
                dt = date_el.get("datetime") or clean_text(date_el.get_text())
                if dt:
                    try:
                        parsed = datetime.fromisoformat(dt)
                        start_date = parsed.isoformat()
                    except (ValueError, TypeError):
                        pass

        if not start_date:
            return None

        # Price
        price_el = element.select_one(".price, .tarif, .prix, .concert-price")
        price_text = clean_text(price_el.get_text()) if price_el else None

        # Check for "Entrée libre" (free)
        is_free_text = False
        all_text = clean_text(element.get_text()) or ""
        if "entrée libre" in all_text.lower() or "gratuit" in all_text.lower():
            is_free_text = True

        price_data = parse_price(price_text)
        if is_free_text:
            price_data = {"price_min": 0, "price_max": 0, "is_free": True}

        # Genre/style
        genre_el = element.select_one(".genre, .style, .music-style, .concert-style")
        genre_text = clean_text(genre_el.get_text()) if genre_el else None
        tags = [genre_text] if genre_text else ["jazz"]

        # Image
        img_el = element.select_one("img[src]")
        image_url = None
        if img_el:
            img_src = img_el.get("src") or img_el.get("data-src")
            if img_src:
                if img_src.startswith("//"):
                    img_src = "https:" + img_src
                elif img_src.startswith("/"):
                    img_src = BASE_URL + img_src
                image_url = img_src

        # Source ID from URL
        source_id_match = re.search(r"/fr/(\d+)/", href)
        source_id = source_id_match.group(1) if source_id_match else generate_slug(title, start_date)

        # Build description
        description = f"Concert de {genre_text or 'jazz'}"
        if venue_name:
            description += f" au {venue_name}"
        if arrondissement:
            description += f" ({arrondissement})"
        description += "."

        cleaned_title = clean_text(title) or ""

        quality = compute_quality_score(
            cleaned_title, description, image_url, start_date, price_text, href
        )
        # Boost quality since PJC events are curated
        quality = min(100, quality + 10)

        return {
            "source": "parisjazzclub",
            "source_id": f"pjc-{source_id}",
            "source_url": href,
            "title": cleaned_title,
            "description": description,
            "short_desc": truncate(description),
            "image_url": image_url,
            "start_date": start_date,
            "end_date": None,
            "price_min": price_data["price_min"],
            "price_max": price_data["price_max"],
            "is_free": price_data["is_free"],
            "booking_url": href,
            "venue_name": venue_name,
            "venue_address": None,
            "venue_city": venue_city,
            "venue_zip": venue_zip,
            "category_slug": "concerts",
            "tags_raw": tags,
            "slug": generate_slug(cleaned_title, start_date),
            "quality_score": quality,
        }

    except Exception as e:
        print(f"  Error parsing event element: {e}")
        return None


if __name__ == "__main__":
    import json

    print("Testing Paris Jazz Club spider...")
    for i, event in enumerate(fetch_events(max_pages=2)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 4:
            break
