"""
Paris Open Data spider — "Que faire à Paris ?" (Ville de Paris).
Source: https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/
API:    Explore v2.1 /catalog/datasets/que-faire-a-paris-/records (no key, Licence ODbL)
Legal basis: open data.

This is the same data as www.paris.fr/quefaire (record `id` = trailing number of the
paris.fr/evenements/... URL), so the paris_fr and quefaire_paris spiders duplicate it.

Field formats (checked live 2026-10-07):
- date_start / date_end: "2019-06-01T00:00:00+00:00" — the "+00:00" is FALSE: the value is
  Paris wall-clock time. 00:00 start means "no time" (date_end then 23:59:59).
- occurrences: "BEGIN_END;BEGIN_END;…" with e.g. "2026-11-21T20:00:00+02:00" — again the
  offset is bogus (+02:00 even in winter): the HH:MM is Paris wall-clock and matches
  date_description ("de 20h00 à 21h30"). Occurrences are the reliable source of times.
  "12:00_12:00" or "00:00_00:00" occurrences are placeholders for "no time".
- price_type: 'gratuit' | 'payant' | 'gratuit sous condition'; price_detail: HTML text.
- qfap_tags: "Concert;Festival" (category labels); lat_lon: {lat, lon}.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Generator, List, Optional, Tuple

from spiders.openagenda import select_occurrence
from utils.dates import PARIS, to_utc_paris
from utils.event import make_event
from utils.http import PoliteClient
from utils.normalize import FREE_PRICE, UNKNOWN_PRICE, clean_text, parse_price_fr

SOURCE = "paris_opendata"
DATASET_URL = (
    "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
    "que-faire-a-paris-/records"
)
API_OFFSET_CAP = 10000  # Explore API: offset + limit must stay <= 10000

# qfap_tags → category slug. Order = priority when an event carries several tags.
TAG_PRIORITY = [
    ("Atelier", "ateliers"),
    ("Balade urbaine", "visites"),
    ("Ecrans", "cinema"),
    ("Cinéma", "cinema"),
    ("Expo", "expos"),
    ("Concert", "concerts"),
    ("Théâtre", "theatre"),
    ("Danse", "danse"),
    ("Spectacle musical", "spectacles"),
    ("Humour", "spectacles"),
    ("Cirque", "spectacles"),
    ("Conférence", "conferences"),
    ("Littérature", "conferences"),
    ("Festival", "festivals"),
    ("Art contemporain", "expos"),
    ("Photo", "expos"),
    ("Peinture", "expos"),
    ("Street-art", "expos"),
]
# Unmapped on purpose (no matching slug): Sport, Loisirs, Enfants, Solidarité, Santé,
# Nuit, Histoire, Nature, Sciences, Innovation, Gourmand, Salon, Senior, Numérique…
# → make_event falls back to keyword detection on the title.

_PLACEHOLDER_TIMES = {time(0, 0), time(12, 0)}
_WALLCLOCK_RE = re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?")


def _wallclock(value) -> Optional[datetime]:
    """'2026-11-21T20:00:00+02:00' → naive 2026-11-21 20:00 (offset ignored: it is bogus)."""
    if not value:
        return None
    m = _WALLCLOCK_RE.search(str(value))
    if not m:
        return None
    try:
        return datetime.combine(
            date.fromisoformat(m.group(1)), time(int(m.group(2)), int(m.group(3)), int(m.group(4) or 0))
        )
    except ValueError:
        return None


def parse_occurrences(text: Optional[str]) -> List[Tuple[datetime, datetime]]:
    """'B_E;B_E' → [(naive local begin, naive local end)], end fixed when past midnight."""
    out = []
    for part in (text or "").split(";"):
        if "_" not in part:
            continue
        b_s, e_s = part.split("_", 1)
        b, e = _wallclock(b_s), _wallclock(e_s)
        if b is None:
            continue
        if e is None or e < b:
            # "de 21h00 à 01h00" is stored as same-day 01:00 → next day
            e = e + timedelta(days=1) if e is not None and (b - e) < timedelta(days=1) else b
        out.append((b, e))
    return out


def map_category(tags: List[str]) -> Optional[str]:
    tagset = {t.strip().lower() for t in tags}
    for label, slug in TAG_PRIORITY:
        if label.lower() in tagset:
            return slug
    return None


def price_from_record(rec: dict) -> dict:
    """price_type + price_detail → price dict.

    - 'gratuit' → free.
    - 'payant' → paid only when an amount is parsed from price_detail; otherwise UNKNOWN
      (never 0/0 'paid'). A detail like "gratuit pour les -7 ans" on a paid event is not
      a free event → unknown.
    - 'gratuit sous condition' → amounts if any (e.g. paid membership), else free.
    """
    ptype = (rec.get("price_type") or "").strip().lower()
    detail = clean_text(rec.get("price_detail"))
    parsed = parse_price_fr(detail) if detail else dict(UNKNOWN_PRICE)
    if ptype == "gratuit":
        return dict(FREE_PRICE)
    if ptype == "payant":
        return parsed if parsed["price_status"] == "paid" else dict(UNKNOWN_PRICE)
    if ptype.startswith("gratuit"):
        return parsed if parsed["price_status"] == "paid" else dict(FREE_PRICE)
    return parsed


# "Plusieurs lieux dans Paris" records are geocoded to this city-centre point.
_PLACEHOLDER_GEO = (48.856578, 2.351828)


def _is_placeholder_geo(lat, lng) -> bool:
    try:
        return abs(float(lat) - _PLACEHOLDER_GEO[0]) < 1e-5 and abs(float(lng) - _PLACEHOLDER_GEO[1]) < 1e-5
    except (TypeError, ValueError):
        return False


def _latlng(rec: dict) -> Tuple[Optional[float], Optional[float]]:
    lat, lng = _raw_latlng(rec)
    if lat is None or _is_placeholder_geo(lat, lng):
        return None, None
    return lat, lng


def _raw_latlng(rec: dict) -> Tuple[Optional[float], Optional[float]]:
    geo = rec.get("lat_lon")
    if isinstance(geo, dict) and geo.get("lat") is not None:
        return geo.get("lat"), geo.get("lon")
    for loc in rec.get("locations") or []:
        raw = (loc or {}).get("address_lat_lon")
        if raw and "," in raw:
            a, b = raw.split(",", 1)
            try:
                return float(a), float(b)
            except ValueError:
                pass
    return None, None


def _dates(rec: dict, now: datetime):
    """→ (start, end, time_known) or None when the event is over / undated."""
    occs = parse_occurrences(rec.get("occurrences"))
    if occs:
        utc = [(to_utc_paris(b), to_utc_paris(e)) for b, e in occs]
        picked = select_occurrence(utc, now=now)
        if picked is None:
            return None
        b_utc, e_utc = picked
        b = b_utc.astimezone(PARIS).replace(tzinfo=None)
        e = e_utc.astimezone(PARIS).replace(tzinfo=None) if e_utc else None
        # placeholder occurrences ("de 12h00 à 12h00", "00:00_00:00") carry no real time
        src = next(((ob, oe) for ob, oe in occs if ob == b), None)
        if src and src[0] == src[1] and src[0].time() in _PLACEHOLDER_TIMES:
            return b.date(), (e.date() if e else None), False
        return b, e, True
    start = _wallclock(rec.get("date_start"))
    end = _wallclock(rec.get("date_end"))
    if start is None:
        return None
    last = end or start
    if to_utc_paris(last) < now:
        return None
    known = start.time() != time(0, 0)
    s_val = start if known else start.date()
    e_val = None
    if end is not None:
        e_val = end if (known or end.time() not in (time(23, 59, 59), time(23, 59), time(0, 0))) else end.date()
    return s_val, e_val, known


def parse_record(rec: dict, now: Optional[datetime] = None) -> Optional[dict]:
    """One dataset record → event dict, or None (past, untitled)."""
    now = now or datetime.now(timezone.utc)
    title = rec.get("title") or rec.get("title_event")
    if not clean_text(title):
        return None
    d = _dates(rec, now)
    if d is None:
        return None
    start, end, known = d
    tags = [t.strip() for t in (rec.get("qfap_tags") or "").split(";") if t.strip()]
    lat, lng = _latlng(rec)
    loc0 = (rec.get("locations") or [{}])[0] or {}
    zip_code = (rec.get("address_zipcode") or "").strip() or None
    if zip_code == "75000":  # placeholder for "several places in Paris"
        zip_code = None
    is_online = None
    if str(loc0.get("location_type") or "").lower() in ("online", "en ligne", "web"):
        is_online = True
    return make_event(
        source=SOURCE,
        source_id=str(rec.get("id") or rec.get("event_id") or "") or None,
        title=title,
        start=start,
        end=end,
        time_known=known,
        description=rec.get("description") or rec.get("lead_text"),
        short_desc=rec.get("lead_text"),
        image_url=rec.get("cover_url"),
        price=price_from_record(rec),
        booking_url=rec.get("access_link"),
        source_url=rec.get("url"),
        venue_name=rec.get("address_name"),
        venue_address=rec.get("address_street"),
        venue_city=rec.get("address_city"),
        venue_zip=zip_code,
        venue_lat=lat,
        venue_lng=lng,
        category_slug=map_category(tags),
        tags=tags,
        is_online=is_online,
    )


def parse_api(data: dict, now: Optional[datetime] = None) -> List[dict]:
    out = []
    for rec in (data or {}).get("results") or []:
        try:
            ev = parse_record(rec, now=now)
        except Exception as e:  # one bad record never kills the run
            print(f"  [paris_opendata] skip record {rec.get('id')}: {type(e).__name__}: {e}")
            continue
        if ev:
            out.append(ev)
    return out


def fetch_events(limit: int = 100, max_records: Optional[int] = None) -> Generator[dict, None, None]:
    """All current/upcoming records (date_end >= now), ~3,600 on 2026-10-07 → ~36 requests.

    Paginates by offset ordered by event_id; past the API's 10,000 offset cap it switches
    to keyset paging (event_id >= last seen) so the whole dataset stays reachable.
    """
    base_where = "date_end >= now()"
    seen = set()
    offset = 0
    floor_eid = None
    fetched = 0
    with PoliteClient() as client:
        while True:
            where = base_where + (f" AND event_id >= {floor_eid}" if floor_eid is not None else "")
            data = client.get_json(DATASET_URL, params={
                "limit": limit, "offset": offset, "order_by": "event_id", "where": where,
            })
            if data is None:
                print("  [paris_opendata] API request failed — stopping")
                return
            results = data.get("results") or []
            if not results:
                return
            fresh = [r for r in results if r.get("id") not in seen]
            seen.update(r.get("id") for r in results)
            for ev in parse_api({"results": fresh}):
                yield ev
            fetched += len(results)
            if len(results) < limit or (max_records and fetched >= max_records):
                return
            offset += limit
            if offset + limit > API_OFFSET_CAP:
                floor_eid = results[-1].get("event_id")
                offset = 0


if __name__ == "__main__":
    import json

    for i, event in enumerate(fetch_events(limit=10, max_records=10)):
        print(json.dumps(event, indent=2, ensure_ascii=False))
        if i >= 4:
            break
