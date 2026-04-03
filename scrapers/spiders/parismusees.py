"""
Paris Musées Open Data scraper — Exhibitions and events from 14 city museums.
Source: https://www.parismusees.paris.fr / data.parismusees.paris.fr

Uses the Opendatasoft API (same platform as data.paris.fr).
Covers: Carnavalet, Petit Palais, MAM, Catacombes, Crypte de Notre-Dame, etc.
"""

import httpx
import time
from datetime import datetime
from typing import Generator, Optional

from utils.normalize import (
    clean_text,
    truncate,
    generate_slug,
    parse_price,
    detect_category,
    compute_quality_score,
)

# Opendatasoft API for Paris Musées
API_BASE = "https://data.parismusees.paris.fr/api/explore/v2.1"

# Additional museum websites to scrape
MUSEUM_PAGES = [
    # Petit Palais
    ("https://www.petitpalais.paris.fr/expositions", "Petit Palais", "8e"),
    # Musée d'Art Moderne
    ("https://www.mam.paris.fr/fr/expositions", "Musée d'Art Moderne de Paris", "16e"),
    # Musée Carnavalet
    ("https://www.carnavalet.paris.fr/expositions", "Musée Carnavalet", "3e"),
    # Maison de Victor Hugo
    ("https://www.maisonsvictorhugo.paris.fr/fr/expositions", "Maison de Victor Hugo", "4e"),
    # Musée de la Vie Romantique
    ("https://www.museevieromantique.paris.fr/fr/expositions", "Musée de la Vie Romantique", "9e"),
    # Musée Cernuschi
    ("https://www.cernuschi.paris.fr/fr/expositions", "Musée Cernuschi", "8e"),
    # Musée Bourdelle
    ("https://www.bourdelle.paris.fr/fr/expositions", "Musée Bourdelle", "15e"),
    # Musée Zadkine
    ("https://www.zadkine.paris.fr/fr/expositions", "Musée Zadkine", "6e"),
    # Palais Galliera
    ("https://www.palaisgalliera.paris.fr/fr/expositions", "Palais Galliera", "16e"),
    # Crypte de Notre-Dame
    ("https://www.crypte.paris.fr/fr/expositions", "Crypte de Notre-Dame", "4e"),
    # Catacombes
    ("https://www.catacombes.paris.fr/", "Catacombes de Paris", "14e"),
]

# Major national museums (not in Paris Musées network but essential)
NATIONAL_MUSEUMS = [
    {
        "name": "Centre Pompidou",
        "url": "https://www.centrepompidou.fr",
        "arrondissement": "4e",
        "note": "Fermé pour travaux jusqu'en 2030",
    },
    {
        "name": "Musée d'Orsay",
        "url": "https://www.musee-orsay.fr",
        "arrondissement": "7e",
    },
    {
        "name": "Musée de l'Orangerie",
        "url": "https://www.musee-orangerie.fr",
        "arrondissement": "1er",
    },
    {
        "name": "Palais de Tokyo",
        "url": "https://www.palaisdetokyo.com",
        "arrondissement": "16e",
    },
    {
        "name": "Jeu de Paume",
        "url": "https://jeudepaume.org",
        "arrondissement": "8e",
    },
    {
        "name": "Fondation Louis Vuitton",
        "url": "https://www.fondationlouisvuitton.fr",
        "arrondissement": "16e",
    },
    {
        "name": "Grand Palais",
        "url": "https://www.grandpalais.fr",
        "arrondissement": "8e",
    },
    {
        "name": "Musée du Louvre",
        "url": "https://www.louvre.fr",
        "arrondissement": "1er",
    },
    {
        "name": "Musée Rodin",
        "url": "https://www.musee-rodin.fr",
        "arrondissement": "7e",
    },
    {
        "name": "Musée du quai Branly",
        "url": "https://www.quaibranly.fr",
        "arrondissement": "7e",
    },
    {
        "name": "Musée Picasso",
        "url": "https://www.museepicassoparis.fr",
        "arrondissement": "3e",
    },
    {
        "name": "Musée Guimet",
        "url": "https://www.guimet.fr",
        "arrondissement": "16e",
    },
    {
        "name": "Musée de Cluny",
        "url": "https://www.musee-moyenage.fr",
        "arrondissement": "5e",
    },
    {
        "name": "Institut du Monde Arabe",
        "url": "https://www.imarabe.org",
        "arrondissement": "5e",
    },
    {
        "name": "Bourse de Commerce — Pinault Collection",
        "url": "https://www.boursedecommerce.fr",
        "arrondissement": "1er",
    },
    {
        "name": "Atelier des Lumières",
        "url": "https://www.atelier-lumieres.com",
        "arrondissement": "11e",
    },
]

HEADERS = {
    "User-Agent": "SortirParis/1.0 (+https://sortir.paris)",
    "Accept": "application/json, text/html",
}


