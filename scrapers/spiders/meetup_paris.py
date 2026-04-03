"""
Meetup scraper — Community events in Paris.
Source: https://www.meetup.com/find/?location=fr--Paris

Scrapes Meetup listing pages for Paris events.
Covers: tech, art, language exchanges, social, workshops, networking.
Hundreds of events weekly.
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
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=546&distance=tenMiles",  # Arts & Culture
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=553&distance=tenMiles",  # Music
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=482&distance=tenMiles",  # Language & Culture
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=522&distance=tenMiles",  # Social Activities
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=436&distance=tenMiles",  # Photography
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=539&distance=tenMiles",  # Dancing
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=495&distance=tenMiles",  # Film
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=515&distance=tenMiles",  # Food & Drink
    "https://www.meetup.com/find/?location=fr--Paris&source=EVENTS&categoryId=242&distance=tenMiles",  # Writing
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}


def fetch_events(
    max_pages: int = 5,
) -> Generator[dict, None, None]:
    """Fetch community events from Meetup Paris."""
    client = httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True)
    seen = set()

    for listing_url in LISTING_URLS:
        try:
            resp = client.get(listing_url)
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Meetup uses React — look for __NEXT_DATA__ or Apollo state
            next_data = soup.select_one('script#__NEXT_DATA__')
            if next_data:
                try:
                    nd = json.loads(next_data.string or "")
                    props = nd.get("props", {}).get("pageProps", {})

                    # Navigate through Apollo cache or direct props
                    events_data = _extract_events_from_nextdata(props)
                    for event_data in events_data:
                        result = _parse_nextdata_event(event_data, seen)
                        if result:
                            yield result
                except (json.JSONDecodeError, KeyError) as e:
                    pass

            # Also try Apollo state in window.__APOLLO_STATE__
            for script in soup.select("script"):
                text = script.string or ""
                if "__APOLLO_STATE__" in text or "window.__remixContext" in text:
                    try:
                        # Extract JSON from script
                        m = re.search(r'__APOLLO_STATE__\s*=\s*({.+?});', text, re.DOTALL)
                        if m:
                            apollo = json.loads(m.group(1))
                            for key, val in apollo.items():
                                if isinstance(val, dict) and val.get("__typename") == "Event":
                                    result = _parse_apollo_event(val, apollo, seen)
                                    if result:
                                        yield result
                    except (json.JSONDecodeError, KeyError):
                        pass

            # JSON-LD fallback
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    ld = json.loads(script.string or "")
                    items = ld if isinstance(ld, list) else [ld]
                    for item in items:
                        if item.get("@type") in ("Event", "SocialEvent"):
                            result = _parse_jsonld_event(item, seen)
                            if result:
                                yield result
                except (json.JSONDecodeError, KeyError):
                    pass

            # HTML fallback
            cards = soup.select("[id*=event-card], [class*=eventCard], [data-testid*=event], a[href*='/events/']")
            for card in cards:
                result = _parse_html_card(card, seen)
                if result:
                    yield result

            time.sleep(2)  # Meetup rate limits

        except Exception as e:
            print(f"  Meetup error: {e}")
            time.sleep(3)

    client.close()


def _extract_events_from_nextdata(props: dict) -> list:
    """Navigate Next.js pageProps to find events."""
    events = []

    # Direct events list
    if "events" in props:
        return props["events"] if isinstance(props["events"], list) else []

    # Search results
    if "searchResults" in props:
        results = props["searchResults"]
        if isinstance(results, dict):
            return results.get("edges", results.get("nodes", []))
        return results if isinstance(results, list) else []

    # Nested in dehydratedState (React Query)
    dehydrated = props.get("dehydratedState", {})
    queries = dehydrated.get("queries", [])
    for query in queries:
        data = query.get("state", {}).get("data", {})
        if isinstance(data, dict):
            edges = data.get("edges", data.get("results", []))
            if isinstance(edges, list):
                events.extend(edges)

    return events


def _parse_nextdata_event(data: dict, seen: set) -> Optional[dict]:
    """Parse event from Next.js data."""
    # Handle edges with node
    if "node" in data:
        data = data["node"]

    title = data.get("title") or data.get("name", "")
    if not title:
        return None
    title = clean_text(title)

    event_url = data.get("eventUrl") or data.get("link") or ""
    if event_url and not event_url.startswith("http"):
        event_url = f"https://www.meetup.com{event_url}"

    venue = data.get("venue", {}) or {}
    venue_name = venue.get("name", "")
    venue_city = venue.get("city", "Paris")
    venue_lat = venue.get("lat")
    venue_lng = venue.get("lng")

    # Only Paris area
    if venue_city and "paris" not in venue_city.lower():
        return None

    start = data.get("dateTime") or data.get("time")
    if isinstance(start, (int, float)):
        start = datetime.fromtimestamp(start / 1000).isoformat()

    end = data.get("endTime")
    if isinstance(end, (int, float)):
        end = datetime.fromtimestamp(end / 1000).isoformat()

    desc = data.get("description") or data.get("shortDescription", "")
    image = data.get("imageUrl") or data.get("featuredPhoto", {}).get("highResUrl") if isinstance(data.get("featuredPhoto"), dict) else None

    group = data.get("group", {}) or {}
    group_name = group.get("name", "")

    is_free = data.get("feeSettings", {}).get("amount", 0) == 0 if isinstance(data.get("feeSettings"), dict) else True
    fee = data.get("feeSettings", {}).get("amount", 0) if isinstance(data.get("feeSettings"), dict) else 0

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    category = detect_category(None, title, desc) or "ateliers"

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)) if desc else f"Meetup par {group_name}" if group_name else None,
        "start_date": start,
        "end_date": end,
        "image_url": image,
        "price_min": int(fee * 100) if fee else 0,
        "price_max": int(fee * 100) if fee else 0,
        "is_free": is_free,
        "booking_url": event_url,
        "source": "meetup",
        "source_id": f"meetup-{data.get('id', slug)}",
        "source_url": event_url,
        "venue_name": venue_name or group_name,
        "venue_address": venue.get("address", ""),
        "venue_city": "Paris",
        "venue_zip": venue.get("postalCode"),
        "venue_lat": float(venue_lat) if venue_lat else None,
        "venue_lng": float(venue_lng) if venue_lng else None,
        "venue_arrondissement": None,
        "category_slug": category,
        "tags": ["meetup", "communauté"],
        "quality_score": compute_quality_score(title, clean_text(desc), image, start, None, event_url),
    }


def _parse_apollo_event(val: dict, apollo: dict, seen: set) -> Optional[dict]:
    """Parse event from Apollo cache."""
    title = val.get("title", "")
    if not title:
        return None

    start = val.get("dateTime")
    url = val.get("eventUrl", "")
    if url and not url.startswith("http"):
        url = f"https://www.meetup.com{url}"

    # Resolve venue reference
    venue_ref = val.get("venue")
    venue_data = {}
    if isinstance(venue_ref, dict) and "__ref" in venue_ref:
        venue_data = apollo.get(venue_ref["__ref"], {})
    elif isinstance(venue_ref, dict):
        venue_data = venue_ref

    venue_name = venue_data.get("name", "")
    image_ref = val.get("featuredPhoto") or val.get("image")
    image = None
    if isinstance(image_ref, dict):
        if "__ref" in image_ref:
            photo = apollo.get(image_ref["__ref"], {})
            image = photo.get("highResUrl") or photo.get("baseUrl")
        else:
            image = image_ref.get("highResUrl") or image_ref.get("baseUrl")

    slug = generate_slug(clean_text(title), start)
    if slug in seen:
        return None
    seen.add(slug)

    category = detect_category(None, title, val.get("description", "")) or "ateliers"

    return {
        "title": clean_text(title),
        "slug": slug,
        "description": clean_text(val.get("description")),
        "short_desc": truncate(clean_text(val.get("description"))),
        "start_date": start,
        "end_date": val.get("endTime"),
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": True,
        "booking_url": url,
        "source": "meetup",
        "source_id": f"meetup-{val.get('id', slug)}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": venue_data.get("address", ""),
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "category_slug": category,
        "tags": ["meetup", "communauté"],
        "quality_score": compute_quality_score(clean_text(title), clean_text(val.get("description")), image, start, None, url),
    }


def _parse_jsonld_event(data: dict, seen: set) -> Optional[dict]:
    """Parse JSON-LD Event from Meetup."""
    title = data.get("name", "")
    if not title:
        return None

    location = data.get("location", {})
    venue_name = location.get("name", "")
    address = location.get("address", {})

    start = data.get("startDate")
    end = data.get("endDate")
    url = data.get("url", "")
    desc = data.get("description", "")
    image = data.get("image")

    slug = generate_slug(clean_text(title), start)
    if slug in seen:
        return None
    seen.add(slug)

    category = detect_category(None, title, desc) or "ateliers"

    return {
        "title": clean_text(title),
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)),
        "start_date": start,
        "end_date": end,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": True,
        "booking_url": url,
        "source": "meetup",
        "source_id": f"meetup-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": address.get("streetAddress", "") if isinstance(address, dict) else "",
        "venue_city": "Paris",
        "venue_zip": address.get("postalCode") if isinstance(address, dict) else None,
        "venue_arrondissement": None,
        "category_slug": category,
        "tags": ["meetup", "communauté"],
        "quality_score": compute_quality_score(clean_text(title), clean_text(desc), image, start, None, url),
    }


def _parse_html_card(card, seen: set) -> Optional[dict]:
    """Parse HTML event card from Meetup."""
    from bs4 import Tag
    if not isinstance(card, Tag):
        return None

    # Get the link
    if card.name == "a":
        url = card.get("href", "")
    else:
        link = card.select_one("a[href*='/events/']")
        url = link.get("href", "") if link else ""

    if url and not url.startswith("http"):
        url = f"https://www.meetup.com{url}"

    title_el = card.select_one("h2, h3, [class*=title], [class*=name]")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 3:
        return None

    date_el = card.select_one("time, [datetime], [class*=date], [class*=time]")
    start = None
    if date_el:
        start = date_el.get("datetime") or clean_text(date_el.get_text())

    venue_el = card.select_one("[class*=venue], [class*=location]")
    venue_name = clean_text(venue_el.get_text()) if venue_el else ""

    img_el = card.select_one("img[src]")
    image = img_el.get("src") if img_el else None

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    category = detect_category(None, title, "") or "ateliers"

    return {
        "title": title,
        "slug": slug,
        "description": None,
        "short_desc": None,
        "start_date": start,
        "end_date": None,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": True,
        "booking_url": url,
        "source": "meetup",
        "source_id": f"meetup-{slug}",
        "source_url": url,
        "venue_name": venue_name,
        "venue_address": "",
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "category_slug": category,
        "tags": ["meetup"],
        "quality_score": compute_quality_score(title, None, image, start, None, url),
    }
