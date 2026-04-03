"""
Bandsintown scraper — Concerts in Paris.
Source: https://www.bandsintown.com

Uses the public Bandsintown API (free app_id, no OAuth).
Thousands of concerts available.
"""

import httpx
import time
from datetime import datetime
from typing import Generator, Optional

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    compute_quality_score,
)

API_BASE = "https://rest.bandsintown.com"
APP_ID = "sortirparis"  # Free app_id — just needs to be non-empty

HEADERS = {
    "User-Agent": "SortirParis/1.0 (+https://sortir.paris)",
    "Accept": "application/json",
}

# Major Paris venues on Bandsintown
PARIS_VENUES = [
    "Olympia", "Accor Arena", "Bataclan", "Cigale", "Élysée Montmartre",
    "Zénith Paris", "Café de la Danse", "Trabendo", "Point Éphémère",
    "Supersonic", "Petit Bain", "Gaîté Lyrique", "Cabaret Sauvage",
    "Philharmonie de Paris", "Salle Pleyel", "Bouffes du Nord",
    "La Maroquinerie", "FGO-Barbara", "Le Trianon", "Casino de Paris",
    "Folies Bergère", "L'Alhambra", "New Morning", "Duc des Lombards",
    "Sunset/Sunside", "Studio de l'Ermitage", "Pan Piper", "Popup!",
    "Le Bus Palladium", "La Machine du Moulin Rouge", "Rex Club",
    "Badaboum", "Glazart", "La Bellevilloise", "Divan du Monde",
    "Les Étoiles", "La Boule Noire", "Le Hasard Ludique",
    "Stade de France", "La Seine Musicale",
]

# Search for events in Paris using multiple popular artist searches
# The API's main endpoint is per-artist, but we can use the location search
SEARCH_URLS = [
    f"{API_BASE}/artists/recommended?location=Paris,France&app_id={APP_ID}",
]


def _parse_bandsintown_date(date_str: str) -> Optional[str]:
    """Parse '2026-04-15T20:00:00' or '2026-04-15' → ISO string."""
    if not date_str:
        return None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.isoformat()
    except ValueError:
        return date_str


def _extract_venue_arrondissement(venue_name: str, city: str = "") -> Optional[str]:
    """Try to extract arrondissement from venue context."""
    KNOWN = {
        "Olympia": "9e", "Bataclan": "11e", "Cigale": "18e",
        "Élysée Montmartre": "18e", "Zénith": "19e",
        "Café de la Danse": "11e", "Trabendo": "19e",
        "Point Éphémère": "10e", "Supersonic": "12e",
        "Petit Bain": "13e", "Gaîté Lyrique": "3e",
        "Cabaret Sauvage": "19e", "Philharmonie": "19e",
        "Salle Pleyel": "8e", "Bouffes du Nord": "10e",
        "Maroquinerie": "20e", "FGO-Barbara": "18e",
        "Trianon": "18e", "Casino de Paris": "9e",
        "Folies Bergère": "9e", "Alhambra": "10e",
        "New Morning": "10e", "Duc des Lombards": "1er",
        "Sunset": "1er", "Sunside": "1er",
        "Studio de l'Ermitage": "20e", "Pan Piper": "11e",
        "Bus Palladium": "18e", "Machine du Moulin": "18e",
        "Rex Club": "2e", "Badaboum": "11e",
        "Glazart": "19e", "Bellevilloise": "20e",
        "Divan du Monde": "18e", "Les Étoiles": "10e",
        "Boule Noire": "18e", "Hasard Ludique": "18e",
        "Accor Arena": "12e", "Seine Musicale": None,
    }
    for key, arr in KNOWN.items():
        if key.lower() in venue_name.lower():
            return arr
    return None


def fetch_events(
    max_pages: int = 20,
    days_ahead: int = 90,
) -> Generator[dict, None, None]:
    """Fetch concerts from Bandsintown for Paris.

    Strategy: search for events in Paris area using the events endpoint.
    """
    client = httpx.Client(headers=HEADERS, timeout=15, follow_redirects=True)
    seen = set()
    today = datetime.now().strftime("%Y-%m-%d")

    # Strategy 1: Search events by location using the browse endpoint
    # Bandsintown doesn't have a pure location search, so we use upcoming events
    # by scraping popular artist pages from their website
    page = 1
    per_page = 50

    for page_num in range(1, max_pages + 1):
        try:
            # Use the events search endpoint
            url = f"https://www.bandsintown.com/ajax/events/search"
            params = {
                "location": "Paris, France",
                "page": page_num,
                "per_page": per_page,
                "date": "upcoming",
            }
            resp = client.get(url, params=params)

            if resp.status_code != 200:
                # Try alternative: scrape the HTML page
                html_url = f"https://www.bandsintown.com/choose-dates/fetch-next/upcomingEvents?came_from=257&page={page_num}&location=Paris%2C+France"
                resp = client.get(html_url)
                if resp.status_code != 200:
                    break

            # Try JSON response first
            try:
                data = resp.json()
                events_data = data if isinstance(data, list) else data.get("events", data.get("data", []))
                if not events_data:
                    break

                for event in events_data:
                    result = _parse_api_event(event, seen)
                    if result:
                        yield result

            except (ValueError, KeyError):
                # HTML fallback — parse the page
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "html.parser")
                event_cards = soup.select("[class*=event], .eventCard, [data-event]")

                if not event_cards:
                    break

                for card in event_cards:
                    result = _parse_html_event(card, seen)
                    if result:
                        yield result

            time.sleep(1)

        except Exception as e:
            print(f"  Bandsintown page {page_num} error: {e}")
            time.sleep(2)

    # Strategy 2: Fetch events for specific popular venues
    for venue_name in PARIS_VENUES[:30]:
        try:
            search_url = f"https://www.bandsintown.com/venue/{venue_name.replace(' ', '-').lower()}"
            resp = client.get(search_url)
            if resp.status_code != 200:
                continue

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, "html.parser")

            # Look for event data in JSON-LD
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    ld = __import__("json").loads(script.string or "")
                    if isinstance(ld, list):
                        for item in ld:
                            if item.get("@type") in ("MusicEvent", "Event"):
                                result = _parse_jsonld_event(item, venue_name, seen)
                                if result:
                                    yield result
                    elif ld.get("@type") in ("MusicEvent", "Event"):
                        result = _parse_jsonld_event(ld, venue_name, seen)
                        if result:
                            yield result
                except Exception:
                    pass

            # Also parse HTML cards
            cards = soup.select("[class*=event], .eventCard, [class*=Event]")
            for card in cards:
                result = _parse_html_event(card, seen, default_venue=venue_name)
                if result:
                    yield result

            time.sleep(1)

        except Exception as e:
            continue

    client.close()


