"""
Allociné — real cinema showtimes in Paris.

Source: the public JSON endpoint used by Allociné's own theater pages
(https://www.allocine.fr/seance/salle_gen_csalle=C0159.html):

    https://www.allocine.fr/_/showtimes/theater-{CODE}/d-{YYYY-MM-DD}/[p-{N}/]

Each result = {"movie": {...}, "showtimes": {"original": [...], "multiple": [...], ...}}
with showtimes[*].startsAt as Paris local time ("2026-10-07T20:45:00").

Output: ONE event per film × cinema × day, only when real showtimes exist.
start = first showtime of the day; description lists all the day's showtimes + version.
No showtime → no event (never a default time).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, Generator, List, Optional, Tuple

from bs4 import BeautifulSoup

from utils.dates import now_paris
from utils.event import make_event
from utils.http import BudgetExceeded, PoliteClient
from utils.normalize import clean_text, extract_zip

SOURCE = "allocine"
BASE_URL = "https://www.allocine.fr"
THEATER_URL = BASE_URL + "/seance/salle_gen_csalle={code}.html"
SHOWTIMES_URL = BASE_URL + "/_/showtimes/theater-{code}/d-{day}/"
FILM_URL = BASE_URL + "/film/fichefilm_gen_cfilm={film_id}.html"
PARIS_LISTING_URL = BASE_URL + "/salle/cinema/ville-115755/"

# Paris cinemas — code → (name, street address, zip).
# Verified on 2026-10-07 against Allociné's own Paris theater listing
# (PARIS_LISTING_URL, pages 1-6, data-theater ids + <address>), see parse_theater_listing().
# Ordered roughly by Allociné's listing order (largest/most visited first).
PARIS_CINEMAS: Dict[str, Tuple[str, str, str]] = {
    "C0159": ("UGC Ciné Cité Les Halles", "7 place de la Rotonde", "75001"),
    "C0026": ("UGC Ciné Cité Bercy", "2 cour Saint-Émilion", "75012"),
    "C2954": ("MK2 Bibliothèque", "128-162 avenue de France", "75013"),
    "C0179": ("Pathé Wepler", "140 boulevard de Clichy", "75018"),
    "C0158": ("Pathé Parnasse", "3 rue d'Odessa", "75014"),
    "C0003": ("MK2 Quai de Seine", "14 quai de la Seine", "75019"),
    "C0116": ("Pathé Aquaboulevard", "8-16 rue du Colonel-Pierre-Avia", "75015"),
    "C1621": ("MK2 Quai de Loire", "7 quai de Loire", "75019"),
    "C0103": ("UGC Montparnasse", "83 boulevard du Montparnasse", "75006"),
    "C0150": ("UGC Gobelins", "66 bis avenue des Gobelins", "75013"),
    "C0192": ("MK2 Gambetta", "6 rue Belgrand", "75020"),
    "C0060": ("Pathé BNP Paribas", "32 rue Louis-le-Grand", "75002"),
    "C0140": ("MK2 Bastille (côté Beaumarchais)", "4 boulevard Beaumarchais", "75011"),
    "C0161": ("Pathé Convention", "27 rue Alain-Chartier", "75015"),
    "C0065": ("Le Grand Rex", "1 boulevard Poissonnière", "75002"),
    "C0037": ("Pathé Alésia", "73 avenue du Général-Leclerc", "75014"),
    "C0144": ("MK2 Nation", "133 boulevard Diderot", "75012"),
    "C0050": ("MK2 Beaubourg", "50 rue Rambuteau", "75003"),
    "W7502": ("Pathé Beaugrenelle", "7 rue Linois", "75015"),
    "C0146": ("UGC Lyon Bastille", "12 rue de Lyon", "75012"),
    "C0104": ("UGC Odéon", "124 boulevard Saint-Germain", "75006"),
    "C0126": ("UGC Opéra", "32 boulevard des Italiens", "75009"),
    "C0097": ("MK2 Odéon (côté St Germain)", "113 boulevard Saint-Germain", "75006"),
    "C0175": ("UGC Ciné Cité Maillot", "2 place de la Porte-Maillot", "75017"),
    "C0102": ("UGC Danton", "99 boulevard Saint-Germain", "75006"),
    "C0040": ("MK2 Bastille (côté Fg St Antoine)", "5 rue du Faubourg-Saint-Antoine", "75011"),
    "C0004": ("Le Cinéma des Cinéastes", "7 avenue de Clichy", "75017"),
    "C0024": ("Pathé Les Fauvettes", "58 avenue des Gobelins", "75013"),
    "C0012": ("Les Cinq Caumartin", "101 rue Saint-Lazare", "75009"),
    "C0139": ("Majestic Bastille", "4 boulevard Richard-Lenoir", "75011"),
    "C0020": ("Filmothèque du Quartier Latin", "9 rue Champollion", "75005"),
    "C0092": ("MK2 Odéon (côté St Michel)", "7 rue Hautefeuille", "75006"),
    "C0073": ("Le Champo - Espace Jacques Tati", "51 rue des Écoles", "75005"),
    "W7509": ("UGC Ciné Cité Paris 19", "166 boulevard Macdonald", "75019"),
    "W7510": ("Le Louxor - Palais du cinéma", "170 boulevard de Magenta", "75010"),
    "C0025": ("Sept Parnassiens", "98 boulevard du Montparnasse", "75014"),
    "C0074": ("Reflet Médicis", "3 rue Champollion", "75005"),
    "C0089": ("Max Linder Panorama", "24 boulevard Poissonnière", "75009"),
    "C0120": ("Majestic Passy", "18 rue de Passy", "75016"),
    "C0052": ("Pathé Montparnos", "16 rue d'Odessa", "75014"),
    "C0054": ("L'Arlequin", "76 rue de Rennes", "75006"),
    "C0072": ("Le Grand Action", "5 rue des Écoles", "75005"),
    "C0009": ("Le Balzac", "1 rue Balzac", "75008"),
    "C0105": ("UGC Rotonde", "103 boulevard du Montparnasse", "75006"),
    "C0015": ("Christine Cinéma Club", "4 rue Christine", "75006"),
    "C6336": ("Publicis Cinémas", "129 avenue des Champs-Élysées", "75008"),
    "C0071": ("Écoles Cinéma Club", "23 rue des Écoles", "75005"),
    "C0147": ("Escurial", "11 boulevard de Port-Royal", "75013"),
    "C0099": ("MK2 Parnasse", "11 rue Jules-Chaplain", "75006"),
    "C0013": ("Luminor Hôtel de Ville", "20 rue du Temple", "75004"),
    "C0095": ("Les 3 Luxembourg", "67 rue Monsieur-le-Prince", "75006"),
    "W7519": ("CGR Paris Lilas", "place du Maquis-du-Vercors", "75020"),
    "C0023": ("Le Brady", "39 boulevard de Strasbourg", "75010"),
    "W7520": ("Pathé La Villette", "30 avenue Corentin-Cariou", "75019"),
    "C0108": ("Elysées Lincoln", "14 rue Lincoln", "75008"),
    "C0041": ("Nouvel Odéon", "6 rue de l'École-de-Médecine", "75006"),
    "C0061": ("Studio 28", "10 rue Tholozé", "75018"),
    "C0117": ("Espace Saint-Michel", "7 place Saint-Michel", "75005"),
    "W7515": ("Cinéma Chaplin Saint Lambert", "6 rue Péclet", "75015"),
    "C0100": ("Saint-André des Arts", "30 rue Saint-André-des-Arts", "75006"),
    "P7517": ("7 Batignolles", "86 rue Mstislav-Rostropovitch", "75017"),
    "C0093": ("Lucernaire", "53 rue Notre-Dame-des-Champs", "75006"),
    "C0134": ("L'Archipel", "17 boulevard de Strasbourg", "75010"),
    "C0076": ("Cinéma du Panthéon", "13 rue Victor-Cousin", "75005"),
    "C0005": ("L'Entrepôt", "7-9 rue Francis-de-Pressensé", "75014"),
    "C0153": ("Cinéma Chaplin Denfert", "24 place Denfert-Rochereau", "75014"),
    "C0096": ("Le Saint Germain des Prés", "22 rue Guillaume-Apollinaire", "75006"),
    "C0016": ("Studio Galande", "42 rue Galande", "75005"),
    "C0172": ("Mac-Mahon", "5 avenue Mac-Mahon", "75017"),
    "C0170": ("La Clef", "34 rue Daubenton", "75005"),
    "C1559": ("La Cinémathèque française", "51 rue de Bercy", "75012"),
    "C0119": ("Forum des images", "2 rue du Cinéma, Forum des Halles", "75001"),
    "W7508": ("MK2 Grand Palais", "Grand Palais, avenue Winston-Churchill", "75008"),
    "C0083": ("Studio des Ursulines", "10 rue des Ursulines", "75005"),
    "W7505": ("Studio Luxembourg Accattone", "20 rue Cujas", "75005"),
    "C0189": ("La Géode", "26 avenue Corentin-Cariou", "75019"),
    "G02BG": ("Pathé Palace", "2 boulevard des Capucines", "75009"),
    "W7517": ("Club de l'Étoile", "14 rue Troyon", "75017"),
    "W7504": ("Épée de Bois", "100 rue Mouffetard", "75005"),
    "W7516": ("Le Ranelagh", "5 rue des Vignes", "75016"),
    "W7512": ("Le Miramar", "3 rue du Départ", "75014"),
    "W7513": ("Fondation Jérôme Seydoux-Pathé", "73 avenue des Gobelins", "75013"),
}



# ─────────────────────────── pure parsers ───────────────────────────

def _version_label(showtime: dict, bucket: str) -> Optional[str]:
    """'VF' | 'VOST' | 'VO' | None from a showtime's diffusionVersion/tags."""
    dv = (showtime.get("diffusionVersion") or "").upper()
    tags = showtime.get("tags") or []
    if dv in ("DUBBED", "LOCAL") or "Localization.Version.Dubbed" in tags:
        return "VF"
    if dv == "ORIGINAL" or "Localization.Version.Original" in tags or bucket.startswith("original"):
        if any(t.startswith("Localization.Subtitle") for t in tags) or bucket.endswith("_st"):
            return "VOST"
        return "VO"
    return None


