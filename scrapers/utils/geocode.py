"""
Venue geocoding.

1. Address → BAN (api-adresse.data.gouv.fr, free, no key). AUDIT D9: municipality-level
   answers put 97 venues on the Paris centroid, so:
   - accept only score ≥ 0.6 and type in (housenumber, street, locality),
   - result must be in Île-de-France (bbox + postcode 75/77/78/91/92/93/94/95).
2. No address (theatreonline, Châtelet halls…) or no BAN answer → the venue NAME:
   a. BAN "name + city", accepted only when the street/locality found is named in the
      venue name ("Place du Châtelet"), never "Passage du Théâtre" for "Théâtre 71";
   b. OpenStreetMap Nominatim POI search (usage policy: ≤ 1 req/s, identified UA,
      capped per run), accepted only when the place's name matches the venue name, its
      class is a venue-like one, it lies in the service zone (75/92/93/94) and its postcode
      does not contradict the venue's.
Writes lat/lng + postcode + city (never forced to "Paris") + arrondissement, records
geocode_status ('ok' | 'failed') and geocode_attempts. Venues with live events are tried
first and get more attempts; aliases (canonical_venue_id set) are skipped.
"""

from __future__ import annotations

import os
import re
from typing import List, Optional

from utils.normalize import (
    IDF_DEPARTMENTS,
    SERVICE_DEPARTMENTS,
    arrondissement_from_zip,
    in_idf,
    in_service_zone,
    normalize_zip,
)

API_URL = "https://api-adresse.data.gouv.fr/search/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
MIN_SCORE = 0.6
NAME_MIN_SCORE = 0.5
ACCEPTED_TYPES = {"housenumber", "street", "locality"}
MAX_ATTEMPTS = 3
MAX_ATTEMPTS_LIVE = 6  # venues with live events: the name-based strategies came later
NOMINATIM_MAX_PER_RUN = 150
SERVICE_VIEWBOX = "2.14,49.01,2.64,48.70"  # lng_min, lat_max, lng_max, lat_min (Nominatim order)

# OSM classes / types that can be an event venue (not a street, a town, a bus stop…)
POI_CLASSES = {"amenity", "leisure", "tourism", "building", "historic", "club", "shop", "office"}
POI_REJECTED_TYPES = {"parking", "bus_stop", "parking_entrance", "bicycle_parking", "atm", "bench",
                      "post_box", "waste_basket", "toilets", "fuel", "charging_station"}


def _feature(lat, lng, postcode, city, score, type_, source="ban") -> dict:
    postcode = normalize_zip(postcode)
    return {
        "lat": float(lat),
        "lng": float(lng),
        "postcode": postcode,
        "city": city,
        "arrondissement": arrondissement_from_zip(postcode),
        "score": score,
        "type": type_,
        "source": source,
    }


def pick_feature(data: dict, venue_name: Optional[str] = None) -> Optional[dict]:
    """Pure: choose an acceptable BAN feature or None.

    venue_name set = the query was the venue's NAME (no address): the street/locality
    found must be named in the venue name, and the point must be in the service zone."""
    from utils.matching import _fold

    for feat in (data or {}).get("features", []):
        props = feat.get("properties", {})
        min_score = NAME_MIN_SCORE if venue_name else MIN_SCORE
        if props.get("score", 0) < min_score or props.get("type") not in ACCEPTED_TYPES:
            continue
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) != 2:
            continue
        lng, lat = coords
        postcode = str(props.get("postcode") or "")
        if not in_idf(lat, lng) or postcode[:2] not in IDF_DEPARTMENTS:
            continue
        if venue_name:
            street = _fold(props.get("street") or props.get("name"))
            if not street or len(street) < 5 or street not in _fold(venue_name):
                continue  # "Passage du Théâtre" is not "Théâtre 71"
            if not in_service_zone(lat, lng) or postcode[:2] not in SERVICE_DEPARTMENTS:
                continue
        return _feature(lat, lng, postcode, props.get("city"), props.get("score"), props.get("type"))
    return None