def _parse_api_event(event: dict, seen: set) -> Optional[dict]:
    """Parse a Bandsintown API event object."""
    title = event.get("title") or event.get("artist", {}).get("name", "")
    if not title:
        return None

    venue_data = event.get("venue", {})
    venue_name = venue_data.get("name", "")
    venue_city = venue_data.get("city", "Paris")
    venue_lat = venue_data.get("latitude")
    venue_lng = venue_data.get("longitude")

    # Only Paris events
    if venue_city and "paris" not in venue_city.lower() and "île-de-france" not in venue_city.lower():
        return None

    start = _parse_bandsintown_date(event.get("datetime") or event.get("starts_at", ""))
    image = event.get("artist", {}).get("image_url") or event.get("image_url")
    url = event.get("url") or event.get("artist", {}).get("url", "")
    description = event.get("description") or event.get("lineup_string", "")

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    offers = event.get("offers", [])
    booking_url = offers[0].get("url") if offers else url

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(description),
        "short_desc": truncate(clean_text(description)) if description else f"Concert de {title}",
        "start_date": start,
        "end_date": None,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": False,
        "booking_url": booking_url,
        "source": "bandsintown",
        "source_id": f"bit-{event.get('id', slug)}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": venue_data.get("street_address", ""),
        "venue_city": "Paris",
        "venue_zip": venue_data.get("postal_code"),
        "venue_lat": float(venue_lat) if venue_lat else None,
        "venue_lng": float(venue_lng) if venue_lng else None,
        "venue_arrondissement": _extract_venue_arrondissement(venue_name),
        "category_slug": "concerts",
        "tags": ["concert", "musique", "live"],
        "quality_score": compute_quality_score(title, clean_text(description), image, start, None, booking_url),
    }


def _parse_jsonld_event(data: dict, default_venue: str, seen: set) -> Optional[dict]:
    """Parse JSON-LD MusicEvent."""
    title = data.get("name", "")
    if not title:
        return None

    performer = data.get("performer", {})
    if isinstance(performer, list) and performer:
        performer = performer[0]
    artist_name = performer.get("name", "") if isinstance(performer, dict) else ""

    if artist_name and artist_name != title:
        title = f"{artist_name} — {title}" if title != artist_name else artist_name

    location = data.get("location", {})
    venue_name = location.get("name", default_venue)
    address = location.get("address", {})

    start = data.get("startDate")
    image = data.get("image") or performer.get("image") if isinstance(performer, dict) else None
    url = data.get("url", "")
    desc = data.get("description", "")

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)) if desc else f"Concert au {venue_name}",
        "start_date": start,
        "end_date": data.get("endDate"),
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": False,
        "booking_url": url,
        "source": "bandsintown",
        "source_id": f"bit-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": address.get("streetAddress", "") if isinstance(address, dict) else str(address),
        "venue_city": "Paris",
        "venue_zip": address.get("postalCode") if isinstance(address, dict) else None,
        "venue_arrondissement": _extract_venue_arrondissement(venue_name),
        "category_slug": "concerts",
        "tags": ["concert", "musique", "live"],
        "quality_score": compute_quality_score(title, clean_text(desc), image, start, None, url),
    }


def _parse_html_event(card, seen: set, default_venue: str = "") -> Optional[dict]:
    """Parse an HTML event card from Bandsintown."""
    from bs4 import Tag
    if not isinstance(card, Tag):
        return None

    title_el = card.select_one("h2, h3, [class*=name], [class*=title], [class*=artist]")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 2:
        return None

    venue_el = card.select_one("[class*=venue], [class*=location]")
    venue_name = clean_text(venue_el.get_text()) if venue_el else default_venue

    date_el = card.select_one("time, [class*=date], [datetime]")
    start = None
    if date_el:
        start = date_el.get("datetime") or clean_text(date_el.get_text())

    link_el = card.select_one("a[href]")
    url = link_el["href"] if link_el else ""
    if url and not url.startswith("http"):
        url = f"https://www.bandsintown.com{url}"

    img_el = card.select_one("img[src]")
    image = img_el.get("data-src") or img_el.get("src") if img_el else None

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    return {
        "title": title,
        "slug": slug,
        "description": None,
        "short_desc": f"Concert de {title}" + (f" au {venue_name}" if venue_name else ""),
        "start_date": start,
        "end_date": None,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": False,
        "booking_url": url,
        "source": "bandsintown",
        "source_id": f"bit-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": "",
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": _extract_venue_arrondissement(venue_name) if venue_name else None,
        "category_slug": "concerts",
        "tags": ["concert", "musique"],
        "quality_score": compute_quality_score(title, None, image, start, None, url),
    }
