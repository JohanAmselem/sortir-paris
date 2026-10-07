"""
New Morning — legendary jazz/world club, 7-9 rue des Petites-Écuries, 75010 Paris.
Source: https://www.newmorning.com/programmation

The programmation page embeds a JSON-LD array of schema.org Event (≈70 upcoming shows):
name, url, image, eventStatus, startDate — but startDate is always "T00:00:00" (no time),
endDate is a fixed 23:30 placeholder, and offers.price is "0.00" when not set.
So:
  - date comes from JSON-LD; the real door/show time comes from the detail page
    ("Concert 20h00 (portes 19h30)") — no detail → time unknown, never a default;
  - price only when JSON-LD price > 0, else unknown (0.00 is a placeholder, not "free");
  - endDate is ignored.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Generator, List, Optional

from bs4 import BeautifulSoup

from utils.dates import parse_time_fr
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.jsonld import extract_jsonld, image_from, iter_events
from utils.normalize import UNKNOWN_PRICE, absolute_url, clean_text, price_from_numbers

SOURCE = "newmorning"
BASE_URL = "https://www.newmorning.com/"
PROG_URL = "https://www.newmorning.com/programmation"

VENUE = dict(
    venue_name="New Morning",
    venue_address="7-9 rue des Petites-Écuries",
    venue_city="Paris",
    venue_zip="75010",
    venue_lat=48.87306825765204,
    venue_lng=2.3533229065468597,
    venue_website="https://www.newmorning.com",
)

_ID_RE = re.compile(r"/(\d{8})-(\d+)-[^/]*\.html")
_SHOW_RE = re.compile(r"(?:concert|s[ée]ance)\s+(\d{1,2}\s*h\s*\d{0,2})", re.I)
_DOORS_RE = re.compile(r"portes\s+(\d{1,2}\s*h\s*\d{0,2})", re.I)


def _https(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    url = absolute_url(BASE_URL, url.strip())
    return re.sub(r"^http://", "https://", url) if url else None


def parse_listing(html: str) -> List[dict]:
    """Programmation page → list of base items (pure).

    Each item: {url, source_id, title, day (date), image_url, summary, status, price}.
    """
    items: List[dict] = []
    seen = set()
    for obj in iter_events(extract_jsonld(html)):
        try:
            url = _https(obj.get("url"))
            title = clean_text(obj.get("name"))
            day_raw = (obj.get("startDate") or "")[:10]
            if not url or not title or not day_raw:
                continue
            day = date.fromisoformat(day_raw)
            m = _ID_RE.search(url)
            sid = m.group(2) if m else url
            if sid in seen:
                continue
            seen.add(sid)

            offers = obj.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            try:
                amount = float(str(offers.get("price") or "").replace(",", "."))
            except ValueError:
                amount = None
            price = price_from_numbers(amount) if amount and amount > 0 else dict(UNKNOWN_PRICE)

            summary = clean_text(obj.get("description"))
            if summary:
                # "Title : summary - " → summary
                summary = re.sub(r"^\s*" + re.escape(title) + r"\s*:\s*", "", summary)
                summary = clean_text(re.sub(r"\s*-\s*$", "", summary)) or None

            status = "cancelled" if "cancel" in str(obj.get("eventStatus") or "").lower() else "scheduled"
            items.append(dict(
                url=url, source_id=sid, title=title, day=day,
                image_url=_https(image_from(obj.get("image"))),
                summary=summary, status=status, price=price,
            ))
        except Exception as e:  # noqa: BLE001
            print(f"  [newmorning] skipped one JSON-LD item: {e}")
    return items


def parse_detail(html: str) -> dict:
    """Detail page → {show_time, doors_time (first set), show_times [(show, doors)], styles, description} (pure)."""
    soup = BeautifulSoup(html, "html.parser")
    out = {"show_time": None, "doors_time": None, "show_times": [], "styles": [], "description": None}

    # one pill per set: "Concert 20h00 (portes 19h30)" or "1re séance 19h00 (portes 18h30)"
    for pill in soup.select(".ev-infos .ev-pill"):
        text = clean_text(pill.get_text(" ")) or ""
        m = _SHOW_RE.search(text)
        if not m:
            continue
        t = parse_time_fr(m.group(1))
        if t is None:
            continue
        d = _DOORS_RE.search(text)
        out["show_times"].append((t, parse_time_fr(d.group(1)) if d else None))
    out["show_times"].sort(key=lambda x: x[0])
    if out["show_times"]:
        out["show_time"], out["doors_time"] = out["show_times"][0]

    out["styles"] = [s for s in (clean_text(a.get_text(" ")) for a in soup.select(".ev-styles a")) if s]

    pres = soup.select_one("article.ev-presentation")
    if pres is not None:
        parts = []
        for el in pres.select(".ev-citation, .ev-texte"):
            t = clean_text(el.get_text(" "))
            if t:
                parts.append(t)
        out["description"] = "\n\n".join(parts) or None
    return out


def build_event(item: dict, detail: Optional[dict] = None) -> dict:
    detail = detail or {}
    show = detail.get("show_time")
    start = datetime.combine(item["day"], show) if isinstance(show, time) else item["day"]
    description = detail.get("description") or item.get("summary")
    sets = detail.get("show_times") or []
    if sets:
        label = ", ".join(
            t.strftime("%Hh%M") + (f" (portes {d.strftime('%Hh%M')})" if d else "") for t, d in sets
        )
        head = ("Concert " if len(sets) == 1 else "Séances : ") + label + "."
        description = f"{head}\n\n{description}" if description else head
    return make_event(
        source=SOURCE,
        source_id=item["source_id"],
        title=item["title"],
        start=start,  # date only → time_known=False
        description=description,
        short_desc=item.get("summary"),
        image_url=item.get("image_url"),
        price=item.get("price"),
        booking_url=item["url"],
        source_url=item["url"],
        category_slug="concerts",
        tags=["jazz", "new morning"] + list(detail.get("styles") or []),
        event_status=item.get("status") or "scheduled",
        **VENUE,
    )


def fetch_events(max_pages: int = 5, max_details: int = 80) -> Generator[dict, None, None]:
    """One listing request + one detail request per show (for the real time).

    max_pages kept for run.py compatibility (the programmation is a single page).
    """
    with PoliteClient() as client:
        resp = client.get(PROG_URL)
        if resp.status_code != 200:
            print(f"  [newmorning] blocked/unavailable: HTTP {resp.status_code} on {PROG_URL}")
            return
        items = parse_listing(resp.text)
        if not items:
            print("  [newmorning] no JSON-LD events on programmation page — structure changed?")
            return
        n_time = 0
        for i, item in enumerate(items):
            detail = None
            if i < max_details:
                try:
                    html = client.get_text(item["url"])
                    detail = parse_detail(html) if html else None
                except BudgetExceeded:
                    raise
                except Exception as e:  # noqa: BLE001
                    print(f"  [newmorning] detail failed {item['url']}: {e}")
            try:
                ev = build_event(item, detail)
            except Exception as e:  # noqa: BLE001
                print(f"  [newmorning] skipped {item.get('url')}: {e}")
                continue
            n_time += 1 if ev["time_known"] else 0
            yield ev
        print(f"  [newmorning] {len(items)} concerts ({n_time} with real time)")
