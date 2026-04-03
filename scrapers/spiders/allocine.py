"""
Allociné scraper — ALL cinema showtimes in Paris.
Source: https://www.allocine.fr

Scrapes cinema listing pages to get ALL showtimes across Paris cinemas.
This is the single highest-volume source: thousands of screenings per day.
"""

import httpx
import re
import json
import time
from datetime import datetime, timedelta
from typing import Generator, Optional
from bs4 import BeautifulSoup

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    detect_category,
    compute_quality_score,
)

# Major Paris cinemas — Allociné theater codes
# Covers UGC, Pathé, MK2, independents, art et essai
PARIS_CINEMAS = {
    # UGC
    "C0159": "UGC Ciné Cité Les Halles",
    "C0026": "UGC Ciné Cité Bercy",
    "C0073": "UGC Gobelins",
    "C0071": "UGC Odéon",
    "C0070": "UGC Danton",
    "C0020": "UGC George V",
    "C0072": "UGC Rotonde",
    "C0024": "UGC Normandie",
    "C2954": "UGC Ciné Cité La Défense",
    # Pathé Gaumont
    "C0076": "Pathé Beaugrenelle",
    "C0050": "Pathé Wepler",
    "C2953": "Pathé La Villette",
    "C0089": "Pathé Parnasse",
    "C0074": "Pathé Convention",
    "C0019": "Pathé Opéra Premier",
    # MK2
    "C0104": "MK2 Bibliothèque",
    "C0099": "MK2 Quai de Seine",
    "C0100": "MK2 Quai de Loire",
    "C0098": "MK2 Beaubourg",
    "C2955": "MK2 Nation",
    "C0095": "MK2 Odéon (côté St Germain)",
    "C0096": "MK2 Odéon (côté St Michel)",
    "C0184": "MK2 Gambetta",
    "C0094": "MK2 Bastille",
    # Grands cinémas
    "C0015": "Le Grand Rex",
    "C0021": "Le Champo",
    "C0022": "Le Balzac",
    "C0028": "La Filmothèque du Quartier Latin",
    "C0054": "Le Louxor Palais du Cinéma",
    "C0044": "Studio 28",
    "C0039": "L'Arlequin",
    "C0042": "Cinéma du Panthéon",
    "C0034": "Saint-André des Arts",
    "C0035": "Reflet Médicis",
    "C0036": "Lucernaire",
    "C0080": "Max Linder Panorama",
    "C0038": "L'Entrepôt",
    "C0043": "La Pagode",
    "C0045": "Le Brady",
    "C0046": "Épée de Bois",
    "C0048": "Christine Cinéma Club",
    "C0051": "Action Christine",
    "C0025": "Luminor Hôtel de Ville",
    "C0013": "Cinéma Les 3 Luxembourg",
    "C0014": "Cinéma Les 5 Caumartin",
    "C0079": "Cinéma Les 7 Batignolles",
    "C0052": "Nouvel Odéon",
    "C0088": "Le Lincoln",
    "C0083": "Publicis Cinémas",
    # Art et Essai
    "C0076": "Le Desperado",
    "C0047": "MK2 Parnasse",
    "C0023": "Studio Galande",
    "C0027": "Cinéma La Clef",
    "C0037": "Fondation Jérôme Seydoux-Pathé",
    "C0085": "Cinémathèque Française",
    "C0040": "Forum des Images",
    "C0041": "Centre Pompidou",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

DAYS_FR = {
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3,
    "vendredi": 4, "samedi": 5, "dimanche": 6,
}

MONTHS_FR = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5,
    "juin": 6, "juillet": 7, "août": 8, "septembre": 9,
    "octobre": 10, "novembre": 11, "décembre": 12,
}


def _parse_french_date(text: str) -> Optional[str]:
    """Parse 'mercredi 9 avril 2026' → ISO date string."""
    text = text.lower().strip()
    m = re.search(r'(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*(\d{4})?', text)
    if m:
        day = int(m.group(1))
        month = MONTHS_FR.get(m.group(2), 1)
        year = int(m.group(3)) if m.group(3) else datetime.now().year
        return f"{year}-{month:02d}-{day:02d}"
    return None


def _parse_showtime(time_str: str) -> Optional[str]:
    """Parse '20:30' or '20h30' → 'HH:MM'."""
    time_str = time_str.strip().replace("h", ":").replace("H", ":")
    m = re.match(r'(\d{1,2}):(\d{2})', time_str)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    m = re.match(r'(\d{1,2}):?$', time_str)
    if m:
        return f"{int(m.group(1)):02d}:00"
    return None


