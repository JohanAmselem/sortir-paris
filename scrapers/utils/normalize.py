"""Normalization utilities for scraped event data."""

import re
import html
from datetime import datetime
from typing import Optional
from unidecode import unidecode


def clean_text(text: Optional[str]) -> Optional[str]:
    """Strip HTML, normalize whitespace, trim."""
    if not text:
        return None
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Decode HTML entities
    text = html.unescape(text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def truncate(text: Optional[str], max_len: int = 160) -> Optional[str]:
    """Truncate text to max_len, breaking at word boundary."""
    if not text or len(text) <= max_len:
        return text
    truncated = text[:max_len].rsplit(" ", 1)[0]
    return truncated + "..."


def generate_slug(title: str, date: Optional[str] = None) -> str:
    """Generate URL slug from title and optional date."""
    slug = unidecode(title).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    if date:
        try:
            d = datetime.fromisoformat(date)
            slug += f"-{d.strftime('%Y-%m-%d')}"
        except ValueError:
            pass
    return slug


def parse_price(raw: Optional[str]) -> dict:
    """Parse French price strings into structured data.

    Returns:
        dict with keys: price_min, price_max, is_free (all in centimes)
    """
    if not raw:
        return {"price_min": 0, "price_max": 0, "is_free": False}

    lower = raw.lower().strip()

    # Free
    free_keywords = ["gratuit", "free", "entrée libre", "0€", "0 €"]
    if any(kw in lower for kw in free_keywords):
        return {"price_min": 0, "price_max": 0, "is_free": True}

    # Range: "12€ - 25€", "12 à 25 euros", "de 10 à 30€"
    range_match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*[€e]?\s*[-–àa]\s*(\d+(?:[.,]\d+)?)\s*[€e]?", lower
    )
    if range_match:
        price_min = int(float(range_match.group(1).replace(",", ".")) * 100)
        price_max = int(float(range_match.group(2).replace(",", ".")) * 100)
        return {"price_min": price_min, "price_max": price_max, "is_free": False}

    # Single: "15€", "15 euros"
    single_match = re.search(r"(\d+(?:[.,]\d+)?)\s*[€e]", lower)
    if single_match:
        price = int(float(single_match.group(1).replace(",", ".")) * 100)
        return {"price_min": price, "price_max": price, "is_free": False}

    return {"price_min": 0, "price_max": 0, "is_free": False}


# Category detection keywords
CATEGORY_KEYWORDS = {
    "concerts": ["concert", "musique", "live", "dj", "electro", "jazz", "rock", "rap", "hip-hop", "chanson"],
    "expos": ["exposition", "expo", "galerie", "art", "photographie", "sculpture", "peinture"],
    "theatre": ["théâtre", "theatre", "pièce", "comédie", "drame", "mise en scène", "tragédie"],
    "cinema": ["cinéma", "cinema", "film", "projection", "avant-première"],
    "festivals": ["festival", "fest"],
    "conferences": ["conférence", "conference", "débat", "rencontre", "table ronde", "masterclass"],
    "danse": ["danse", "ballet", "chorégraphie"],
    "spectacles": ["spectacle", "cirque", "magie", "one man show", "humour", "stand-up"],
    "ateliers": ["atelier", "workshop", "stage", "cours"],
    "visites": ["visite", "balade", "parcours", "patrimoine"],
    "sport": ["sport", "yoga", "fitness", "running", "course à pied", "pilates", "boxe", "crossfit", "gym", "natation", "escalade", "vélo", "tennis", "basketball", "foot", "musculation", "stretching", "zumba", "kickboxing", "bootcamp"],
}


def detect_category(raw_category: Optional[str], title: str, description: Optional[str] = None) -> Optional[str]:
    """Detect category slug from raw text."""
    text = f"{raw_category or ''} {title} {description or ''}".lower()

    scores: dict[str, int] = {}
    for slug, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scores[slug] = score

    if not scores:
        return None

    return max(scores, key=scores.get)  # type: ignore[arg-type]


def compute_quality_score(
    title: Optional[str],
    description: Optional[str],
    image_url: Optional[str],
    start_date: Optional[str],
    price_raw: Optional[str],
    booking_url: Optional[str],
) -> int:
    """Compute quality score 0-100."""
    score = 0
    if title:
        score += 15
    if description and len(description) > 100:
        score += 20
    if description and len(description) > 300:
        score += 10
    if image_url:
        score += 25
    if start_date:
        score += 10
    if price_raw:
        score += 10
    if booking_url:
        score += 10
    return score
