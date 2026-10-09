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
    """Resolves venues against an in-memory index loaded once (one query), so a source
    with thousands of events does not pay several round trips per event."""

    def __init__(self, cur=None) -> None:
        self._cache: Dict[str, Tuple[str, bool]] = {}
        self._rows: Dict[str, dict] = {}
        self._by_nn: Dict[str, str] = {}
        self._by_zip: Dict[str, list] = {}
        self._grid: Dict[Tuple[int, int], list] = {}
        self._unsaved: list = []
        if cur is not None:
            self._load(cur)

    # ── index ──
    def _load(self, cur) -> None:
        cur.execute(
            """
            SELECT id, canonical_venue_id, lat, lng, name, normalized_name, address, zip_code,
                   website, arrondissement
            FROM venues
            ORDER BY canonical_venue_id NULLS FIRST, (lat IS NULL), created_at
            """
        )
        for row in cur.fetchall() or []:
            if len(row) < 10:
                continue
            vid, cvid, lat, lng, name, nn, address, zip_code, website, arr = row
            self._add({"id": vid, "canonical_venue_id": cvid, "lat": lat, "lng": lng, "name": name,
                       "normalized_name": nn or normalize_venue_name(name or ""), "address": address,
                       "zip_code": zip_code, "website": website, "arrondissement": arr})

    @staticmethod
    def _cell(lat, lng) -> Tuple[int, int]:
        return int(float(lat) * 1000), int(float(lng) * 1000)

    def _add(self, v: dict) -> None:
        self._rows[v["id"]] = v
        if v["normalized_name"]:
            self._by_nn.setdefault(v["normalized_name"], v["id"])  # first = preferred (ORDER BY)
        if v.get("zip_code"):
            self._by_zip.setdefault(v["zip_code"], []).append(v["id"])
        if v.get("lat") is not None and v.get("lng") is not None:
            self._grid.setdefault(self._cell(v["lat"], v["lng"]), []).append(v["id"])

    def forget_unsaved(self) -> None:
        """The savepoint that created these venues was rolled back."""
        for vid in self._unsaved:
            v = self._rows.pop(vid, None)
            if v and self._by_nn.get(v["normalized_name"]) == vid:
                del self._by_nn[v["normalized_name"]]
        self._unsaved = []
        self._cache.clear()

    def saved(self) -> None:
        self._unsaved = []

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

        vid = self._match(event, nn, lat, lng)
        if vid:
            v = self._rows[vid]
            self._enrich(cur, vid, event, nn, lat, lng)
            result = (v["canonical_venue_id"] or vid, v["lat"] is not None or lat is not None)
        else:
            new_id = self._create(cur, event, name, nn, lat, lng)
            self._add({"id": new_id, "canonical_venue_id": None, "lat": lat, "lng": lng, "name": name,
                       "normalized_name": nn, "address": event.get("venue_address"),
                       "zip_code": event.get("venue_zip"), "website": event.get("venue_website"),
                       "arrondissement": arrondissement_from_zip(event.get("venue_zip"))})
            self._unsaved.append(new_id)
            result = (new_id, lat is not None)
        self._cache[cache_key] = result
        return result

    # ── matching (in memory) ──
    def _match(self, event, nn, lat, lng) -> Optional[str]:
        vid = self._by_nn.get(nn)
        if vid:
            return vid

        addr = event.get("venue_address")
        zip_code = event.get("venue_zip")
        if addr and zip_code:
            na = normalize_address(addr)
            if na:
                for cand in self._by_zip.get(zip_code, []):
                    v = self._rows.get(cand)
                    if not v or normalize_address(v["address"]) != na:
                        continue
                    vn = v["normalized_name"]
                    if nn in vn or vn in nn or trigram_similarity(nn, vn) >= NAME_SIM_SAME_ADDRESS:
                        return cand

        if lat is not None and lng is not None:
            cx, cy = self._cell(lat, lng)
            best = None
            for dx in (-1, 0, 1):
                for dy in (-2, -1, 0, 1, 2):
                    for cand in self._grid.get((cx + dx, cy + dy), []):
                        v = self._rows.get(cand)
                        if not v or haversine_m(lat, lng, v["lat"], v["lng"]) > NEAR_METERS:
                            continue
                        sim = trigram_similarity(nn, v["normalized_name"])
                        if sim >= NAME_SIM_NEAR and (best is None or sim > best[0]):
                            best = (sim, cand)
            if best:
                return best[1]
        return None

    # ── writes ──
    def _enrich(self, cur, venue_id, event, nn, lat, lng) -> None:
        zip_code = event.get("venue_zip")
        v = self._rows.get(venue_id)
        if v is not None:
            fills = {
                "address": (not v.get("address")) and event.get("venue_address"),
                "zip_code": (not v.get("zip_code")) and zip_code,
                "website": (not v.get("website")) and event.get("venue_website"),
                "geo": v.get("lat") is None and lat is not None,
            }
            if not any(fills.values()):
                return  # nothing to fill: no round trip
            if fills["address"]:
                v["address"] = event.get("venue_address")
            if fills["zip_code"]:
                v["zip_code"] = zip_code
            if fills["website"]:
                v["website"] = event.get("venue_website")
            if fills["geo"]:
                v["lat"], v["lng"] = lat, lng
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