def fetch_events(
    max_pages: int = 10,
) -> Generator[dict, None, None]:
    """Fetch exhibitions and events from Paris Musées + major museums.

    Uses the Opendatasoft API + HTML scraping of museum websites.
    """
    client = httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True)
    seen = set()

    # -----------------------------------------------
    # Strategy 1: Opendatasoft API (Paris Musées data)
    # -----------------------------------------------
    for offset in range(0, max_pages * 100, 100):
        try:
            resp = client.get(
                f"{API_BASE}/catalog/datasets/expositions-evenements/records",
                params={
                    "limit": 100,
                    "offset": offset,
                    "order_by": "date_de_debut DESC",
                },
            )
            if resp.status_code != 200:
                # Try alternative dataset names
                resp = client.get(
                    f"{API_BASE}/catalog/datasets",
                    params={"limit": 50},
                )
                if resp.status_code == 200:
                    datasets = resp.json().get("results", [])
                    for ds in datasets:
                        ds_id = ds.get("dataset_id", "")
                        if any(kw in ds_id for kw in ["expo", "event", "programme", "activit"]):
                            print(f"  Paris Musées: found dataset '{ds_id}'")
                            # Try this dataset
                            resp2 = client.get(
                                f"{API_BASE}/catalog/datasets/{ds_id}/records",
                                params={"limit": 100, "offset": offset},
                            )
                            if resp2.status_code == 200:
                                resp = resp2
                                break
                break

            data = resp.json()
            records = data.get("results", [])
            if not records:
                break

            for record in records:
                fields = record.get("fields", record)
                result = _parse_opendata_record(fields, seen)
                if result:
                    yield result

            time.sleep(0.5)

        except Exception as e:
            print(f"  Paris Musées API error: {e}")
            break

    # -----------------------------------------------
    # Strategy 2: Scrape museum exhibition pages
    # -----------------------------------------------
    from bs4 import BeautifulSoup

    for museum_url, museum_name, arrondissement in MUSEUM_PAGES:
        try:
            resp = client.get(museum_url)
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # JSON-LD
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    ld = __import__("json").loads(script.string or "")
                    items = ld if isinstance(ld, list) else [ld]
                    for item in items:
                        if item.get("@type") in ("ExhibitionEvent", "Event", "VisualArtsEvent"):
                            result = _parse_museum_jsonld(item, museum_name, arrondissement, seen)
                            if result:
                                yield result
                except Exception:
                    pass

            # HTML cards
            cards = soup.select("article, .card, .expo-card, [class*=exhibition], [class*=expo], .node--type-exhibition")
            for card in cards:
                result = _parse_museum_card(card, museum_name, museum_url, arrondissement, seen)
                if result:
                    yield result

            print(f"  Paris Musées: {museum_name} OK")
            time.sleep(1)

        except Exception as e:
            print(f"  Paris Musées: {museum_name} error: {e}")

    # -----------------------------------------------
    # Strategy 3: National museums — scrape exhibition pages
    # -----------------------------------------------
    for museum in NATIONAL_MUSEUMS:
        try:
            expos_url = museum["url"]
            # Try common expo paths
            for path in ["/fr/expositions", "/expositions", "/en/exhibitions", "/programme", "/agenda"]:
                try:
                    resp = client.get(f"{expos_url}{path}")
                    if resp.status_code == 200:
                        expos_url = f"{expos_url}{path}"
                        break
                except Exception:
                    continue
            else:
                resp = client.get(museum["url"])
                if resp.status_code != 200:
                    continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # JSON-LD
            for script in soup.select('script[type="application/ld+json"]'):
                try:
                    ld = __import__("json").loads(script.string or "")
                    items = ld if isinstance(ld, list) else [ld]
                    for item in items:
                        if item.get("@type") in ("ExhibitionEvent", "Event", "VisualArtsEvent"):
                            result = _parse_museum_jsonld(item, museum["name"], museum["arrondissement"], seen)
                            if result:
                                yield result
                except Exception:
                    pass

            # HTML cards
            cards = soup.select("article, .card, [class*=exhibition], [class*=expo], [class*=event]")
            for card in cards:
                result = _parse_museum_card(card, museum["name"], museum["url"], museum["arrondissement"], seen)
                if result:
                    yield result

            print(f"  Musées: {museum['name']} OK")
            time.sleep(1)

        except Exception as e:
            print(f"  Musées: {museum['name']} error: {e}")

    client.close()