def pick_poi(results, venue_name: str, zip_code: Optional[str] = None) -> Optional[dict]:
    """Pure: choose an acceptable Nominatim result (jsonv2 + addressdetails) or None."""
    from utils.matching import venue_key, venue_names_compatible

    zip_code = normalize_zip(zip_code)
    for r in results or []:
        if not isinstance(r, dict):
            continue
        cls, typ = r.get("category") or r.get("class"), r.get("type")
        if cls not in POI_CLASSES or typ in POI_REJECTED_TYPES:
            continue
        name = r.get("name") or ""
        if not name or not (venue_key(name) == venue_key(venue_name)
                            or venue_names_compatible(name, venue_name)):
            continue
        try:
            lat, lng = float(r.get("lat")), float(r.get("lon"))
        except (TypeError, ValueError):
            continue
        addr = r.get("address") or {}
        postcode = normalize_zip(addr.get("postcode"))
        if not in_service_zone(lat, lng):
            continue
        if postcode and postcode[:2] not in SERVICE_DEPARTMENTS:
            continue
        if zip_code and postcode and zip_code != postcode:
            continue
        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
        return _feature(lat, lng, postcode, city, r.get("importance"), f"poi:{cls}/{typ}", source="osm")
    return None


def geocode_address(address: str, zip_code: Optional[str] = None, city: Optional[str] = None,
                    client=None) -> Optional[dict]:
    if not address:
        return None
    from utils.http import PoliteClient

    zip_code = normalize_zip(zip_code)
    q = " ".join(p for p in (address, zip_code, city) if p)
    params = {"q": q, "limit": 3, "autocomplete": 0}
    if zip_code:
        params["postcode"] = zip_code
    own = client is None
    client = client or PoliteClient(delay=0.1)  # BAN allows 50 req/s/IP; stay far below
    try:
        data = client.get_json(API_URL, params=params)
    finally:
        if own:
            client.close()
    return pick_feature(data)


def geocode_name_ban(name: str, zip_code: Optional[str], city: Optional[str], client) -> Optional[dict]:
    zip_code = normalize_zip(zip_code)
    q = " ".join(p for p in (name, zip_code, city) if p)
    params = {"q": q[:200], "limit": 5, "autocomplete": 0}
    if zip_code:
        params["postcode"] = zip_code
    return pick_feature(client.get_json(API_URL, params=params), venue_name=name)


def geocode_name_osm(name: str, zip_code: Optional[str], city: Optional[str], client) -> Optional[dict]:
    zip_code = normalize_zip(zip_code)
    q = ", ".join(p for p in (name, zip_code, city or ("Paris" if not zip_code else None)) if p)
    params = {"q": q[:200], "format": "jsonv2", "addressdetails": 1, "limit": 5,
              "countrycodes": "fr", "viewbox": SERVICE_VIEWBOX, "bounded": 1}
    return pick_poi(client.get_json(NOMINATIM_URL, params=params), name, zip_code)


def candidate_cities(city: Optional[str], zip_code: Optional[str]) -> Optional[str]:
    """Venue city as stored (often defaulted to 'Paris'); '' / placeholders → None."""
    c = (city or "").strip()
    if not c or re.search(r"\d|venir|valide", c, re.I):
        return None
    return c


VENUES_TO_GEOCODE_SQL = """
SELECT v.id, v.name, v.address, v.zip_code, v.city, coalesce(n.live, 0) AS live
FROM venues v
LEFT JOIN (SELECT venue_id, count(*) AS live FROM events
           WHERE status IN ('active', 'draft')
             AND coalesce(end_date, start_date) >= now() - interval '6 hours'
           GROUP BY venue_id) n ON n.venue_id = v.id
WHERE v.lat IS NULL
  AND v.canonical_venue_id IS NULL
  AND v.geocode_status IN ('pending', 'failed')
  AND v.geocode_attempts < CASE WHEN coalesce(n.live, 0) > 0 THEN %(max_live)s ELSE %(max)s END
  AND (coalesce(v.address, '') <> '' OR coalesce(n.live, 0) > 0)
ORDER BY coalesce(n.live, 0) DESC, v.geocode_attempts, v.created_at DESC
LIMIT %(limit)s
"""

