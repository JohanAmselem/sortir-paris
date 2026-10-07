"""
TMDB (The Movie Database) — ENRICHMENT ONLY, never an event source.

TMDB knows which films exist, not where/when they are screened in Paris. The previous
version invented 3 showtimes per film per day: that is fabricated data and is gone.

Use `enrich_film(title, year)` to fetch poster / backdrop / French overview / genres
for a film whose real screenings come from another source (allocine.py).

API: official TMDB API v3, GET /search/movie?query=…&language=fr-FR
Auth: env TMDB_API_KEY (v3 api_key query param) or TMDB_ACCESS_TOKEN (v4 bearer).
No key → enrich_film returns None.
"""

from __future__ import annotations

import os
from typing import Generator, Optional

from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import clean_text

API_BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p"

# TMDB movie genre ids (stable, documented at /genre/movie/list)
GENRE_MAP = {
    28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie",
    80: "Crime", 99: "Documentaire", 18: "Drame", 10751: "Familial",
    14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
    9648: "Mystère", 10749: "Romance", 878: "Science-Fiction",
    10770: "Téléfilm", 53: "Thriller", 10752: "Guerre", 37: "Western",
}

# Per-run cache: (normalized title, year) → result dict or None
_CACHE: dict = {}


def _credentials() -> tuple:
    return os.getenv("TMDB_API_KEY", "").strip(), os.getenv("TMDB_ACCESS_TOKEN", "").strip()


def has_credentials() -> bool:
    key, token = _credentials()
    return bool(key or token)


def _norm_title(title: str) -> str:
    return (clean_text(title) or "").casefold()


def parse_search_result(data: Optional[dict], title: str, year: Optional[int] = None) -> Optional[dict]:
    """Pick the best /search/movie result and map it to our enrichment dict (pure)."""
    if not data:
        return None
    results = [r for r in (data.get("results") or []) if isinstance(r, dict) and r.get("id")]
    if not results:
        return None

    wanted = _norm_title(title)

    def score(r: dict) -> tuple:
        names = {_norm_title(r.get("title") or ""), _norm_title(r.get("original_title") or "")}
        exact = wanted in names
        ry = (r.get("release_date") or "")[:4]
        year_ok = bool(year) and ry.isdigit() and abs(int(ry) - int(year)) <= 1
        return (exact, year_ok, r.get("popularity") or 0)

    best = max(results, key=score)
    exact, year_ok, _ = score(best)
    # Be conservative: without an exact title match (or a year match), don't attach data.
    if not exact and not year_ok:
        return None

    poster = best.get("poster_path")
    backdrop = best.get("backdrop_path")
    return {
        "tmdb_id": best["id"],
        "title": best.get("title"),
        "original_title": best.get("original_title"),
        "release_date": best.get("release_date") or None,
        "overview": clean_text(best.get("overview")) or None,
        "poster_url": f"{IMAGE_BASE}/w500{poster}" if poster else None,
        "backdrop_url": f"{IMAGE_BASE}/w780{backdrop}" if backdrop else None,
        "genres": [GENRE_MAP[g] for g in (best.get("genre_ids") or []) if g in GENRE_MAP],
    }


def enrich_film(title: str, year: Optional[int] = None, client: Optional[PoliteClient] = None) -> Optional[dict]:
    """Return {tmdb_id, poster_url, backdrop_url, overview, genres, ...} or None.

    None when no TMDB credentials are set, on API error, or when no confident match.
    Results are cached per (title, year) for the lifetime of the process (one run).
    """
    if not title:
        return None
    key, token = _credentials()
    if not (key or token):
        return None

    cache_key = (_norm_title(title), year)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    params = {"query": title, "language": "fr-FR", "include_adult": "false"}
    if year:
        params["year"] = str(year)
    headers = {"Accept": "application/json"}
    if key:
        params["api_key"] = key
    else:
        headers["Authorization"] = f"Bearer {token}"

    own = client is None
    c = client or PoliteClient(delay=0.3)
    try:
        data = c.get_json(f"{API_BASE}/search/movie", params=params, headers=headers)
        if not (data and data.get("results")) and year:
            # release year on TMDB may differ from Allociné's production year
            params.pop("year", None)
            data = c.get_json(f"{API_BASE}/search/movie", params=params, headers=headers)
    except BudgetExceeded:
        raise
    except Exception as e:  # noqa: BLE001 — enrichment must never break the caller
        print(f"  [tmdb] search failed for {title!r}: {e}")
        data = None
    finally:
        if own:
            c.close()

    result = parse_search_result(data, title, year)
    _CACHE[cache_key] = result
    return result


def fetch_events(days_ahead: int = 7, max_pages: int = 5) -> Generator[dict, None, None]:
    """Kept for run.py compatibility. TMDB has no screening data: yields nothing."""
    print("  tmdb: enrichment only, not an event source")
    return
    yield  # pragma: no cover — makes this a generator
