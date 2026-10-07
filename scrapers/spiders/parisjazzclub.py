"""
Paris Jazz Club — jazz concert agenda for Paris & Île-de-France.
Source: https://www.parisjazzclub.net/fr/agenda?p=N (12 concerts/page, chronological)

Each concert card (<a class="concert">) carries schema.org microdata:
  startDate (content="YYYY-MM-DD HH:MM:SS", Paris local), name, description,
  isAccessibleForFree, location → Place{name, url, address{streetAddress, postalCode,
  addressLocality}, geo{latitude, longitude}}, offers → Offer{price, priceCurrency}.
Venue = the real club (Sunset/Sunside, Duc des Lombards, Baiser Salé, New Morning…).
Never invent a time/price/description: missing → None (unknown).
"""

from __future__ import annotations

import html as htmllib
import re
from datetime import datetime, timedelta
from typing import Generator, List, Optional

from bs4 import BeautifulSoup

from utils.dates import now_paris
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import UNKNOWN_PRICE, absolute_url, clean_text, in_idf, price_from_numbers

SOURCE = "parisjazzclub"
BASE_URL = "https://www.parisjazzclub.net"
AGENDA_URL = f"{BASE_URL}/fr/agenda"

IDF_ZIP_PREFIXES = ("75", "77", "78", "91", "92", "93", "94", "95")
_ID_RE = re.compile(r"/fr/(\d+)/concert/")
_PLACEHOLDER_RE = re.compile(r"^\s*concert de jazz\.?\s*$", re.I)


def _content(el, prop: str) -> Optional[str]:
    tag = el.select_one(f'[itemprop="{prop}"]') if el is not None else None
    if tag is None:
        return None
    val = tag.get("content")
    if val is None:
        val = tag.get_text(" ", strip=True)
    return val.strip() if isinstance(val, str) and val.strip() else None


def _clean_desc(raw: Optional[str], title: str) -> Optional[str]:
    if not raw:
        return None
    # microdata content is HTML-escaped twice on this site (&amp;nbsp;, &eacute;)
    text = htmllib.unescape(htmllib.unescape(raw))
    text = BeautifulSoup(text, "html.parser").get_text(" ")
    text = clean_text(text)
    if not text or _PLACEHOLDER_RE.match(text):
        return None
    if (clean_text(title) or "").casefold() == text.casefold():
        return None  # description is just the title repeated
    return text


def _price(card) -> dict:
    offers = card.select_one('[itemprop="offers"]')
    free = (_content(card, "isAccessibleForFree") or "").lower() == "true"
    raw = _content(offers, "price") if offers is not None else None
    try:
        amount = float(raw.replace(",", ".")) if raw else None
    except ValueError:
        amount = None
    if free:
        return price_from_numbers(0, free_flag=True)
    if amount and amount > 0:
        return price_from_numbers(amount)
    return dict(UNKNOWN_PRICE)  # price 0 without the free flag = not published


def parse_listing(html: str) -> List[dict]:
    """Agenda page HTML → list of make_event dicts (pure)."""
    soup = BeautifulSoup(html, "html.parser")
    events: List[dict] = []
    for card in soup.select("a.concert"):
        try:
            ev = parse_card(card)
        except BudgetExceeded:
            raise
        except Exception as e:  # noqa: BLE001
            print(f"  [parisjazzclub] skipped one card: {e}")
            continue
        if ev:
            events.append(ev)
    return events


def parse_card(card) -> Optional[dict]:
    href = absolute_url(BASE_URL, card.get("href"))
    m = _ID_RE.search(href or "")
    title_el = card.select_one('[itemprop="name"]')
    # first itemprop=name in the card is the concert name (h3); Place name is nested in location
    if title_el is not None and title_el.find_parent(attrs={"itemprop": "location"}):
        title_el = None
    title = clean_text(title_el.get_text(" ")) if title_el else None
    if not title:
        h3 = card.select_one("h3")
        title = clean_text(h3.get_text(" ")) if h3 else None
    if not title or not m:
        return None

    start_raw = _content(card, "startDate")
    if not start_raw:
        return None
    try:
        start = datetime.strptime(start_raw[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            start = datetime.strptime(start_raw[:10], "%Y-%m-%d").date()
        except ValueError:
            return None

    loc = card.select_one('[itemprop="location"]')
    venue_name = venue_url = street = zip_ = city = lat = lng = None
    if loc is not None:
        name_el = loc.select_one('[itemprop="name"]')
        venue_name = clean_text(name_el.get_text(" ")) if name_el else None
        venue_url = _content(loc, "url")
        street = _content(loc, "streetAddress")
        zip_ = _content(loc, "postalCode")
        city = _content(loc, "addressLocality")
        lat = _content(loc, "latitude")
        lng = _content(loc, "longitude")

    # Paris / Île-de-France only (agenda also lists Oise, Normandie…)
    if zip_ and not zip_.startswith(IDF_ZIP_PREFIXES):
        return None
    if not zip_ and lat and lng and not in_idf(lat, lng):
        return None

    img = card.select_one('img[itemprop="image"]')
    image_url = absolute_url(BASE_URL, img.get("src")) if img is not None and img.get("src") else None

    style = None
    for info in card.select('[itemprop="offers"] .info'):
        if info.select_one(".fa-music"):
            style = clean_text(info.get_text(" "))

    return make_event(
        source=SOURCE,
        source_id=m.group(1),
        title=title,
        start=start,
        midnight_unknown=True,  # 00:00:00 on this site means "no time given"
        description=_clean_desc(_content(card, "description"), title),
        image_url=image_url,
        price=_price(card),
        booking_url=href,
        source_url=href,
        venue_name=venue_name,
        venue_address=street,
        venue_city=city,
        venue_zip=zip_,
        venue_lat=lat,
        venue_lng=lng,
        venue_website=venue_url,
        category_slug="concerts",
        tags=["jazz"] + ([style] if style else []),
    )


def fetch_events(max_pages: int = 15, days_ahead: int = 30) -> Generator[dict, None, None]:
    """Walk the chronological agenda (12 concerts/page, ~6 pages/day) until days_ahead."""
    cutoff = (now_paris() + timedelta(days=days_ahead)).replace(tzinfo=None)
    total = 0
    with PoliteClient() as client:
        for page in range(1, max_pages + 1):
            url = AGENDA_URL if page == 1 else f"{AGENDA_URL}?p={page}"
            resp = client.get(url)
            if resp.status_code in (401, 403, 429):
                print(f"  [parisjazzclub] blocked: HTTP {resp.status_code} on {url}")
                return
            if resp.status_code != 200:
                print(f"  [parisjazzclub] HTTP {resp.status_code} on {url} — stopping")
                break
            soup_cards = resp.text.count('class="row concert')
            if not soup_cards:
                print(f"  [parisjazzclub] no concert cards on page {page} — stopping")
                break
            events = parse_listing(resp.text)
            past_cutoff = False
            for ev in events:
                start = datetime.fromisoformat(ev["start_date"]).astimezone(now_paris().tzinfo).replace(tzinfo=None)
                if start > cutoff:
                    past_cutoff = True
                    continue
                total += 1
                yield ev
            print(f"  [parisjazzclub] page {page}: {len(events)} IDF concerts")
            if past_cutoff:
                break
    print(f"  [parisjazzclub] total: {total}")
