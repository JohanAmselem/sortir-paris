"""
Venue geocoding with the French government address API (BAN, api-adresse.data.gouv.fr).
Free, no key. AUDIT D9: municipality-level answers put 97 venues on the Paris centroid.

Rules:
- accept only score ≥ 0.6 and type in (housenumber, street, locality)
- result must be in Île-de-France (bbox + postcode 75/77/78/91/92/93/94/95)
- write lat/lng + postcode + city (never forced to "Paris") + arrondissement
- record geocode_status ('ok' | 'failed') and geocode_attempts; skip venues with ≥ 3 attempts
"""

from __future__ import annotations

import os
import time
from typing import Optional

from utils.normalize import IDF_DEPARTMENTS, arrondissement_from_zip, in_idf

API_URL = "https://api-adresse.data.gouv.fr/search/"
MIN_SCORE = 0.6
ACCEPTED_TYPES = {"housenumber", "street", "locality"}
MAX_ATTEMPTS = 3


def pick_feature(data: dict) -> Optional[dict]:
    """Pure: choose an acceptable BAN feature or None."""
    for feat in (data or {}).get("features", []):
        props = feat.get("properties", {})
        if props.get("score", 0) < MIN_SCORE or props.get("type") not in ACCEPTED_TYPES:
            continue
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) != 2:
            continue
        lng, lat = coords
        postcode = str(props.get("postcode") or "")
        if not in_idf(lat, lng) or postcode[:2] not in IDF_DEPARTMENTS:
            continue
        return {
            "lat": float(lat),
            "lng": float(lng),
            "postcode": postcode or None,
            "city": props.get("city"),
            "arrondissement": arrondissement_from_zip(postcode),
            "score": props.get("score"),
            "type": props.get("type"),
        }
    return None


def geocode_address(address: str, zip_code: Optional[str] = None, city: Optional[str] = None,
                    client=None) -> Optional[dict]:
    if not address:
        return None
    from utils.http import PoliteClient

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


def geocode_missing_venues(conn=None, limit: int = 500) -> dict:
    """Geocode venues without coordinates (pending/failed with < 3 attempts)."""
    from utils.http import PoliteClient

    own = conn is None
    if own:
        if not os.getenv("DATABASE_URL"):
            print("[Geocode] DATABASE_URL not set, skipping")
            return {"ok": 0, "failed": 0}
        from pipelines.ingest import get_db_connection

        conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, name, address, zip_code, city FROM venues
        WHERE lat IS NULL
          AND geocode_status IN ('pending', 'failed')
          AND geocode_attempts < %s
          AND coalesce(address, '') <> ''
        ORDER BY geocode_attempts, created_at DESC
        LIMIT %s
        """,
        (MAX_ATTEMPTS, limit),
    )
    venues = cur.fetchall()
    print(f"\n[Geocode] {len(venues)} venues to geocode")
    ok = failed = 0
    client = PoliteClient(delay=0.1)
    try:
        for venue_id, name, address, zip_code, city in venues:
            try:
                res = geocode_address(address, zip_code, city, client=client)
            except Exception as e:
                print(f"  [Geocode] {name}: {e}")
                res = None
            if res:
                cur.execute(
                    """
                    UPDATE venues SET lat = %s, lng = %s,
                        zip_code = COALESCE(%s, zip_code),
                        city = COALESCE(%s, city),
                        arrondissement = COALESCE(%s, arrondissement),
                        geocode_status = 'ok', geocode_attempts = geocode_attempts + 1
                    WHERE id = %s
                    """,
                    (res["lat"], res["lng"], res["postcode"], res["city"], res["arrondissement"], venue_id),
                )
                ok += 1
            else:
                cur.execute(
                    """UPDATE venues SET geocode_status = 'failed', geocode_attempts = geocode_attempts + 1
                       WHERE id = %s""",
                    (venue_id,),
                )
                failed += 1
            if (ok + failed) % 50 == 0:
                conn.commit()
    finally:
        client.close()
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
    print(f"[Geocode] done: {ok} ok, {failed} failed")
    return {"ok": ok, "failed": failed}
