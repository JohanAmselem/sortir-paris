"""
Venue geocoding utility.
Uses the French government's free address API (api-adresse.data.gouv.fr).
No API key required. Accurate for French addresses.
"""

import os
import time
import httpx
import psycopg2

API_URL = "https://api-adresse.data.gouv.fr/search/"

# Paris bounding box (rough)
PARIS_LAT_MIN, PARIS_LAT_MAX = 48.80, 48.92
PARIS_LNG_MIN, PARIS_LNG_MAX = 2.20, 2.47


def geocode_address(address: str, city: str = "Paris") -> tuple[float, float] | None:
    """Geocode a French address using the government API.

    Returns (lat, lng) or None if not found / outside Paris.
    """
    if not address:
        return None

    query = f"{address}, {city}"
    try:
        resp = httpx.get(
            API_URL,
            params={"q": query, "limit": 1, "autocomplete": 0},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        features = data.get("features", [])
        if not features:
            return None

        coords = features[0]["geometry"]["coordinates"]
        lng, lat = coords[0], coords[1]  # GeoJSON: [lng, lat]

        # Validate within Paris area
        if not (PARIS_LAT_MIN <= lat <= PARIS_LAT_MAX and PARIS_LNG_MIN <= lng <= PARIS_LNG_MAX):
            return None

        return (lat, lng)

    except Exception as e:
        print(f"  [Geocode] Error for '{query}': {e}")
        return None


def geocode_missing_venues():
    """Find venues with missing lat/lng and geocode them."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("[Geocode] DATABASE_URL not set, skipping")
        return

    print("\n[Geocode] Geocoding venues with missing coordinates...")

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    # Find venues without coordinates that have an address
    cursor.execute("""
        SELECT id, name, address, city, zip_code
        FROM venues
        WHERE lat IS NULL
          AND address IS NOT NULL
          AND address != ''
        ORDER BY created_at DESC
        LIMIT 500
    """)
    venues = cursor.fetchall()

    if not venues:
        print("[Geocode] All venues already geocoded!")
        cursor.close()
        conn.close()
        return

    print(f"[Geocode] Found {len(venues)} venues to geocode")

    updated = 0
    errors = 0

    for venue_id, name, address, city, zip_code in venues:
        # Build address string
        addr_parts = [address]
        if zip_code:
            addr_parts.append(zip_code)
        city_str = city or "Paris"

        result = geocode_address(" ".join(addr_parts), city_str)

        if result:
            lat, lng = result
            cursor.execute(
                "UPDATE venues SET lat = %s, lng = %s WHERE id = %s",
                (lat, lng, venue_id),
            )
            updated += 1
        else:
            errors += 1

        # Rate limit: ~20 requests/sec
        time.sleep(0.05)

        # Commit every 50 updates
        if updated % 50 == 0 and updated > 0:
            conn.commit()

    conn.commit()
    cursor.close()
    conn.close()

    print(f"[Geocode] Done: {updated} geocoded, {errors} failed, {len(venues)} total")