def _fmt_hm(dt: datetime) -> str:
    return f"{dt.hour:02d}h{dt.minute:02d}"


def _parse_starts_at(value) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt


def _movie_year(movie: dict) -> Optional[int]:
    y = ((movie.get("data") or {}).get("productionYear"))
    try:
        return int(y) if y else None
    except (TypeError, ValueError):
        return None


def parse_showtimes(
    data: Optional[dict],
    cinema_code: str,
    day: str,
    venue: Optional[Tuple[str, str, str]] = None,
    enrich=None,
) -> List[dict]:
    """Parse one page of the showtimes JSON → list of make_event dicts.

    day: 'YYYY-MM-DD' that was requested (events are grouped on that day even when a
    late show starts after midnight). enrich: optional callable(title, year) -> dict|None
    (TMDB) used only when Allociné has no poster or no synopsis.
    """
    if not data or data.get("error"):
        return []
    venue = venue or PARIS_CINEMAS.get(cinema_code)
    if not venue:
        return []
    venue_name, venue_address, venue_zip = venue

    events: List[dict] = []
    for item in data.get("results") or []:
        try:
            movie = item.get("movie") or {}
            title = clean_text(movie.get("title"))
            film_id = movie.get("internalId")
            if not title or not film_id:
                continue

            shows: List[Tuple[datetime, Optional[str]]] = []
            for bucket, lst in (item.get("showtimes") or {}).items():
                for st in lst or []:
                    if not isinstance(st, dict):
                        continue
                    dt = _parse_starts_at(st.get("startsAt"))
                    if dt is None:
                        continue
                    shows.append((dt, _version_label(st, bucket)))
            if not shows:
                continue  # no real showtime → no event
            shows = sorted(set(shows), key=lambda s: s[0])
            first = shows[0][0]

            seances = ", ".join(
                f"{_fmt_hm(dt)} ({v})" if v else _fmt_hm(dt) for dt, v in shows
            )

            synopsis = clean_text(movie.get("synopsis"))
            poster = ((movie.get("poster") or {}).get("url")) or None
            genres = [g.get("translate") for g in (movie.get("genres") or []) if g.get("translate")]

            if enrich is not None and (not poster or not synopsis):
                extra = enrich(title, _movie_year(movie))
                if extra:
                    poster = poster or extra.get("poster_url") or extra.get("backdrop_url")
                    synopsis = synopsis or extra.get("overview")
                    if not genres:
                        genres = list(extra.get("genres") or [])

            meta = []
            if movie.get("runtime"):
                meta.append(f"Durée : {movie['runtime']}")
            if genres:
                meta.append("Genre : " + ", ".join(genres))
            desc_parts = [f"Séances : {seances}"]
            if meta:
                desc_parts.append(" · ".join(meta))
            if synopsis:
                desc_parts.append(synopsis)
            description = "\n\n".join(desc_parts)

            film_url = FILM_URL.format(film_id=film_id)
            theater_url = THEATER_URL.format(code=cinema_code)
            events.append(make_event(
                source=SOURCE,
                source_id=f"{cinema_code}-{film_id}-{day}",
                title=title,
                start=first,  # naive = Paris local (make_event converts to UTC)
                time_known=True,
                description=description,
                short_desc=synopsis or f"Séances : {seances}",
                image_url=poster,
                price=None,  # Allociné JSON has no price → unknown
                booking_url=theater_url,
                source_url=film_url,
                venue_name=venue_name,
                venue_address=venue_address,
                venue_city="Paris",
                venue_zip=venue_zip,
                category_slug="cinema",
                tags=["cinéma"] + genres[:3],
            ))
        except BudgetExceeded:
            raise
        except Exception as e:  # noqa: BLE001 — one bad film never kills the page
            print(f"  [allocine] {cinema_code} {day}: skipped one film ({e})")
    return events


