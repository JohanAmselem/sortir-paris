"""
TheatreOnline spider.
Source: https://www.theatreonline.com (ticketing platform; HTML scraping of schema.org microdata).

The listing /Spectacles/Liste?page=N (30 shows/page) has one schema.org/Event
microdata card per show with: name, url, image, location text ("Théâtre Edouard VII,
Paris 9e" / "Avant-Seine, Colombes (92)"), ISO startDate/endDate metas, a visible
date line ("du 16 sept. 2026 au 10 janv. 2027"), tags (genre, price "18 - 46,5 €").

Dates: the ISO metas are used (no month-order / year-rollover ambiguity); the
visible line is only a fallback, parsed with parse_date_fr (durations such as
"1h40" are never read as times). Show times are not on the listing → time unknown.
No JSON-LD on listing or detail pages (checked 2026-10-07).
"""

from __future__ import annotations

import json
import re
from typing import Generator, List, Optional, Tuple

from bs4 import BeautifulSoup

from utils.dates import parse_date_fr
from utils.event import make_event
from utils.http import PoliteClient
from utils.normalize import IDF_DEPARTMENTS, absolute_url, clean_text, parse_price_fr

SOURCE = "theatreonline"
BASE_URL = "https://www.theatreonline.com"
LISTING_URL = f"{BASE_URL}/Spectacles/Liste"

_ID_RE = re.compile(r"/Spectacle/[^/]+/(\d+)")
_PARIS_RE = re.compile(r"^paris\s*(\d{1,2})\s*(?:e|er|eme)?$", re.I)
_DEPT_RE = re.compile(r"^(.*?)\s*\((\d{2,3})\)$")


def parse_location(text: Optional[str]) -> Optional[Tuple[str, str, Optional[str]]]:
    """'Théâtre Edouard VII, Paris 9e' → (venue, 'Paris', '75009');
    'Avant-Seine, Colombes (92)' → (venue, 'Colombes', None). None if outside IDF."""
    text = clean_text(text)
    if not text or "," not in text:
        return None
    venue, place = [clean_text(x) for x in text.rsplit(",", 1)]
    m = _PARIS_RE.match(place or "")
    if m:
        n = int(m.group(1))
        if not 1 <= n <= 20:
            return None
        return venue, "Paris", f"750{n:02d}"
    if (place or "").lower() == "paris":
        return venue, "Paris", None
    m = _DEPT_RE.match(place or "")
    if m and m.group(2) in IDF_DEPARTMENTS:
        return venue, m.group(1), None
    return None


def _category(tags: List[str]) -> str:
    low = [t.lower() for t in tags]
    if any("humour" in t or "one (wo)man" in t or "stand-up" in t for t in low):
        return "spectacles"
    if any(t.startswith("musique") for t in low):
        others = [t for t in low if not t.startswith("musique")]
        if any("danse" in t for t in others):
            return "danse"
        if any(k in t for t in others for k in ("concert", "jazz", "classique", "opéra", "opera", "récital")):
            return "concerts"
        return "spectacles"
    return "theatre"


def parse_listing(html: str, today=None) -> List[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[dict] = []
    for card in soup.select("div.spectacle-item[itemscope]"):
        try:
            ev = _parse_card(card, today)
        except Exception as e:
            print(f"  [{SOURCE}] card error: {e}")
            continue
        if ev:
            out.append(ev)
    return out


def _parse_card(card, today=None) -> Optional[dict]:
    a = card.select_one("a.titre-spectacle[href]")
    if a is None:
        return None
    url = absolute_url(BASE_URL, a["href"])
    m = _ID_RE.search(url or "")
    if not m:
        return None
    name_el = a.find(attrs={"itemprop": "name"}) or a
    title = clean_text(name_el.get_text(" ", strip=True))
    if not title:
        return None

    loc_el = card.find(attrs={"itemprop": "location"})
    loc = parse_location(loc_el.get_text(" ", strip=True) if loc_el else None)
    if loc is None:
        return None  # no venue or outside Île-de-France
    venue, city, zip_code = loc

    start_meta = card.find("meta", attrs={"itemprop": "startDate"})
    end_meta = card.find("meta", attrs={"itemprop": "endDate"})
    start = start_meta.get("content") if start_meta else None
    end = end_meta.get("content") if end_meta else None
    when = None
    if not start:
        dates_el = card.select_one(".spectacle-item-dates")
        when = parse_date_fr(dates_el.get_text(" ", strip=True), today=today) if dates_el else None
        if when is None or when.start is None:
            return None
    if end == start:
        end = None

    tags = [clean_text(s.get_text(" ", strip=True)) for s in card.select(".tags span")]
    tags = [t for t in tags if t]
    price_tag = next((t for t in tags if "€" in t), None)
    genre_tags = [t for t in tags if "€" not in t and "%" not in t]

    img = card.find("img", attrs={"itemprop": "image"})
    desc_el = next((p for p in card.find_all("p") if p.get("itemprop") != "location"), None)
    return make_event(
        source=SOURCE,
        source_id=m.group(1),
        title=title,
        start=start if when is None else None,
        end=end if when is None else None,
        when=when,
        description=desc_el.get_text(" ", strip=True) if desc_el else None,
        image_url=absolute_url(BASE_URL, img.get("src")) if img else None,
        price=parse_price_fr(price_tag) if price_tag else None,
        source_url=url,
        booking_url=url,
        venue_name=venue,
        venue_city=city,
        venue_zip=zip_code,
        category_slug=_category(genre_tags),
        tags=genre_tags,
    )


def fetch_events(max_pages: int = 10) -> Generator[dict, None, None]:
    seen = set()
    count = 0
    with PoliteClient() as client:
        for page in range(1, max_pages + 1):
            html = client.get_text(f"{LISTING_URL}?page={page}")
            if html is None:
                if page == 1:
                    print(f"  [{SOURCE}] listing unavailable — nothing to do")
                break
            events = [e for e in parse_listing(html) if e["source_id"] not in seen]
            if not events:
                break
            for ev in events:
                seen.add(ev["source_id"])
                count += 1
                yield ev
    print(f"  [{SOURCE}] {count} shows")


if __name__ == "__main__":
    for ev in list(fetch_events(max_pages=1))[:3]:
        print(json.dumps(ev, ensure_ascii=False, indent=1))