OK_SQL = """
UPDATE venues SET lat = %(lat)s, lng = %(lng)s,
    zip_code = COALESCE(%(postcode)s, zip_code),
    city = COALESCE(%(city)s, city),
    arrondissement = COALESCE(%(arrondissement)s, arrondissement),
    geocode_status = 'ok', geocode_attempts = geocode_attempts + 1
WHERE id = %(id)s AND lat IS NULL
"""

FAILED_SQL = """UPDATE venues SET geocode_status = 'failed', geocode_attempts = geocode_attempts + 1
WHERE id = %(id)s"""


def geocode_venue(venue: dict, ban, osm, osm_budget: List[int]) -> Optional[dict]:
    """Address first, then the name (BAN street named in the venue name, then OSM POI)."""
    name, address = venue.get("name") or "", venue.get("address")
    zip_code, city = normalize_zip(venue.get("zip_code")), candidate_cities(venue.get("city"), venue.get("zip_code"))
    res = None
    if address and len(address.strip()) > 3:
        res = geocode_address(address, zip_code, city, client=ban)
    if res is None and name:
        res = geocode_name_ban(name, zip_code, city, ban)
    if res is None and name and osm is not None and osm_budget[0] > 0:
        osm_budget[0] -= 1
        res = geocode_name_osm(name, zip_code, city, osm)
    return res


def geocode_missing_venues(conn=None, limit: int = 500) -> dict:
    """Geocode venues without coordinates (live-event venues first)."""
    from pipelines.ingest import _exec_many
    from utils.http import PoliteClient

    own = conn is None
    if own:
        if not os.getenv("DATABASE_URL"):
            print("[Geocode] DATABASE_URL not set, skipping")
            return {"ok": 0, "failed": 0}
        from pipelines.ingest import get_db_connection

        conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(VENUES_TO_GEOCODE_SQL, {"max": MAX_ATTEMPTS, "max_live": MAX_ATTEMPTS_LIVE, "limit": limit})
    cols = [d[0] for d in cur.description]
    venues = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"\n[Geocode] {len(venues)} venues to geocode "
          f"({sum(1 for v in venues if v['live'])} with live events)")
    ok = failed = 0
    by_source = {"ban": 0, "osm": 0}
    pending_ok, pending_failed = [], []
    ban = PoliteClient(delay=0.1)
    osm = PoliteClient(delay=1.1)  # Nominatim usage policy: max 1 request per second
    osm_budget = [NOMINATIM_MAX_PER_RUN]

    def flush():
        _exec_many(cur, OK_SQL, pending_ok)
        _exec_many(cur, FAILED_SQL, pending_failed)
        conn.commit()
        pending_ok.clear()
        pending_failed.clear()

    try:
        for v in venues:
            try:
                res = geocode_venue(v, ban, osm, osm_budget)
            except Exception as e:
                if type(e).__name__ == "BudgetExceeded":
                    raise
                print(f"  [Geocode] {v['name']}: {e}")
                res = None
            if res:
                pending_ok.append(dict(res, id=v["id"]))
                by_source[res["source"]] += 1
                ok += 1
            else:
                pending_failed.append({"id": v["id"]})
                failed += 1
            if len(pending_ok) + len(pending_failed) >= 50:
                flush()
    finally:
        flush()
        ban.close()
        osm.close()
    # Arrondissement for venues that already have a Paris postcode
    cur.execute(
        """
        UPDATE venues SET arrondissement = CASE
            WHEN substring(zip_code from 4 for 2)::int = 1 THEN '1er'
            ELSE (substring(zip_code from 4 for 2)::int)::text || 'e' END
        WHERE arrondissement IS NULL AND zip_code ~ '^75(0(0[1-9]|1[0-9]|20)|116)$'
        """
    )
    conn.commit()
    cur.close()
    if own:
        conn.close()
    print(f"[Geocode] done: {ok} ok ({by_source}), {failed} failed")
    return {"ok": ok, "failed": failed}