def total_pages(data: Optional[dict]) -> int:
    try:
        return max(1, int(((data or {}).get("pagination") or {}).get("totalPages") or 1))
    except (TypeError, ValueError):
        return 1


def parse_theater_listing(html: str) -> List[Tuple[str, str, Optional[str], Optional[str]]]:
    """Parse an Allociné city theater listing page → [(code, name, address_text, zip)].

    Used to (re)verify PARIS_CINEMAS; not called during a normal run.
    """
    import json

    soup = BeautifulSoup(html, "html.parser")
    out = []
    for card in soup.select(".theater-card"):
        tag = card.select_one("[data-theater]")
        if not tag:
            continue
        try:
            info = json.loads(tag["data-theater"])
        except (ValueError, KeyError):
            continue
        addr_el = card.select_one("address")
        addr = clean_text(addr_el.get_text(" ")) if addr_el else None
        out.append((info.get("id"), clean_text(info.get("name")), addr, extract_zip(addr)))
    return out


# ─────────────────────────── network ───────────────────────────

def _enricher():
    """TMDB enrichment callable if a key is configured, else None."""
    try:
        from spiders.tmdb_cinema import enrich_film, has_credentials
    except ImportError:
        return None
    if not has_credentials():
        return None
    return lambda title, year: enrich_film(title, year)


