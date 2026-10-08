"""
Forum des images spider — screenings, cycles, master classes, talks, family sessions.
Source: https://www.forumdesimages.fr (Drupal; HTML scraping, no JSON-LD on the site).

robots.txt (checked 2026-10-09): only Drupal technical paths, /search/, /user/… and
/media/oembed are disallowed; /agenda and the session pages are allowed.

Strategy:
  1. /agenda lists every published session (≈120 over ~10 weeks on 2026-10-09),
     grouped by day (<a id="day_YYYY-MM-DD">). Each teaser has: cycle, session page
     URL, image, start time ("15h", "18h30"), ticketing link (when on sale), title,
     directors, age advice and session type ("Film",
     "Film + débat", "Master class", "Conférence"…). /agenda?date=next_month is read
     too in case the default view is ever shortened.
  2. Session pages (while the time budget allows): real price ("Tarif plein : 7,50€,
     réduit : 6€" / "Entrée libre"), the date with its year, the cycle blurb, synopsis
     and credits. Without a session page the price stays unknown (never guessed).

Category: cinema; conferences for master classes, talks, courses (Les cours du
vendredi, Cinéphilo); spectacles for live role-play shows; ateliers for POPUP!.
Venue: fixed — Forum des images, 2 rue du Cinéma (Forum des Halles), 75001 Paris.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Dict, Generator, List, Optional
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from utils.dates import parse_time_fr
from utils.event import make_event
from utils.http import USER_AGENT, BudgetExceeded, PoliteClient, current_budget
from utils.normalize import UNKNOWN_PRICE, absolute_url, clean_text, parse_price_fr

SOURCE = "forumdesimages"
BASE_URL = "https://www.forumdesimages.fr"
AGENDA_URLS = [f"{BASE_URL}/agenda", f"{BASE_URL}/agenda?program=&type=&date=next_month"]

VENUE = {
    "venue_name": "Forum des images",
    "venue_address": "2 rue du Cinéma",
    "venue_zip": "75001",
    "venue_city": "Paris",
    "venue_website": BASE_URL,
}

# session type (lower-case) → category; anything else → cinema
TYPE_CATEGORY = {
    "master class": "conferences",
    "masterclass": "conferences",
    "conférence": "conferences",
    "conference": "conferences",
    "discussion": "conferences",
    "rencontre": "conferences",
    "les cours du vendredi": "conferences",
    "cinéphilo": "conferences",
    "lecture": "conferences",
    "jeu de rôle en public": "spectacles",
    "popup!": "ateliers",
    "atelier": "ateliers",
}

BUDGET_MARGIN = 30
MAX_DESCRIPTION = 2000

_DAY_ID_RE = re.compile(r"^day_(\d{4})-(\d{2})-(\d{2})$")
_BOOKING_ID_RE = re.compile(r"-ei(\d+)\.html")
_FREE_RE = re.compile(r"\b(gratuit\w*|entr[ée]e libre)\b", re.I)
_TITLE_FLAG_RE = re.compile(r"^\s*\[([^\]]{3,20})\]\s*")  # "[ANNULÉE] Rencontre …", "[COMPLET] …"


def robots_allows(client, url: str) -> bool:
    """Local robots.txt check (no shared helper exists): 404 → allowed; 401/403/429
    or an unreachable robots.txt → treated as blocked."""
    try:
        resp = client.get(f"{BASE_URL}/robots.txt")
    except BudgetExceeded:
        raise
    except Exception as e:
        print(f"  [{SOURCE}] robots.txt unreachable ({e}) — treated as blocked")
        return False
    if resp.status_code in (401, 403, 429):
        print(f"  [{SOURCE}] blocked: robots.txt → HTTP {resp.status_code}")
        return False
    if resp.status_code >= 400:
        return True
    rp = RobotFileParser()
    rp.parse(resp.text.splitlines())
    return rp.can_fetch(USER_AGENT, url)


# ─────────────────────────── pure parsers ───────────────────────────

def _text(el) -> Optional[str]:
    return clean_text(el.get_text(" ", strip=True)) if el is not None else None


def parse_agenda(html: str, today: Optional[date] = None) -> List[dict]:
    """Agenda page → session dicts (days ≥ today when `today` is given)."""
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[dict] = []
    for day_el in soup.select(".agenda-grid-day-content"):
        anchor = day_el.select_one(".agenda-grid-day-name a[id]")
        m = _DAY_ID_RE.match(anchor.get("id", "")) if anchor is not None else None
        if not m:
            continue
        day = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if today is not None and day < today:
            continue
        for art in day_el.select("article.session-calendar-teaser-item"):
            try:
                s = _parse_teaser(art, day)
            except Exception as e:  # one broken teaser never kills the page
                print(f"  [{SOURCE}] teaser error: {e}")
                continue
            if s:
                out.append(s)
    return out


def _parse_teaser(art, day: date) -> Optional[dict]:
    link = art.select_one(".teaser-content h3 a[href]")
    t = parse_time_fr(_text(art.select_one(".time")))
    if link is None or t is None:
        return None
    url = absolute_url(BASE_URL, link["href"])
    booking_a = art.select_one(".field-link a[href]")
    booking = booking_a["href"] if booking_a is not None else None
    bm = _BOOKING_ID_RE.search(booking or "")
    img = art.select_one(".poster img[src]")
    directors = [d for d in (_text(li) for li in art.select(".directors li")) if d]
    start = datetime.combine(day, t)
    slug = url[len(BASE_URL):].strip("/") if url.startswith(BASE_URL) else url
    return {
        # session page slug + local start: stable even when the ticketing link
        # (…-ei<id>.html) only appears later
        "id": f"{slug}@{start.strftime('%Y-%m-%dT%H:%M')}",
        "booking_id": bm.group(1) if bm else None,
        "url": url,
        "booking_url": booking,
        "start": start,
        "title": _text(link),
        "cycle": _text(art.select_one(".cycle-name")),
        "image": absolute_url(BASE_URL, img["src"]) if img is not None else None,
        "directors": directors,
        "age": _text(art.select_one(".age-classification")),
        "type": _text(art.select_one(".field-type-session")),
    }


def parse_session_page(html: str) -> dict:
    """Session page → {'price', 'image', 'description', 'tags'}."""
    soup = BeautifulSoup(html or "", "html.parser")
    info = soup.select_one(".session-info")
    price_txt = _text(soup.select_one(".ticketing-info-price"))
    price = None
    if price_txt:
        price = parse_price_fr(price_txt)
        if price["price_status"] == "unknown" and _FREE_RE.search(price_txt):
            price = parse_price_fr("gratuit")
    og = soup.find("meta", attrs={"property": "og:image"})
    parts = []
    lead = _text(soup.select_one(".session-description"))
    if lead:
        parts.append(lead)
    for proj in soup.select(".session-content .session-content-item"):
        head = _text(proj.select_one(".projection-header"))
        body = _text(proj.select_one(".field-body"))
        txt = " — ".join(p for p in (head, body) if p)
        if txt:
            parts.append(txt)
    tags = [t for t in (_text(x) for x in (info.select(".tags .tag") if info else [])) if t]
    return {
        "price": price,
        "price_text": price_txt,
        "image": og.get("content") if og is not None and og.get("content") else None,
        "description": "\n".join(parts)[:MAX_DESCRIPTION] or None,
        "tags": tags,
    }


_TALK_TITLE_RE = re.compile(
    r"^(rencontre|ciné-rencontre|master ?class|maestraclasse|conf[ée]rence|table ronde|le[çc]on de cin[ée]ma)\b",
    re.I,
)


def category_for(session_type: Optional[str], title: Optional[str] = None) -> str:
    cat = TYPE_CATEGORY.get((session_type or "").strip().lower(), "cinema")
    if cat == "cinema" and title and _TALK_TITLE_RE.match(_TITLE_FLAG_RE.sub("", title)):
        return "conferences"  # "Rencontre avec …" filed as "Film"
    return cat


def build_event(s: dict, detail: Optional[dict] = None) -> Optional[dict]:
    title = s.get("title")
    if not title:
        return None
    status = "scheduled"
    flags = []
    m = _TITLE_FLAG_RE.match(title)
    if m:
        flag = m.group(1).strip()
        title = title[m.end():]
        if re.match(r"annul", flag, re.I):
            status = "cancelled"
        else:
            flags.append(flag.capitalize())
    detail = detail or {}
    lines = []
    if detail.get("description"):
        lines.append(detail["description"])
    else:
        if s["directors"]:
            lines.append("De " + ", ".join(s["directors"]))
        if s.get("type"):
            lines.append(s["type"])
    if s.get("cycle"):
        lines.append(f"Cycle : {s['cycle']}")
    if s.get("age"):
        lines.append(s["age"])
    tags = [t for t in [s.get("cycle"), s.get("type")] + list(detail.get("tags") or []) + flags if t]
    return make_event(
        source=SOURCE,
        source_id=s["id"],
        title=title,
        start=s["start"],
        description="\n".join(lines)[:MAX_DESCRIPTION],
        image_url=detail.get("image") or s.get("image"),
        price=detail.get("price") or dict(UNKNOWN_PRICE),
        source_url=s["url"],
        booking_url=s.get("booking_url") or s["url"],
        category_slug=category_for(s.get("type"), title),
        tags=list(dict.fromkeys(tags)),
        event_status=status,
        is_online=False,
        **VENUE,
    )


# ─────────────────────────── network ───────────────────────────

def fetch_events(max_details: int = 300) -> Generator[dict, None, None]:
    from utils.dates import now_paris

    today = now_paris().date()
    count = details = errors = 0
    cache: Dict[str, Optional[dict]] = {}
    with PoliteClient() as client:
        if not robots_allows(client, AGENDA_URLS[0]):
            print(f"  [{SOURCE}] robots.txt disallows the agenda — nothing to do")
            return
        sessions: List[dict] = []
        ids = set()
        for url in AGENDA_URLS:
            html = client.get_text(url)
            if html is None:
                print(f"  [{SOURCE}] agenda unavailable or blocked: {url}")
                continue
            for s in parse_agenda(html, today):
                if s["id"] not in ids:
                    ids.add(s["id"])
                    sessions.append(s)
        print(f"  [{SOURCE}] {len(sessions)} upcoming sessions")
        for s in sessions:
            if s["url"] not in cache and details < max_details and current_budget().remaining() > BUDGET_MARGIN:
                details += 1
                try:
                    page = client.get_text(s["url"])
                    cache[s["url"]] = parse_session_page(page) if page else None
                except BudgetExceeded:
                    raise
                except Exception as e:
                    errors += 1
                    cache[s["url"]] = None
                    print(f"  [{SOURCE}] session page error {s['url']}: {e}")
            ev = build_event(s, cache.get(s["url"]))
            if ev:
                count += 1
                yield ev
    print(f"  [{SOURCE}] {count} events ({details} session pages read, {errors} errors)")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events(max_details=3)):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
        if i >= 3:
            break
