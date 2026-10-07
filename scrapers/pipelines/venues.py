"""
Venue resolution: find the canonical venue for a scraped event, or create one.

Matching order (AUDIT D10):
  1. same normalized name (unidecode, lowercase, articles/punctuation/"paris" stripped)
  2. same normalized address in the same postcode AND a compatible name
     (several distinct halls share one address, e.g. 211 av. Jean-Jaurès)
  3. < 100 m from the event's coordinates AND trigram name similarity ≥ 0.4
Existing venues are only ENRICHED (COALESCE on empty fields) — never renamed.
The canonical id (canonical_venue_id when set) is returned.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

from utils.event import stable_id
from utils.matching import haversine_m, normalize_address, normalize_venue_name, trigram_similarity
from utils.normalize import arrondissement_from_zip, generate_slug, in_idf

NAME_SIM_NEAR = 0.4
NAME_SIM_SAME_ADDRESS = 0.3
NEAR_METERS = 100


class VenueResolver:
    def __init__(self) -> None:
        self._cache: Dict[str, Tuple[str, bool]] = {}

    def resolve(self, cur, event: dict) -> Tuple[Optional[str], bool]:
        """Return (canonical venue id, is_geocoded)."""
        name = (event.get("venue_name") or "").strip()
        if not name:
            return None, False
        nn = normalize_venue_name(name)
        cache_key = f"{nn}|{event.get('venue_zip') or ''}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        lat, lng = event.get("venue_lat"), event.get("venue_lng")
        if lat is not None and lng is not None and not in_idf(lat, lng):
            lat = lng = None  # never store coordinates outside Île-de-France on a venue

        row = self._match(cur, event, nn, lat, lng)
        if row:
            venue_id, canonical_id, v_lat = row
            self._enrich(cur, venue_id, event, nn, lat, lng)
            result = (canonical_id or venue_id, v_lat is not None or lat is not None)
        else:
            result = (self._create(cur, event, name, nn, lat, lng), lat is not None)
        self._cache[cache_key] = result
        return result

    # ── matching ──
    def _match(self, cur, event, nn, lat, lng):
        cur.execute(
            """
            SELECT id, canonical_venue_id, lat FROM venues
            WHERE normalized_name = %s
               OR (normalized_name IS NULL AND lower(name) = lower(%s))
            ORDER BY canonical_venue_id NULLS FIRST, (lat IS NULL), created_at
            LIMIT 1
            """,
            (nn, event.get("venue_name")),
        )
        row = cur.fetchone()
        if row:
            return row

        addr = event.get("venue_address")
        zip_code = event.get("venue_zip")
        if addr and zip_code:
            na = normalize_address(addr)
            if na:
                cur.execute(
                    "SELECT id, canonical_venue_id, lat, name, address FROM venues WHERE zip_code = %s LIMIT 500",
                    (zip_code,),
                )
                for vid, cvid, vlat, vname, vaddr in cur.fetchall():
                    if normalize_address(vaddr) != na:
                        continue
                    vn = normalize_venue_name(vname)
                    if nn in vn or vn in nn or trigram_similarity(nn, vn) >= NAME_SIM_SAME_ADDRESS:
                        return vid, cvid, vlat

        if lat is not None and lng is not None:
            cur.execute(
                """
                SELECT id, canonical_venue_id, lat, lng, name FROM venues
                WHERE lat BETWEEN %s AND %s AND lng BETWEEN %s AND %s
                LIMIT 200
                """,
                (float(lat) - 0.001, float(lat) + 0.001, float(lng) - 0.0015, float(lng) + 0.0015),
            )
            best = None
            for vid, cvid, vlat, vlng, vname in cur.fetchall():
                if haversine_m(lat, lng, vlat, vlng) > NEAR_METERS:
                    continue
                sim = trigram_similarity(nn, normalize_venue_name(vname))
                if sim >= NAME_SIM_NEAR and (best is None or sim > best[0]):
                    best = (sim, vid, cvid, vlat)
            if best:
                return best[1], best[2], best[3]
        return None

    # ── writes ──
    def _enrich(self, cur, venue_id, event, nn, lat, lng) -> None:
        zip_code = event.get("venue_zip")
        cur.execute(
            """
            UPDATE venues SET
                normalized_name = COALESCE(normalized_name, %(nn)s),
                address = COALESCE(NULLIF(address, ''), %(address)s),
                zip_code = COALESCE(zip_code, %(zip)s),
                arrondissement = COALESCE(arrondissement, %(arr)s),
                website = COALESCE(website, %(website)s),
                geocode_status = CASE WHEN lat IS NULL AND %(lat)s::float8 IS NOT NULL
                                      THEN 'ok' ELSE geocode_status END,
                lng = CASE WHEN lat IS NULL AND %(lat)s::float8 IS NOT NULL THEN %(lng)s ELSE lng END,
                lat = CASE WHEN lat IS NULL AND %(lat)s::float8 IS NOT NULL THEN %(lat)s ELSE lat END
            WHERE id = %(id)s
            """,
            {
                "nn": nn,
                "address": event.get("venue_address"),
                "zip": zip_code,
                "arr": arrondissement_from_zip(zip_code),
                "website": event.get("venue_website"),
                "lat": lat,
                "lng": lng,
                "id": venue_id,
            },
        )

    def _create(self, cur, event, name, nn, lat, lng) -> str:
        zip_code = event.get("venue_zip")
        base_slug = generate_slug(name)
        params = {
            "name": name,
            "address": event.get("venue_address"),
            "city": event.get("venue_city") or ("Paris" if (zip_code or "").startswith("75") else None),
            "zip": zip_code,
            "arr": arrondissement_from_zip(zip_code),
            "lat": lat,
            "lng": lng,
            "website": event.get("venue_website"),
            "nn": nn,
            "geo_status": "ok" if lat is not None else "pending",
        }
        for slug in (base_slug, f"{base_slug}-{zip_code}" if zip_code else None,
                     f"{base_slug}-{stable_id(name, event.get('venue_address'))[:6]}"):
            if not slug:
                continue
            params["slug"] = slug
            cur.execute(
                """
                INSERT INTO venues (name, slug, address, city, zip_code, arrondissement,
                                    lat, lng, website, normalized_name, geocode_status)
                VALUES (%(name)s, %(slug)s, %(address)s, COALESCE(%(city)s, 'Paris'), %(zip)s, %(arr)s,
                        %(lat)s, %(lng)s, %(website)s, %(nn)s, %(geo_status)s)
                ON CONFLICT (slug) DO NOTHING
                RETURNING id
                """,
                params,
            )
            row = cur.fetchone()
            if row:
                return row[0]
        raise RuntimeError(f"could not create venue '{name}' (slug conflicts)")
