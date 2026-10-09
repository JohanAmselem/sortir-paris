"""
DATAtourisme spider — national open tourism data (Licence Ouverte / Etalab 2.0).
https://www.datatourisme.fr · ontology: https://www.datatourisme.fr/ontology/core
(https://gitlab.adullact.net/adntourisme/datatourisme/ontology, doc v3.1.0).

Two ways in, chosen by the environment:

1. DATATOURISME_FLUX_URL — legacy "Diffuseur" flux (diffuseur.datatourisme.fr):
   https://diffuseur.datatourisme.fr/webservice/<flux_key>/<app_key> returns a ZIP with
   `index.json` at the root and one JSON-LD file per POI under `objects/…`. The archive
   is streamed to a temporary file, then read one member at a time.
   NB (checked 2026-10-09): since 2026-10-01 no new Diffuseur account or flux can be
   created and the platform closes in October 2027
   (https://support.datatourisme.fr/t/3162). Only an existing flux can use this path.

2. DATATOURISME_API_KEY — the new API (https://api.datatourisme.fr/v1/docs):
   GET /v1/entertainmentAndEvent?filters=…&fields=…&lang=fr&page_size=100, key in the
   `X-API-Key` header, pagination with `meta.next`, max 100 objects/page,
   1000 requests/hour. Field names are the ontology local names (label, takesPlaceAt…).

Both formats go through the same tolerant reader: JSON-LD keys may carry a prefix
("rdfs:label", "schema:startDate", "ebucore:locator") or not ("label", "startDate"),
values may be plain, lists, {"@value", "@language"} or language maps {"fr": [...]}.

Ontology paths used (core namespace https://www.datatourisme.fr/ontology/core#):
  rdfs:label · hasDescription → dc:description / shortDescription (fallback rdfs:comment)
  takesPlaceAt (Period) → startDate, endDate, startTime, endTime
  isLocatedAt → schema:address → schema:postalCode, schema:addressLocality,
     schema:streetAddress, hasAddressCity → isPartOfDepartment → insee
  isLocatedAt → schema:geo → schema:latitude / schema:longitude
  schema:offers → schema:priceSpecification → schema:minPrice / maxPrice / price,
     hasEligiblePolicy (kb:Free = gratuit) · textPriceSpecification
  hasMainRepresentation → ebucore:hasRelatedResource → ebucore:locator (image)
  hasBookingContact / hasContact → foaf:homepage
  @type → event classes (Concert, TheaterEvent, Exhibition, …) → our category slugs

One event per future period (≤ MAX_PERIODS periods), else one event for the run
(same rule as OpenAgenda). Times are Paris local; time_known only when startTime exists.
Only 75/92/93/94 are kept; markets, fairs, sports, business and religious events are skipped.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import zipfile
from collections import Counter
from datetime import date, datetime, time, timezone
from typing import Any, Generator, Iterable, Iterator, List, Optional, Tuple

import httpx

from spiders.openagenda import select_occurrence
from utils.dates import PARIS
from utils.event import make_event
from utils.http import DEFAULT_HEADERS, USER_AGENT, PoliteClient, current_budget
from utils.normalize import UNKNOWN_PRICE, in_service_zone, parse_price_fr, price_from_numbers

SOURCE = "datatourisme"
DROPS: Counter = Counter()
API_BASE = "https://api.datatourisme.fr/v1"
ZONE_DEPARTMENTS = ("75", "92", "93", "94")
MAX_PERIODS = 12          # more future periods than this → one event for the whole run
MAX_ZIP_BYTES = 500 * 1024 * 1024
API_PAGE_SIZE = 100
API_FIELDS = (
    "uuid,uri,label,type,comment,hasDescription,takesPlaceAt,isLocatedAt,offers,"
    "hasMainRepresentation,hasContact,hasBookingContact,hasTheme,lastUpdate"
)

# ── event classes (local names of the ontology classes) ──
EVENT_CLASSES = {"EntertainmentAndEvent", "Event"}
# Checked in this order: the first class present gives the category.
TYPE_CATEGORY = [
    ("Exhibition", "expos"), ("ExhibitionEvent", "expos"),
    ("TheaterEvent", "theatre"),
    ("Opera", "concerts"), ("Concert", "concerts"), ("MusicEvent", "concerts"),
    ("DanceEvent", "danse"),
    ("ScreeningEvent", "cinema"),
    ("Festival", "festivals"),
    ("Conference", "conferences"), ("Reading", "conferences"), ("ArtistSigning", "conferences"),
    ("Traineeship", "ateliers"),
    ("Visit", "visites"),
    ("ShowEvent", "spectacles"), ("VisualArtsEvent", "spectacles"),
]
_CATEGORY_CLASSES = {t for t, _ in TYPE_CATEGORY}
# Not cultural outings: skipped unless a cultural class above is also present.
EXCLUDED_CLASSES = {
    "SaleEvent", "Market", "GarageSale", "BricABrac", "FairOrShow", "OpenDay",
    "BusinessEvent", "Congress", "SportsEvent", "SportsCompetition", "Rally", "Rambling",
    "Game", "ReligiousEvent",
}

_STREET_WORD_RE = re.compile(
    r"^\s*(\d|bis\b|ter\b)|\b(rue|avenue|av\.?|boulevard|bd|place|quai|all[ée]e|chemin|impasse|"
    r"passage|cours|square|parvis|sente|route|esplanade|rond-point|voie|promenade|carrefour|"
    r"b\.?p\.?|cedex)\b",
    re.I,
)


# ─────────────────────────── tolerant JSON-LD reader ───────────────────────────

def _local(key: str) -> str:
    """'rdfs:label' → 'label', 'http://schema.org/startDate' → 'startDate'."""
    return re.split(r"[#/:]", key)[-1] if key else key


def _list(v) -> list:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _get(obj, name: str) -> list:
    """All values of property `name` (any prefix) as a flat list."""
    if not isinstance(obj, dict):
        return []
    out = []
    for k, v in obj.items():
        if k == name or (not k.startswith("@") and _local(k) == name):
            out.extend(_list(v))
    return out


def _first_obj(obj, name: str) -> dict:
    for v in _get(obj, name):
        if isinstance(v, dict):
            return v
    return {}


def _texts(v, lang: str = "fr") -> List[str]:
    """Every string of a literal / list / {"@value"} / language map, `lang` first."""
    preferred, other = [], []

    def walk(x, in_lang: Optional[str] = None):
        if x is None:
            return
        if isinstance(x, (str, int, float)) and not isinstance(x, bool):
            s = str(x).strip()
            if s:
                (preferred if in_lang in (None, lang) else other).append(s)
        elif isinstance(x, list):
            for y in x:
                walk(y, in_lang)
        elif isinstance(x, dict):
            if "@value" in x:
                walk(x["@value"], x.get("@language") or in_lang)
            elif "@id" in x and len(x) <= 2:
                return  # a reference, not a literal
            else:
                for k, y in x.items():
                    # "fr" (flux) or "@fr" (API v1) language keys
                    if re.fullmatch(r"@?[a-z]{2}(-[A-Za-z]{2})?|@none", k):
                        walk(y, k.lstrip("@")[:2] if k != "@none" else None)

    walk(v)
    return preferred + other


def _text(v, lang: str = "fr") -> Optional[str]:
    t = _texts(v, lang)
    return t[0] if t else None


def _types(obj) -> set:
    out = set()
    for t in _list(obj.get("@type")) + _get(obj, "type"):
        if isinstance(t, dict):
            t = t.get("@id") or t.get("key") or t.get("uri") or ""
        if isinstance(t, str) and t:
            out.add(_local(t))
    return out


def _ref_id(v) -> str:
    if isinstance(v, dict):
        return str(v.get("@id") or v.get("key") or v.get("uri") or "")
    return str(v or "")


def _number(v) -> Optional[float]:
    t = _text(v)
    if t is None:
        return None
    try:
        return float(t.replace(",", "."))
    except ValueError:
        return None


def _urls(values: Iterable) -> List[str]:
    out = []
    for t in _texts(list(values)):
        t = t.strip()
        if t.startswith("www."):
            t = "https://" + t
        if t.startswith(("http://", "https://")):
            out.append(t)
    return out


# ─────────────────────────── field extraction ───────────────────────────

def _description(obj) -> Tuple[Optional[str], Optional[str]]:
    long_d = short_d = None
    for d in _get(obj, "hasDescription"):
        if not isinstance(d, dict):
            continue
        long_d = long_d or _text(_get(d, "description"))
        short_d = short_d or _text(_get(d, "shortDescription"))
    comment = _text(_get(obj, "comment"))
    return long_d or short_d or comment, short_d or comment


def _location(obj) -> dict:
    place = _first_obj(obj, "isLocatedAt")
    addr = _first_obj(place, "address")
    city_obj = _first_obj(addr, "hasAddressCity")
    dept_obj = _first_obj(city_obj, "isPartOfDepartment")
    geo = _first_obj(place, "geo")
    lines = _texts(_get(addr, "streetAddress"))
    street = [l for l in lines if _STREET_WORD_RE.search(l)]
    names = [l for l in lines if not _STREET_WORD_RE.search(l)]
    venue = _text(_get(place, "label")) or _text(_get(place, "name")) or (names[0] if names else None)
    lat, lng = _number(_get(geo, "latitude")), _number(_get(geo, "longitude"))
    if lat == 0 or lng == 0:
        lat = lng = None
    zip_code = _text(_get(addr, "postalCode"))
    if zip_code and not re.fullmatch(r"\d{5}", zip_code):
        m = re.search(r"\d{5}", zip_code)
        zip_code = m.group(0) if m else None
    return {
        "venue_name": venue,
        "venue_address": ", ".join(street or lines) or None,
        "venue_city": _text(_get(addr, "addressLocality")) or _text(_get(city_obj, "label")),
        "venue_zip": zip_code,
        "dept": _text(_get(dept_obj, "insee")),
        "venue_lat": lat,
        "venue_lng": lng,
    }


def zone_of(loc: dict) -> str:
    """'in' / 'out' / 'unknown' for 75/92/93/94."""
    if loc.get("venue_zip"):
        return "in" if loc["venue_zip"][:2] in ZONE_DEPARTMENTS else "out"
    if loc.get("dept"):
        return "in" if loc["dept"] in ZONE_DEPARTMENTS else "out"
    if loc.get("venue_lat") is not None and loc.get("venue_lng") is not None:
        return "in" if in_service_zone(loc["venue_lat"], loc["venue_lng"]) else "out"
    return "unknown"


def _price(obj) -> dict:
    lows, highs, free, texts = [], [], False, []
    for offer in _get(obj, "offers"):
        if not isinstance(offer, dict):
            continue
        texts += _texts(_get(offer, "textPriceSpecification"))
        for spec in _get(offer, "priceSpecification"):
            if not isinstance(spec, dict):
                continue
            for pol in _get(spec, "hasEligiblePolicy"):
                if _local(_ref_id(pol)) == "Free":
                    free = True
            lo = _number(_get(spec, "minPrice"))
            hi = _number(_get(spec, "maxPrice"))
            p = _number(_get(spec, "price"))
            for v in (lo, p):
                if v is not None:
                    lows.append(v)
            for v in (hi, p, lo):
                if v is not None:
                    highs.append(v)
                    break
    if lows or highs:
        vals = lows + highs
        if free and max(vals) == 0:
            return price_from_numbers(0, 0)
        return price_from_numbers(min(vals), max(vals))
    if free:
        return price_from_numbers(None, None, free_flag=True)
    for t in texts:
        p = parse_price_fr(t)
        if p["price_status"] != "unknown":
            return p
    return dict(UNKNOWN_PRICE)


def _image(obj) -> Optional[str]:
    for rel in ("hasMainRepresentation", "hasRepresentation"):
        for rep in _get(obj, rel):
            if not isinstance(rep, dict):
                continue
            for res in _get(rep, "hasRelatedResource"):
                urls = _urls(_get(res, "locator")) if isinstance(res, dict) else []
                if urls:
                    return urls[0]
    return None


def _homepage(obj, rel: str) -> Optional[str]:
    for c in _get(obj, rel):
        urls = _urls(_get(c, "homepage")) if isinstance(c, dict) else []
        if urls:
            return urls[0]
    return None


def _date(v) -> Optional[date]:
    t = _text(v)
    if not t:
        return None
    try:
        return date.fromisoformat(t[:10])
    except ValueError:
        return None


def _time(v) -> Optional[time]:
    t = _text(v)
    if not t:
        return None
    m = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", t)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return time(h, mi)


def _periods(obj) -> List[Tuple[Any, Any]]:
    """[(start, end)]: naive Paris-local datetimes when a time is given, else dates."""
    out = []
    for p in _get(obj, "takesPlaceAt"):
        if not isinstance(p, dict):
            continue
        sd, ed = _date(_get(p, "startDate")), _date(_get(p, "endDate"))
        st, et = _time(_get(p, "startTime")), _time(_get(p, "endTime"))
        if sd is None:
            continue
        if ed is not None and ed < sd:
            ed = None  # inconsistent source data: keep the start only
        start = datetime.combine(sd, st) if st else sd
        end = ed
        if et:
            end = datetime.combine(ed or sd, et)
            if isinstance(start, datetime) and end <= start:
                end = ed
        out.append((start, end))
    return out


def _is_placeholder_year(start, end) -> bool:
    """1 Jan → 31 Dec without times: a permanent offer filed as an 'event'."""
    return (
        not isinstance(start, datetime) and isinstance(end, date) and not isinstance(end, datetime)
        and (start.month, start.day) == (1, 1) and (end.month, end.day) == (12, 31)
    )


def _aware(v, is_end: bool) -> datetime:
    if isinstance(v, datetime):
        return v.replace(tzinfo=PARIS).astimezone(timezone.utc)
    t = time(23, 59) if is_end else time(0, 0)
    return datetime.combine(v, t, tzinfo=PARIS).astimezone(timezone.utc)


def _category(types: set) -> Optional[str]:
    for t, slug in TYPE_CATEGORY:
        if t in types:
            return slug
    return None


# ─────────────────────────── parsing (pure) ───────────────────────────

def parse_object(obj: dict, now: Optional[datetime] = None) -> List[dict]:
    """One DATAtourisme POI (JSON-LD flux file or API object) → 0..n event dicts."""
    if not isinstance(obj, dict):
        DROPS["not_dict"] += 1
        return []
    now = now or datetime.now(timezone.utc)
    types = _types(obj)
    if not types & EVENT_CLASSES:
        DROPS["not_event_class"] += 1
        return []
    if types & EXCLUDED_CLASSES and not types & _CATEGORY_CLASSES:
        DROPS["excluded_class"] += 1
        return []
    uri = obj.get("@id") or _text(_get(obj, "uri")) or _text(_get(obj, "uuid"))
    title = _text(_get(obj, "label"))
    if not uri or not title:
        DROPS["no_uri_or_title"] += 1
        return []
    loc = _location(obj)
    if zone_of(loc) != "in":
        DROPS["out_of_zone"] += 1
        return []

    periods = [(s, e) for s, e in _periods(obj) if not _is_placeholder_year(s, e)]
    future = sorted(
        ((s, e) for s, e in periods if _aware(e if e is not None else s, True) >= now),
        key=lambda p: _aware(p[0], False),
    )
    if not future:
        DROPS["no_future_date"] += 1
        return []
    if len(future) > MAX_PERIODS:
        # many dates: one event for the run (or the next date if scattered)
        occ = [(_aware(s, False), _aware(e, True) if e is not None else None) for s, e in future]
        picked = select_occurrence(occ, now=now)
        if picked is None:
            DROPS["no_pick"] += 1
            return []
        first = next(p for p in future if _aware(p[0], False) == picked[0])
        future = [(first[0], picked[1])]

    description, short = _description(obj)
    themes = [t for th in _get(obj, "hasTheme") for t in _texts(_get(th, "label") if isinstance(th, dict) else th)]
    price = _price(obj)
    booking = _homepage(obj, "hasBookingContact") or _homepage(obj, "hasContact")
    category = _category(types)
    out = []
    for start, end in future:
        if len(future) == 1:
            sid = uri
        else:
            sid = f"{uri}#{start.isoformat()}"
        ev = make_event(
            source=SOURCE,
            source_id=sid,
            title=title,
            start=start,
            end=end,
            description=description,
            short_desc=short,
            image_url=_image(obj),
            price=price,
            booking_url=booking,
            source_url=uri if str(uri).startswith("http") else None,
            venue_name=loc["venue_name"],
            venue_address=loc["venue_address"],
            venue_city=loc["venue_city"],
            venue_zip=loc["venue_zip"],
            venue_lat=loc["venue_lat"],
            venue_lng=loc["venue_lng"],
            category_slug=category,
            category_raw=", ".join(themes) or None,
            tags=themes,
        )
        out.append(ev)
    return out


# ─────────────────────────── flux ZIP (legacy Diffuseur) ───────────────────────────

def _mask(url: str) -> str:
    """Never log the keys of a webservice URL."""
    return re.sub(r"(/webservice/)[^?#]*", r"\1***", url or "")


def iter_zip_objects(zf: zipfile.ZipFile) -> Iterator[dict]:
    """Every POI object of a flux archive (JSON-LD per object, or a JSON list/graph)."""
    for info in zf.infolist():
        name = info.filename
        if info.is_dir() or not name.lower().endswith((".json", ".jsonld")):
            continue
        if name.rsplit("/", 1)[-1].lower() == "index.json":
            continue
        try:
            with zf.open(info) as fh:
                data = json.load(fh)
        except (ValueError, KeyError, zipfile.BadZipFile) as e:
            print(f"  [datatourisme] skip {name}: {type(e).__name__}")
            continue
        if isinstance(data, dict) and "@graph" in data:
            data = data["@graph"]
        for obj in _list(data):
            if isinstance(obj, dict):
                yield obj


def parse_zip(path_or_file, now: Optional[datetime] = None) -> Generator[dict, None, None]:
    seen = set()
    with zipfile.ZipFile(path_or_file) as zf:
        for obj in iter_zip_objects(zf):
            try:
                events = parse_object(obj, now=now)
            except Exception as e:  # one bad POI never kills the run
                print(f"  [datatourisme] skip {obj.get('@id')}: {type(e).__name__}: {e}")
                continue
            for ev in events:
                if ev["source_id"] not in seen:
                    seen.add(ev["source_id"])
                    yield ev


def _download(url: str, fh, timeout: float = 120.0) -> int:
    budget = current_budget()
    headers = dict(DEFAULT_HEADERS, **{"User-Agent": USER_AGENT, "Accept": "application/zip,*/*"})
    size = 0
    with httpx.stream("GET", url, headers=headers, timeout=timeout, follow_redirects=True) as r:
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} on {_mask(url)}")
        for chunk in r.iter_bytes(1 << 16):
            budget.check()
            size += len(chunk)
            if size > MAX_ZIP_BYTES:
                raise RuntimeError(f"archive larger than {MAX_ZIP_BYTES} bytes — check the flux filters")
            fh.write(chunk)
    return size


def fetch_flux(flux_url: str, now: Optional[datetime] = None) -> Generator[dict, None, None]:
    with tempfile.TemporaryFile() as tmp:
        size = _download(flux_url, tmp)
        print(f"  [datatourisme] flux {_mask(flux_url)}: {size / 1e6:.1f} MB")
        tmp.seek(0)
        n = 0
        for ev in parse_zip(tmp, now=now):
            n += 1
            yield ev
        print(f"  [datatourisme] flux: {n} events in 75/92/93/94")


# ─────────────────────────── API v1 ───────────────────────────

def api_params(today: date, with_date_filter: bool = True) -> dict:
    flt = "isLocatedAt.address.hasAddressCity.isPartOfDepartment.insee[in]=" + ",".join(ZONE_DEPARTMENTS)
    if with_date_filter:
        flt += f" AND takesPlaceAt.endDate[gte]={today.isoformat()}"
    return {"filters": flt, "fields": API_FIELDS, "lang": "fr", "page_size": str(API_PAGE_SIZE)}


def fetch_api(api_key: str, now: Optional[datetime] = None, max_pages: int = 100,
              client: Optional[PoliteClient] = None) -> Generator[dict, None, None]:
    now = now or datetime.now(timezone.utc)
    own = client is None
    client = client or PoliteClient(headers={"X-API-Key": api_key, "Accept": "application/json"})
    seen = set()
    try:
        url: Optional[str] = f"{API_BASE}/entertainmentAndEvent"
        params: Optional[dict] = api_params(now.astimezone(PARIS).date())
        pages = 0
        while url and pages < max_pages:
            resp = client.get(url, params=params)
            pages += 1
            if resp.status_code == 400 and pages == 1 and params and " AND " in params["filters"]:
                print("  [datatourisme] API refused the date filter — retrying with departments only")
                params = api_params(now.astimezone(PARIS).date(), with_date_filter=False)
                continue
            if resp.status_code != 200:
                print(f"  [datatourisme] API HTTP {resp.status_code}: {resp.text[:200]}")
                return
            data = resp.json()
            objs = data.get("objects") or []
            if pages == 1:
                print(f"  [datatourisme] page 1: {len(objs)} objects, keys={sorted(data)[:8]}, meta={ {k: v for k, v in (data.get('meta') or {}).items() if k != 'next'} }")
                if objs:
                    o = objs[0]
                    print(f"  [datatourisme] sample type={o.get('type')} keys={sorted(o)[:20]}")
                    print(f"  [datatourisme] sample takesPlaceAt={str(o.get('takesPlaceAt'))[:300]}")
                    print(f"  [datatourisme] sample isLocatedAt={str(o.get('isLocatedAt'))[:400]}")
            for obj in data.get("objects") or []:
                try:
                    events = parse_object(obj, now=now)
                except Exception as e:
                    print(f"  [datatourisme] skip {obj.get('uuid')}: {type(e).__name__}: {e}")
                    continue
                for ev in events:
                    if ev["source_id"] not in seen:
                        seen.add(ev["source_id"])
                        yield ev
            meta = data.get("meta") or {}
            nxt = meta.get("next")
            if nxt and nxt.startswith("/"):
                nxt = "https://api.datatourisme.fr" + nxt
            url, params = nxt, None  # `next` already carries every parameter
        print(f"  [datatourisme] API: {pages} pages, {len(seen)} events, dropped {dict(DROPS)}")
    finally:
        if own:
            client.close()


# ─────────────────────────── entry point ───────────────────────────

def fetch_events(flux_url: Optional[str] = None, api_key: Optional[str] = None,
                 now: Optional[datetime] = None) -> Generator[dict, None, None]:
    flux_url = flux_url or os.environ.get("DATATOURISME_FLUX_URL", "")
    api_key = api_key or os.environ.get("DATATOURISME_API_KEY", "")
    if flux_url:
        yield from fetch_flux(flux_url, now=now)
    elif api_key:
        yield from fetch_api(api_key, now=now)
    else:
        print("  [datatourisme] neither DATATOURISME_FLUX_URL nor DATATOURISME_API_KEY set — skipped")


if __name__ == "__main__":
    for i, ev in enumerate(fetch_events()):
        print(json.dumps(ev, indent=2, ensure_ascii=False))
        if i >= 2:
            break
