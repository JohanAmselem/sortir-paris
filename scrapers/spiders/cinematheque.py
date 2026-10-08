"""
La Cinémathèque française spider — screenings, cycles, ciné-concerts, talks, visits.
Source: https://www.cinematheque.fr (HTML scraping; no JSON-LD on the site).

robots.txt: none (HTTP 404 on 2026-10-09) → nothing is disallowed.

Strategy:
  1. Monthly calendar pages /calendrier/MM-YYYY.html (current month + the next
     `months - 1`). Each day block has the full date ("jeudi 1 octobre 2026") and one
     <a class="show" href="seance/<id>.html"> per séance with: start time, room code
     (HL / GF / JE …), cycle name, optional programme title ("title-manif"), remarks
     ("Séance présentée par …", "TARIF B", "Entrée libre sur inscription"), and the
     films (title + "director, year") or a non-film item (talk, visit, workshop).
  2. Upcoming séance pages (seance/<id>.html, while the time budget allows): poster
     image, real end time ("14h30 → 18h15"), introduction text and film synopses.
  3. Prices: the "Informations pratiques" page publishes the price grid ("Toutes les
     séances sont par défaut en tarif A", tarifs B–D for special séances, the letter
     being shown on the calendar). It is read once per run; the public tiers
     (plein, réduit, 18-25, < 18, handicap — not cards / subscriptions) give
     price_min–price_max. Screenings and talks in the cinema rooms get tarif A unless
     another letter or "gratuit / entrée libre" is shown. Visits, workshops and
     museum activities have their own prices → unknown unless shown.

Category: cinema; conferences for talks / round tables / lectures without a film;
visites for guided tours; ateliers for workshops and practical courses.
Venue: fixed — La Cinémathèque française, 51 rue de Bercy, 75012 Paris.
Séances "réservées aux Libre Pass" (subscribers only) are skipped.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, time, timedelta
from typing import Dict, Generator, List, Optional
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from utils.dates import now_paris, parse_date_fr, parse_time_fr
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient, current_budget
from utils.normalize import FREE_PRICE, UNKNOWN_PRICE, absolute_url, clean_text, to_centimes

SOURCE = "cinematheque"
BASE_URL = "https://www.cinematheque.fr"
INFO_URL = f"{BASE_URL}/informations-pratiques.html"

VENUE = {
    "venue_name": "La Cinémathèque française",
    "venue_address": "51 rue de Bercy",
    "venue_zip": "75012",
    "venue_city": "Paris",
    "venue_website": BASE_URL,
}
# Room codes of the calendar whose names are confirmed by the séance pages; other
# codes (MUSI, Mez…) are named from the séance page only.
ROOMS = {
    "HL": "Salle Henri Langlois",
    "GF": "Salle Georges Franju",
    "JE": "Salle Jean Epstein",
}
CINEMA_ROOMS = {"HL", "GF", "JE"}

# Stop opening séance pages when less than this many seconds of budget remain.
BUDGET_MARGIN = 30
MAX_DESCRIPTION = 2000

_SEANCE_RE = re.compile(r"seance/(\d+)\.html")
_TARIF_LETTER_RE = re.compile(r"\btarif\s+([A-D])\b", re.I)
_FREE_RE = re.compile(r"\b(gratuit\w*|entr[ée]e libre)\b", re.I)
_PRIVATE_RE = re.compile(r"r[ée]serv[ée]e?s?\s+aux\s+(libre pass|abonn)", re.I)
_CANCELLED_RE = re.compile(r"\bannul[ée]e?s?\b", re.I)
_VISIT_RE = re.compile(r"\bvisite", re.I)
_WORKSHOP_RE = re.compile(r"\b(atelier|stage|cours pratique|les studios)", re.I)
_TALK_RE = re.compile(
    r"\b(conf[ée]rence|table ronde|rencontre|masterclass|master class|le[çc]on de cin[ée]ma|dialogue|"
    r"discussion|lecture|colloque|journ[ée]e d'[ée]tude|d[ée]bat|hommage)\b",
    re.I,
)
_PRICE_PAIR_RE = re.compile(r"([^:€]{2,60}?)\s*:\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*€")
_EXCLUDED_TIER_RE = re.compile(r"(carte|abonn|libre pass|cin[ée]famille)", re.I)


# ─────────────────────────── robots.txt ───────────────────────────

def robots_allows(client, url: str, base_url: str = BASE_URL) -> bool:
    """Local robots.txt check (no shared helper exists): 404 → allowed; 401/403 or an
    unreachable robots.txt → treated as blocked (we never force our way in)."""
    try:
        resp = client.get(f"{base_url}/robots.txt")
    except BudgetExceeded:
        raise
    except Exception as e:
        print(f"  [{SOURCE}] robots.txt unreachable ({e}) — treated as blocked")
        return False
    if resp.status_code in (401, 403, 429):
        print(f"  [{SOURCE}] blocked: robots.txt → HTTP {resp.status_code}")
        return False
    if resp.status_code >= 400:
        return True  # no robots.txt
    rp = RobotFileParser()
    rp.parse(resp.text.splitlines())
    from utils.http import USER_AGENT

    return rp.can_fetch(USER_AGENT, url)


# ─────────────────────────── pure parsers ───────────────────────────

def parse_tarifs(html: str) -> Dict[str, dict]:
    """'Informations pratiques' page → {'A': price dict, 'B': …} for cinema séances."""
    text = clean_text(html) or ""
    out: Dict[str, dict] = {}
    starts = [(m.group(1), m.start()) for m in re.finditer(r"Tarif ([A-D])\s+Plein tarif", text)]
    for i, (letter, pos) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else pos + 600
        seg = text[pos:end]
        seg = re.split(r"\*|En savoir plus", seg)[0]
        amounts = []
        for label, value in _PRICE_PAIR_RE.findall(seg):
            if _EXCLUDED_TIER_RE.search(label):
                continue
            c = to_centimes(value)
            if c:
                amounts.append(c)
        if amounts and letter not in out:
            out[letter] = {
                "price_min": min(amounts), "price_max": max(amounts),
                "is_free": False, "price_status": "paid",
            }
    return out


def _text(el) -> Optional[str]:
    return clean_text(el.get_text(" ", strip=True)) if el is not None else None


def _parse_show(a, day: date) -> Optional[dict]:
    m = _SEANCE_RE.search(a.get("href") or "")
    t = parse_time_fr(_text(a.select_one(".time")))
    if not m or t is None:
        return None
    films, items = [], []
    for li in a.select("li.film"):
        # badges inside the title (CM = short film, age bubble) are not part of it
        for badge in li.select(".title .tooltipable"):
            badge.decompose()
        title = _text(li.select_one(".title"))
        if not title:
            continue
        real = _text(li.select_one(".real"))
        if real:
            films.append({"title": title, "real": real})
        else:
            items.append(title)
    rems = [r for r in (_text(x) for x in a.select(".rem")) if r]
    room = (_text(a.select_one(".salle")) or "").upper() or None
    return {
        "id": m.group(1),
        "url": absolute_url(BASE_URL + "/", a["href"]),
        "start": datetime.combine(day, t),
        "room": room,
        "cycle": _text(a.select_one(".cycle")),
        "manif": _text(a.select_one(".title-manif")),
        "rems": rems,
        "films": films,
        "items": items,
    }


def parse_calendar(html: str, today: Optional[date] = None) -> List[dict]:
    """Monthly calendar page → séance dicts (only days ≥ today when `today` is given)."""
    soup = BeautifulSoup(html or "", "html.parser")
    out: List[dict] = []
    for day_el in soup.select("div.day"):
        date_el = day_el.select_one(".date")
        when = parse_date_fr(_text(date_el), today=today) if date_el else None
        if when is None or when.start is None:
            continue
        day = when.start.date()
        if today is not None and day < today:
            continue
        for a in day_el.select("a.show[href]"):
            try:
                s = _parse_show(a, day)
            except Exception as e:  # one broken block never kills the page
                print(f"  [{SOURCE}] séance block error: {e}")
                continue
            if s:
                out.append(s)
    return out


def parse_seance_page(html: str) -> dict:
    """Séance page → {'image', 'end_time', 'intro', 'films': [text], 'title'}."""
    soup = BeautifulSoup(html or "", "html.parser")
    og = soup.find("meta", attrs={"property": "og:image"})
    img = soup.select_one("img.affiche")
    image = (og.get("content") if og and og.get("content") else None) or (
        absolute_url(BASE_URL + "/", img.get("src")) if img is not None and img.get("src") else None)
    end_time = None
    end_el = soup.select_one(".endTime")
    if end_el is not None:
        times = re.findall(r"(\d{1,2})h(\d{2})?", end_el.get_text(" ", strip=True))
        if len(times) >= 2:
            h, mi = times[1]
            end_time = time(int(h), int(mi or 0))
    films = []
    for f in soup.select(".films .film"):
        parts = [_text(f.select_one(".titre")), _text(f.select_one(".intro")), _text(f.select_one(".synopsys"))]
        txt = " — ".join(p for p in parts if p)
        if txt:
            films.append(txt)
    return {
        "image": image,
        "room": _text(soup.select_one(".seance .date h1.sub")),
        "end_time": end_time,
        "intro": _text(soup.select_one(".seance .description")),
        "films": films,
    }


def category_for(s: dict) -> Optional[str]:
    texts = " ".join([s.get("cycle") or "", s.get("manif") or ""] + s["items"])
    if s["films"]:
        return "cinema"
    if _VISIT_RE.search(texts):
        return "visites"
    if _WORKSHOP_RE.search(texts):
        return "ateliers"
    if _TALK_RE.search(texts):
        return "conferences"
    return "cinema" if (s.get("room") or "") in CINEMA_ROOMS else None  # → keyword detection


def price_for(s: dict, category: str, tarifs: Dict[str, dict]) -> dict:
    rem = " ".join(s["rems"])
    if _FREE_RE.search(rem):
        return dict(FREE_PRICE)
    m = _TARIF_LETTER_RE.search(rem)
    if m and m.group(1).upper() in tarifs:
        return dict(tarifs[m.group(1).upper()])
    if category in ("cinema", "conferences") and (s.get("room") or "") in CINEMA_ROOMS and "A" in tarifs:
        return dict(tarifs["A"])  # "Toutes les séances sont par défaut en tarif A"
    return dict(UNKNOWN_PRICE)


def title_for(s: dict) -> Optional[str]:
    if s.get("manif"):
        return s["manif"]
    if not s["films"]:
        return s["items"][0] if s["items"] else None
    titles = [f["title"] for f in s["films"]]
    if len(titles) == 1:
        return titles[0]
    return " / ".join(titles[:3]) + (" …" if len(titles) > 3 else "")


def build_event(s: dict, tarifs: Dict[str, dict], detail: Optional[dict] = None) -> Optional[dict]:
    """Calendar séance (+ optional séance page data) → event dict; None if private."""
    rem = " ".join(s["rems"])
    if _PRIVATE_RE.search(rem):
        return None
    title = title_for(s)
    if not title:
        return None
    category = category_for(s)
    detail = detail or {}

    end = None
    if detail.get("end_time"):
        end = datetime.combine(s["start"].date(), detail["end_time"])
        if end <= s["start"]:
            end += timedelta(days=1)

    lines = []
    if detail.get("intro"):
        lines.append(detail["intro"])
    if detail.get("films"):
        lines += detail["films"]
    else:
        lines += [f"{f['title']} ({f['real']})" for f in s["films"]]
        lines += [i for i in s["items"] if i != title]
    lines += s["rems"]
    if s.get("cycle"):
        lines.append(f"Cycle : {s['cycle']}")
    description = "\n".join(lines)[:MAX_DESCRIPTION]

    room = detail.get("room") or ROOMS.get(s.get("room") or "")
    tags = [t for t in (s.get("cycle"), room) if t]
    return make_event(
        source=SOURCE,
        source_id=s["id"],
        title=title,
        start=s["start"],
        end=end,
        description=description,
        image_url=detail.get("image"),
        price=price_for(s, category, tarifs),
        source_url=s["url"],
        booking_url=s["url"],
        category_slug=category,
        tags=tags,
        event_status="cancelled" if _CANCELLED_RE.search(rem) else "scheduled",
        is_online=False,
        **VENUE,
    )


# ─────────────────────────── network ───────────────────────────

def _months(today: date, n: int) -> List[str]:
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f"{m:02d}-{y}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def fetch_events(months: int = 3, days_ahead: int = 60, max_details: int = 450) -> Generator[dict, None, None]:
    """Calendar pages for `months` months; séances within `days_ahead` days are
    enriched from their page (image, end time, synopsis) while the budget allows."""
    today = now_paris().date()
    horizon = today + timedelta(days=days_ahead)
    count = details = errors = 0
    with PoliteClient() as client:
        if not robots_allows(client, f"{BASE_URL}/calendrier/"):
            print(f"  [{SOURCE}] robots.txt disallows the calendar — nothing to do")
            return
        info = client.get_text(INFO_URL)
        tarifs = parse_tarifs(info) if info else {}
        if not tarifs:
            print(f"  [{SOURCE}] price grid not found — prices unknown this run")
        seances: List[dict] = []
        for month in _months(today, months):
            html = client.get_text(f"{BASE_URL}/calendrier/{month}.html")
            if html is None:
                print(f"  [{SOURCE}] calendar {month} unavailable or blocked")
                continue
            seances += [s for s in parse_calendar(html, today) if s["id"] not in {x["id"] for x in seances}]
        print(f"  [{SOURCE}] {len(seances)} upcoming séances in {months} calendar months")
        for s in seances:
            detail = None
            if (s["start"].date() <= horizon and details < max_details
                    and current_budget().remaining() > BUDGET_MARGIN):
                details += 1
                try:
                    page = client.get_text(s["url"])
                    detail = parse_seance_page(page) if page else None
                except BudgetExceeded:
                    raise
                except Exception as e:
                    errors += 1
                    print(f"  [{SOURCE}] séance page error {s['url']}: {e}")
            ev = build_event(s, tarifs, detail)
            if ev:
                count += 1
                yield ev
    print(f"  [{SOURCE}] {count} events ({details} séance pages read, {errors} errors)")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events(months=1, max_details=3)):
        print(json.dumps(ev, ensure_ascii=False, indent=1))
        if i >= 3:
            break
