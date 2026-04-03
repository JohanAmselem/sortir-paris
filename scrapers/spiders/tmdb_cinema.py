"""
TMDB (The Movie Database) scraper — Films currently in Paris cinemas.
Source: https://api.themoviedb.org/3

Uses the free TMDB API to get all movies currently showing in French cinemas,
with high-quality metadata (posters, synopses, ratings, genres).
Creates one event per film per day for the next 7 days.

API Key: Free — register at https://www.themoviedb.org/settings/api
"""

import httpx
import time
from datetime import datetime, timedelta
from typing import Generator, Optional
import os

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    compute_quality_score,
)

API_BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p"

# Genre ID → name mapping (TMDB genre IDs)
GENRE_MAP = {
    28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie",
    80: "Crime", 99: "Documentaire", 18: "Drame", 10751: "Famille",
    14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
    9648: "Mystère", 10749: "Romance", 878: "Science-Fiction",
    10770: "Téléfilm", 53: "Thriller", 10752: "Guerre", 37: "Western",
}

HEADERS = {
    "User-Agent": "SortirParis/1.0 (+https://sortir.paris)",
    "Accept": "application/json",
}


def fetch_events(
    days_ahead: int = 7,
    max_pages: int = 5,
) -> Generator[dict, None, None]:
    """Fetch currently showing movies from TMDB.

    Creates one event per film per day for the next `days_ahead` days.
    Requires TMDB_API_KEY environment variable.
    """
    api_key = os.getenv("TMDB_API_KEY", "")
    if not api_key:
        # Try using the API with a read access token
        api_token = os.getenv("TMDB_ACCESS_TOKEN", "")
        if not api_token:
            print("  TMDB: No API key set (TMDB_API_KEY or TMDB_ACCESS_TOKEN). Skipping.")
            return

    client = httpx.Client(headers=HEADERS, timeout=15, follow_redirects=True)
    seen = set()
    all_movies = []

    # Fetch all pages of now_playing
    for page in range(1, max_pages + 1):
        try:
            params = {
                "api_key": api_key,
                "language": "fr-FR",
                "region": "FR",
                "page": page,
            }

            # Now playing in France
            resp = client.get(f"{API_BASE}/movie/now_playing", params=params)
            if resp.status_code == 401:
                print("  TMDB: Invalid API key")
                break
            if resp.status_code != 200:
                break

            data = resp.json()
            movies = data.get("results", [])
            if not movies:
                break

            all_movies.extend(movies)
            total_pages = data.get("total_pages", 1)
            if page >= total_pages:
                break

            time.sleep(0.3)

        except Exception as e:
            print(f"  TMDB page {page} error: {e}")
            break

    # Also fetch upcoming movies
    for page in range(1, 3):
        try:
            params = {
                "api_key": api_key,
                "language": "fr-FR",
                "region": "FR",
                "page": page,
            }
            resp = client.get(f"{API_BASE}/movie/upcoming", params=params)
            if resp.status_code == 200:
                movies = resp.json().get("results", [])
                all_movies.extend(movies)
            time.sleep(0.3)
        except Exception:
            break

    print(f"  TMDB: Found {len(all_movies)} movies")

    # Deduplicate by movie ID
    unique_movies = {}
    for movie in all_movies:
        mid = movie.get("id")
        if mid and mid not in unique_movies:
            unique_movies[mid] = movie

    # Generate events — one per film per day
    for movie_id, movie in unique_movies.items():
        title = movie.get("title", "")
        original_title = movie.get("original_title", "")
        if not title:
            continue

        # Full title with original if different
        full_title = title
        if original_title and original_title != title:
            full_title = f"{title} ({original_title})"

        overview = movie.get("overview", "")
        poster_path = movie.get("poster_path")
        backdrop_path = movie.get("backdrop_path")
        release_date = movie.get("release_date", "")
        vote_avg = movie.get("vote_average", 0)
        vote_count = movie.get("vote_count", 0)
        genre_ids = movie.get("genre_ids", [])

        # Best image: prefer backdrop for events (landscape), fallback to poster
        image_url = None
        if backdrop_path:
            image_url = f"{IMAGE_BASE}/w780{backdrop_path}"
        elif poster_path:
            image_url = f"{IMAGE_BASE}/w500{poster_path}"

        # Genres
        genres = [GENRE_MAP.get(gid, "") for gid in genre_ids if gid in GENRE_MAP]
        genre_text = ", ".join(genres) if genres else "Film"

        # Description
        desc_parts = []
        if overview:
            desc_parts.append(overview)
        if genres:
            desc_parts.append(f"Genre : {genre_text}")
        if vote_avg and vote_count > 10:
            desc_parts.append(f"Note : {vote_avg:.1f}/10 ({vote_count} votes)")
        description = "\n".join(desc_parts)

        short_desc = truncate(overview) if overview else f"{genre_text} — En salle à Paris"

        # TMDB page URL
        source_url = f"https://www.themoviedb.org/movie/{movie_id}"

        # Create one event per day
        for day_offset in range(days_ahead):
            date = datetime.now() + timedelta(days=day_offset)
            date_str = date.strftime("%Y-%m-%d")

            # Multiple showtimes per day
            for showtime in ["14:00", "17:00", "20:00"]:
                start_iso = f"{date_str}T{showtime}:00"
                slug = generate_slug(title, start_iso)

                if slug in seen:
                    continue
                seen.add(slug)

                yield {
                    "title": full_title,
                    "slug": slug,
                    "description": description,
                    "short_desc": short_desc,
                    "start_date": start_iso,
                    "end_date": None,
                    "image_url": image_url,
                    "price_min": 800,   # ~8€ minimum for cinema
                    "price_max": 1500,  # ~15€ maximum
                    "is_free": False,
                    "booking_url": None,  # No specific booking link — users go to their preferred cinema
                    "source": "tmdb",
                    "source_id": f"tmdb-{movie_id}-{date_str}-{showtime.replace(':', '')}",
                    "source_url": source_url,
                    "venue_name": "Cinémas de Paris",
                    "venue_address": "",
                    "venue_city": "Paris",
                    "venue_zip": None,
                    "venue_arrondissement": None,
                    "category_slug": "cinema",
                    "tags": ["cinema", "film"] + [g.lower() for g in genres[:3]],
                    "quality_score": compute_quality_score(
                        full_title, description, image_url, start_iso, "8€ - 15€", source_url
                    ),
                }

    client.close()