def _parse_opendata_record(fields: dict, seen: set) -> Optional[dict]:
    """Parse a record from the Paris Musées Opendatasoft API."""
    title = fields.get("titre") or fields.get("title") or fields.get("nom")
    if not title:
        return None

    title = clean_text(title)
    start = fields.get("date_de_debut") or fields.get("date_start") or fields.get("date")
    end = fields.get("date_de_fin") or fields.get("date_end")
    desc = fields.get("description") or fields.get("texte") or fields.get("chapeau")
    image = fields.get("image") or fields.get("visuel") or fields.get("thumbnail")
    url = fields.get("url") or fields.get("lien") or fields.get("link")
    museum = fields.get("musee") or fields.get("lieu") or fields.get("museum") or ""
    address = fields.get("adresse") or fields.get("address") or ""
    price_raw = fields.get("tarif") or fields.get("price") or ""

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    price = parse_price(price_raw)

    return {
        "title": title,
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)) if desc else f"Exposition au {museum}" if museum else None,
        "start_date": start,
        "end_date": end,
        "image_url": image,
        **price,
        "booking_url": url,
        "source": "parismusees",
        "source_id": f"pm-{slug}",
        "source_url": url,
        "venue_name": clean_text(museum) or "Paris Musées",
        "venue_address": clean_text(address),
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": None,
        "category_slug": "expos",
        "tags": ["exposition", "musée", "art"],
        "quality_score": compute_quality_score(title, clean_text(desc), image, start, price_raw, url),
    }


def _parse_museum_jsonld(data: dict, museum_name: str, arrondissement: str, seen: set) -> Optional[dict]:
    """Parse JSON-LD ExhibitionEvent."""
    title = data.get("name", "")
    if not title:
        return None

    start = data.get("startDate")
    end = data.get("endDate")
    desc = data.get("description", "")
    image = data.get("image")
    if isinstance(image, list) and image:
        image = image[0]
    url = data.get("url", "")

    location = data.get("location", {})
    venue = location.get("name", museum_name)

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    offers = data.get("offers", {})
    price_raw = ""
    if isinstance(offers, dict):
        price_raw = f"{offers.get('price', '')}€" if offers.get("price") else ""
    booking_url = offers.get("url") if isinstance(offers, dict) else url

    price = parse_price(price_raw)

    return {
        "title": clean_text(title),
        "slug": slug,
        "description": clean_text(desc),
        "short_desc": truncate(clean_text(desc)) if desc else f"Exposition au {venue}",
        "start_date": start,
        "end_date": end,
        "image_url": image,
        **price,
        "booking_url": booking_url or url,
        "source": "parismusees",
        "source_id": f"pm-{slug}",
        "source_url": url,
        "venue_name": venue,
        "venue_address": "",
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": arrondissement,
        "category_slug": "expos",
        "tags": ["exposition", "musée", "art"],
        "quality_score": compute_quality_score(clean_text(title), clean_text(desc), image, start, price_raw, url),
    }


def _parse_museum_card(card, museum_name: str, base_url: str, arrondissement: str, seen: set) -> Optional[dict]:
    """Parse an HTML exhibition card."""
    from bs4 import Tag
    if not isinstance(card, Tag):
        return None

    title_el = card.select_one("h2, h3, h4, .title, [class*=title]")
    if not title_el:
        return None
    title = clean_text(title_el.get_text())
    if not title or len(title) < 3:
        return None

    # Skip navigation items
    if title.lower() in ("menu", "suivant", "précédent", "voir plus", "actualités"):
        return None

    link_el = card.select_one("a[href]")
    url = ""
    if link_el:
        url = link_el.get("href", "")
        if url and not url.startswith("http"):
            url = f"{base_url.rstrip('/')}{url}" if url.startswith("/") else f"{base_url}/{url}"

    img_el = card.select_one("img[src], img[data-src]")
    image = None
    if img_el:
        image = img_el.get("data-src") or img_el.get("src")
        if image and not image.startswith("http"):
            image = f"{base_url.rstrip('/')}{image}" if image.startswith("/") else None

    date_el = card.select_one("time, .date, [class*=date]")
    date_text = clean_text(date_el.get_text()) if date_el else None
    start = date_el.get("datetime") if date_el and date_el.has_attr("datetime") else None

    desc_el = card.select_one("p, .description, .summary, [class*=desc]")
    desc = clean_text(desc_el.get_text()) if desc_el else None

    slug = generate_slug(title, start)
    if slug in seen:
        return None
    seen.add(slug)

    return {
        "title": title,
        "slug": slug,
        "description": desc,
        "short_desc": truncate(desc) if desc else f"Exposition au {museum_name}",
        "start_date": start,
        "end_date": None,
        "image_url": image,
        "price_min": 0,
        "price_max": 0,
        "is_free": False,
        "booking_url": url,
        "source": "parismusees",
        "source_id": f"pm-{slug}",
        "source_url": url,
        "venue_name": museum_name,
        "venue_address": "",
        "venue_city": "Paris",
        "venue_zip": None,
        "venue_arrondissement": arrondissement,
        "category_slug": "expos",
        "tags": ["exposition", "musée", "art"],
        "quality_score": compute_quality_score(title, desc, image, start, None, url),
    }