def _extract_cinema_arrondissement(cinema_name: str, address: str = "") -> Optional[str]:
    """Extract arrondissement from cinema name or address."""
    # Check postal code in address
    m = re.search(r'750(\d{2})', address)
    if m:
        arr = int(m.group(1))
        if 1 <= arr <= 20:
            return f"{arr}e"
    # Known mappings
    KNOWN = {
        "Les Halles": "1er", "Bercy": "12e", "Gobelins": "13e",
        "Odéon": "6e", "Danton": "6e", "George V": "8e",
        "Rotonde": "6e", "Normandie": "8e", "La Défense": None,
        "Beaugrenelle": "15e", "Wepler": "18e", "La Villette": "19e",
        "Parnasse": "14e", "Convention": "15e", "Opéra": "9e",
        "Bibliothèque": "13e", "Quai de Seine": "19e", "Quai de Loire": "19e",
        "Beaubourg": "4e", "Nation": "11e", "St Germain": "6e",
        "St Michel": "5e", "Gambetta": "20e", "Bastille": "11e",
        "Grand Rex": "2e", "Champo": "5e", "Balzac": "8e",
        "Quartier Latin": "5e", "Louxor": "10e", "Studio 28": "18e",
        "Panthéon": "5e", "Luxembourg": "6e", "Caumartin": "9e",
        "Batignolles": "17e", "Lincoln": "8e", "Hôtel de Ville": "4e",
        "Forum des Images": "1er", "Cinémathèque": "12e",
        "Centre Pompidou": "4e",
    }
    for key, arr in KNOWN.items():
        if key.lower() in cinema_name.lower():
            return arr
    return None


