"""
Paris Musées spider — exhibitions of the 14 City of Paris museums
(Petit Palais, MAM, Carnavalet, Catacombes, Palais Galliera, Maison de Victor Hugo,
Musée de la Libération, Bourdelle, Zadkine, Cognacq-Jay, Cernuschi, Vie romantique, …).

Source: https://www.parismusees.paris.fr/fr/expositions (public listing, Drupal)
Legal basis: HTML scraping of a public page (no JSON-LD, no API).
Checked 2026-10-07: data.parismusees.paris.fr does not exist (DNS failure) and
opendata.paris.fr has no exhibitions dataset other than "Que faire à Paris"
(covered by paris_opendata). Exhibition pages expose no schema.org data either.

Listing cards give title, museum, image and the date range as "DD" + "MM/YY";
detail pages give the full range ("du 15 septembre 2026 au 24 janvier 2027"),
the museum's postal address and a description. Exhibitions are multi-day ranges:
no opening hours → time unknown. No price is published → price unknown.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Generator, List, Optional

from bs4 import BeautifulSoup

from utils.dates import parse_date_fr
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import absolute_url, clean_text

SOURCE = "parismusees"
BASE_URL = "https://www.parismusees.paris.fr"
LISTING_URL = f"{BASE_URL}/fr/expositions"

_DMY_RE = re.compile(r"^\s*(\d{1,2})\s*$")
_MY_RE = re.compile(r"^\s*(\d{1,2})/(\d{2,4})\s*$")


def _card_date(day_txt: Optional[str], my_txt: Optional[str]) -> Optional[date]:
    """('29', '09/26') → date(2026, 9, 29)."""
    if not day_txt or not my_txt:
        return None
    d, my = _DMY_RE.match(day_txt), _MY_RE.match(my_txt)
    if not d or not my:
        return None
    year = int(my.group(2))
    if year < 100:
        year += 2000
    try:
        return date(year, int(my.group(1)), int(d.group(1)))
    except ValueError:
        return None


def parse_listing(html: str, base_url: str = LISTING_URL) -> List[dict]:
    """Exhibition cards → [{url, title, museum, start, end, image_url}] (deduplicated)."""
    soup = BeautifulSoup(html or "", "html.parser")
    out, seen = [], set()
    for art in soup.select("article.node--type-exposition"):
        a = art.find("a", href=True)
        if not a:
            continue
        url = absolute_url(base_url, a["href"])
        if not url or url in seen:
            continue
        title_el = art.select_one(".title")
        title = clean_text(title_el.get_text(" ")) if title_el else clean_text(a.get("title"))
        if not title:
            continue
        seen.add(url)

        def part(cls):
            return [clean_text(x.get_text()) for x in art.select(f".{cls} .date")]

        sd, ed = part("date-debut-evenement"), part("date-fin-evenement")
        museum_el = art.select_one(".nom-musee")
        img = art.select_one("img[src]")
        out.append({
            "url": url,
            "title": title,
            "museum": clean_text(museum_el.get_text(" ")) if museum_el else None,
            "start": _card_date(*(sd + [None, None])[:2]),
            "end": _card_date(*(ed + [None, None])[:2]),
            "image_url": absolute_url(base_url, img["src"]) if img else None,
        })
    return out


def parse_detail(html: str) -> dict:
    """Detail page → {date_text, venue_name, address, zip, city, description, image_url, museum_url}."""
    soup = BeautifulSoup(html or "", "html.parser")
    out = {}
    rng = soup.select_one(".intervalle-dates.texte") or soup.select_one(".intervalle-dates")
    if rng:
        out["date_text"] = clean_text(rng.get_text(" "))
    addr = soup.select_one("p.address")
    if addr:
        line = addr.select_one(".address-line1")
        line2 = addr.select_one(".address-line2")
        out["address"] = clean_text(" ".join(x.get_text(" ") for x in (line, line2) if x))
        z = addr.select_one(".postal-code")
        c = addr.select_one(".locality")
        out["zip"] = clean_text(z.get_text()) if z else None
        out["city"] = clean_text(c.get_text()) if c else None
        block = addr.find_parent(class_="adresse-et-bouton")
        name_el = block.find_previous_sibling(class_="title") if block else None
        if name_el:
            out["venue_name"] = clean_text(name_el.get_text(" "))
        link = block.select_one("a.en-savoir-plus-musee[href]") if block else None
        if link:
            out["museum_url"] = link["href"]
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        out["description"] = meta["content"]
    og = soup.find("meta", attrs={"property": "og:image"})
    if og and og.get("content"):
        out["image_url"] = og["content"]
    return out


def build_event(card: dict, detail: Optional[dict] = None, today: Optional[date] = None) -> Optional[dict]:
    detail = detail or {}
    start, end = card.get("start"), card.get("end")
    fr = parse_date_fr(detail.get("date_text"), today=today) if detail.get("date_text") else None
    if fr and fr.start:
        start = fr.start.date()
        end = fr.end.date() if fr.end else end
    if start is None:
        return None  # no real date → skip, never invent one
    if end is not None and end < (today or date.today()):
        return None  # exhibition over
    slug = card["url"].rstrip("/").rsplit("/", 1)[-1]
    return make_event(
        source=SOURCE,
        source_id=f"pm-{slug}",
        title=card["title"],
        start=start,  # date only → time_known False
        end=end,
        description=detail.get("description"),
        image_url=detail.get("image_url") or card.get("image_url"),
        source_url=card["url"],
        venue_name=detail.get("venue_name") or card.get("museum"),
        venue_address=detail.get("address"),
        venue_city=detail.get("city") or "Paris",
        venue_zip=detail.get("zip"),
        venue_website=detail.get("museum_url"),
        category_slug="expos",
        tags=["exposition", "Paris Musées"] + ([card["museum"]] if card.get("museum") else []),
    )


def fetch_events(max_pages: int = 3, fetch_details: bool = True) -> Generator[dict, None, None]:
    """~15 current/upcoming exhibitions: 1 listing request (+1 per extra page if any)
    and 1 request per exhibition detail page."""
    cards: List[dict] = []
    seen = set()
    with PoliteClient() as client:
        for page in range(max_pages):
            url = LISTING_URL if page == 0 else f"{LISTING_URL}?page={page}"
            html = client.get_text(url)
            if html is None:
                if page == 0:
                    print("  [parismusees] listing unavailable — nothing fetched")
                break
            new = [c for c in parse_listing(html, url) if c["url"] not in seen]
            if not new:
                break
            for c in new:
                seen.add(c["url"])
            cards += new
        for card in cards:
            try:
                detail = None
                if fetch_details:
                    dh = client.get_text(card["url"])
                    detail = parse_detail(dh) if dh else None
                ev = build_event(card, detail)
                if ev:
                    yield ev
            except BudgetExceeded:
                raise
            except Exception as e:
                print(f"  [parismusees] skip {card.get('url')}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    import json

    for ev in fetch_events(fetch_details=False):
        print(json.dumps(ev, ensure_ascii=False))