def fetch_events(
    max_cinemas: int = 30,
    days_ahead: int = 7,
    max_pages_per_day: int = 5,
) -> Generator[dict, None, None]:
    """Real showtimes for the first `max_cinemas` cinemas over `days_ahead` days.

    Day by day (all cinemas for today, then tomorrow…), so a spent time budget only costs
    the farthest days. Allociné publishes the week's programme on Monday/Tuesday (the
    French cinema week starts on Wednesday): once a cinema has a day without any showtime,
    its later days are not requested (not published yet).
    Requests ≈ max_cinemas × published days × pages (≈2-3 pages for multiplexes), 1 req/s.
    """
    codes = list(PARIS_CINEMAS)[:max_cinemas]
    today: date = now_paris().date()
    enrich = _enricher()
    total = 0
    seen: set = set()
    per_cinema: Dict[str, int] = {code: 0 for code in codes}
    unpublished: set = set()  # cinemas whose programme stops before days_ahead

    with PoliteClient() as client:
        for offset in range(days_ahead):
            day = (today + timedelta(days=offset)).isoformat()
            n_day = 0
            for code in codes:
                if code in unpublished:
                    continue
                venue = PARIS_CINEMAS[code]
                try:
                    page = 1
                    while True:
                        url = SHOWTIMES_URL.format(code=code, day=day)
                        if page > 1:
                            url += f"p-{page}/"
                        resp = client.get(url)
                        if resp.status_code in (401, 403, 429) or (
                            resp.status_code == 200 and "json" not in resp.headers.get("content-type", "")
                        ):
                            print(f"  [allocine] blocked: HTTP {resp.status_code} on {url} — stopping source")
                            return
                        if resp.status_code != 200:
                            print(f"  [allocine] {venue[0]} {day} p{page} → HTTP {resp.status_code}")
                            break
                        try:
                            data = resp.json()
                        except ValueError:
                            print(f"  [allocine] {venue[0]} {day}: invalid JSON")
                            break
                        if page == 1 and offset > 0 and not (data.get("results") or []):
                            unpublished.add(code)  # programme not published that far yet
                            break
                        for ev in parse_showtimes(data, code, day, venue, enrich=enrich):
                            if ev["source_id"] in seen:
                                continue
                            seen.add(ev["source_id"])
                            per_cinema[code] += 1
                            n_day += 1
                            yield ev
                        if page >= min(total_pages(data), max_pages_per_day):
                            break
                        page += 1
                except BudgetExceeded:
                    raise
                except Exception as e:  # noqa: BLE001
                    print(f"  [allocine] {venue[0]} {day} error: {e}")
            total += n_day
            print(f"  [allocine] {day}: {n_day} film-days ({len(unpublished)} cinemas not published yet)")
    print(f"  [allocine] total: {total} film-days")