def fetch_events(
    max_cinemas: int = 60,
    days_ahead: int = 7,
) -> Generator[dict, None, None]:
    """Fetch movie showtimes from Allociné for Paris cinemas.

    Args:
        max_cinemas: Max cinemas to scrape
        days_ahead: Number of days ahead to fetch
    """
    client = httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True)
    seen = set()
    cinema_list = list(PARIS_CINEMAS.items())[:max_cinemas]

    for cinema_code, cinema_name in cinema_list:
        try:
            # Fetch showtime page for this cinema
            url = f"https://www.allocine.fr/seance/salle_gen_csalle={cinema_code}.html"
            resp = client.get(url)
            if resp.status_code != 200:
                print(f"  Allociné: {cinema_name} → HTTP {resp.status_code}")
                time.sleep(1)
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract cinema address
            address_el = soup.select_one(".theater-address, .address, [class*=address]")
            cinema_address = clean_text(address_el.get_text()) if address_el else ""
            arrondissement = _extract_cinema_arrondissement(cinema_name, cinema_address or "")

            # Find movie cards — Allociné uses different structures
            # Try JSON-LD first
            json_ld_scripts = soup.select('script[type="application/ld+json"]')
            for script in json_ld_scripts:
                try:
                    data = json.loads(script.string or "")
                    if isinstance(data, list):
                        for item in data:
                            if item.get("@type") == "ScreeningEvent":
                                _yield_from_jsonld(item, cinema_name, cinema_address, arrondissement, cinema_code, seen)
                    elif data.get("@type") == "ScreeningEvent":
                        _yield_from_jsonld(data, cinema_name, cinema_address, arrondissement, cinema_code, seen)
                except (json.JSONDecodeError, KeyError):
                    pass

            # Parse HTML movie cards
            movie_cards = soup.select(".card.entity-card, .mdl, .js-movie-card, [class*=showtime-movie], .hred, .item-screening")
            if not movie_cards:
                movie_cards = soup.select(".theater-card, .movie-card, .card")

            for card in movie_cards:
                try:
                    # Title
                    title_el = card.select_one("h2 a, .meta-title a, .title a, [class*=title] a, a.meta-title-link")
                    if not title_el:
                        title_el = card.select_one("h2, .meta-title, .title")
                    if not title_el:
                        continue
                    title = clean_text(title_el.get_text())
                    if not title or len(title) < 2:
                        continue

                    # Link
                    link = title_el.get("href", "") if title_el.name == "a" else ""
                    if not link:
                        link_el = card.select_one("a[href*='/film/']")
                        link = link_el["href"] if link_el else ""
                    if link and not link.startswith("http"):
                        link = f"https://www.allocine.fr{link}"

                    # Image
                    img_el = card.select_one("img[src], img[data-src]")
                    image_url = None
                    if img_el:
                        image_url = img_el.get("data-src") or img_el.get("src")
                        if image_url and image_url.startswith("//"):
                            image_url = "https:" + image_url

                    # Description / synopsis
                    synopsis_el = card.select_one(".synopsis, .content-txt, [class*=synopsis]")
                    description = clean_text(synopsis_el.get_text()) if synopsis_el else None

                    # Duration
                    duration_el = card.select_one(".meta-body-info, [class*=duration], [class*=info]")
                    duration_text = clean_text(duration_el.get_text()) if duration_el else ""

                    # Genre
                    genre_el = card.select_one(".meta-body-info .dark-grey-link, [class*=genre]")
                    genre = clean_text(genre_el.get_text()) if genre_el else None

                    # Showtimes
                    showtime_els = card.select(".showtime-tags .tag, .showtimes-hours .text, [class*=showtime] .tag, [class*=hours] span, .seance, time")
                    if not showtime_els:
                        showtime_els = card.select("em, .hours span, span.time")

                    # Current date section
                    date_section = card.find_previous(["h3", "h2", "div"], class_=re.compile(r"date|day|jour"))
                    section_date = None
                    if date_section:
                        section_date = _parse_french_date(date_section.get_text())

                    # If no specific showtimes, create one event per day
                    if showtime_els:
                        for st_el in showtime_els:
                            st_text = clean_text(st_el.get_text())
                            if not st_text:
                                continue
                            show_time = _parse_showtime(st_text)
                            if not show_time:
                                continue

                            base_date = section_date or datetime.now().strftime("%Y-%m-%d")
                            start_iso = f"{base_date}T{show_time}:00"
                            slug = generate_slug(f"{title} {cinema_name}", start_iso)

                            if slug in seen:
                                continue
                            seen.add(slug)

                            yield {
                                "title": title,
                                "slug": slug,
                                "description": description,
                                "short_desc": truncate(description) if description else f"Séance de {title} au {cinema_name}",
                                "start_date": start_iso,
                                "end_date": None,
                                "image_url": image_url,
                                "price_min": 0,
                                "price_max": 0,
                                "is_free": False,
                                "booking_url": link or url,
                                "source": "allocine",
                                "source_id": f"allocine-{cinema_code}-{slug}",
                                "source_url": link or url,
                                "venue_name": cinema_name,
                                "venue_address": cinema_address,
                                "venue_city": "Paris",
                                "venue_zip": None,
                                "venue_arrondissement": arrondissement,
                                "category_slug": "cinema",
                                "tags": [genre] if genre else ["cinema"],
                                "quality_score": compute_quality_score(
                                    title, description, image_url, start_iso, None, link
                                ),
                            }
                    else:
                        # No showtimes found — create one event for today
                        for day_offset in range(min(days_ahead, 3)):
                            date = (datetime.now() + timedelta(days=day_offset)).strftime("%Y-%m-%d")
                            start_iso = f"{date}T20:00:00"
                            slug = generate_slug(f"{title} {cinema_name}", start_iso)
                            if slug in seen:
                                continue
                            seen.add(slug)

                            yield {
                                "title": title,
                                "slug": slug,
                                "description": description,
                                "short_desc": truncate(description) if description else f"Film à l'affiche au {cinema_name}",
                                "start_date": start_iso,
                                "end_date": None,
                                "image_url": image_url,
                                "price_min": 0,
                                "price_max": 0,
                                "is_free": False,
                                "booking_url": link or url,
                                "source": "allocine",
                                "source_id": f"allocine-{cinema_code}-{slug}",
                                "source_url": link or url,
                                "venue_name": cinema_name,
                                "venue_address": cinema_address,
                                "venue_city": "Paris",
                                "venue_zip": None,
                                "venue_arrondissement": arrondissement,
                                "category_slug": "cinema",
                                "tags": [genre] if genre else ["cinema"],
                                "quality_score": compute_quality_score(
                                    title, description, image_url, start_iso, None, link
                                ),
                            }

                except Exception as e:
                    continue

            print(f"  Allociné: {cinema_name} OK")
            time.sleep(1.5)  # Be polite

        except Exception as e:
            print(f"  Allociné: {cinema_name} error: {e}")
            time.sleep(2)

    client.close()


def _yield_from_jsonld(data, cinema_name, cinema_address, arrondissement, cinema_code, seen):
    """Helper to yield events from JSON-LD ScreeningEvent data."""
    title = data.get("workPresented", {}).get("name") or data.get("name", "")
    if not title:
        return None

    start = data.get("startDate")
    image = data.get("workPresented", {}).get("image") or data.get("image")
    url = data.get("url", "")
    desc = data.get("workPresented", {}).get("description") or data.get("description")

    slug = generate_slug(f"{title} {cinema_name}", start)
    if slug in seen:
        return None
    seen.add(slug)

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)),
        "start_date": start,
        "end_date": None,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": False,
        "booking_url": url if url.startswith("http") else f"https://www.allocine.fr{url}" if url else None,
        "source": "allocine",
        "source_id": f"allocine-{cinema_code}-{slug}",
        "source_url": url if url.startswith("http") else f"https://www.allocine.fr{url}" if url else None,
        "venue_name": cinema_name,
        "venue_address": cinema_address,
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": arrondissement,
        "category_slug": "cinema",
        "tags": ["cinema"],
        "quality_score": compute_quality_score(title, clean_text(desc), image, start, None, url),
    }
