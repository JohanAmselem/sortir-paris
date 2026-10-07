"""
Pure matching helpers for venue canonicalisation and cross-source event dedup.
Kept free of DB code so they are unit-tested (tests/test_matching.py).
"""

from __future__ import annotations

import math
import re
from typing import Optional, Set

from unidecode import unidecode

_ARTICLES = {"le", "la", "les", "l", "the", "du", "de", "des", "d", "et", "a", "au", "aux"}
_VENUE_NOISE = {"paris", "france", "salle"}  # "salle" is too generic to discriminate


def _fold(text: Optional[str]) -> str:
    t = unidecode(text or "").lower()
    t = t.replace("&", " et ")
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def normalize_venue_name(name: Optional[str]) -> str:
    """'Le Grand Rex' → 'grand rex'; 'Théâtre de la Ville - Paris' → 'theatre ville'."""
    folded = _fold(name)
    # drop arrondissement suffixes like "paris 11e", "75011"
    folded = re.sub(r"\b75\d{3}\b|\b\d{1,2}(e|er|eme)\b", " ", folded)
    words = [w for w in folded.split() if w not in _ARTICLES and w not in _VENUE_NOISE]
    out = " ".join(words).strip()
    return out or folded


_ADDR_ABBREV = {
    "bd": "boulevard", "boul": "boulevard", "blvd": "boulevard",
    "av": "avenue", "ave": "avenue",
    "pl": "place", "fg": "faubourg", "fbg": "faubourg", "faub": "faubourg",
    "st": "saint", "ste": "sainte", "r": "rue", "imp": "impasse", "pass": "passage",
    "sq": "square", "quai": "quai", "crs": "cours", "che": "chemin", "rte": "route",
}


def normalize_address(address: Optional[str]) -> str:
    """'12 bd de la Villette, 75019 Paris' → '12 boulevard villette'."""
    t = _fold(address)
    t = re.sub(r"\b\d{5}\b", " ", t)  # postcode
    words = []
    for w in t.split():
        w = _ADDR_ABBREV.get(w, w)
        if w in _ARTICLES or w in {"paris", "france", "cedex"}:
            continue
        words.append(w)
    return " ".join(words).strip()


_TITLE_NOISE = {
    "concert", "spectacle", "exposition", "expo", "complet", "live", "en", "guest", "guests",
    "invites", "invite", "presente", "presentent", "paris", "tournee", "tour", "nouveau",
    "nouvelle", "date", "dates", "supplementaire", "derniere", "dernieres",
}


def dedup_title(title: Optional[str]) -> str:
    """Normalized title for cross-source comparison."""
    t = unidecode(title or "").lower()
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", t)  # (complet), [VOST]
    t = re.sub(r"\b(19|20)\d{2}\b", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    words = [w for w in t.split() if w not in _ARTICLES and w not in _TITLE_NOISE]
    return " ".join(words).strip() or re.sub(r"\s+", " ", t).strip()


def _trigrams(text: str) -> Set[str]:
    grams: Set[str] = set()
    for word in re.findall(r"[a-z0-9]+", _fold(text)):
        padded = f"  {word} "
        for i in range(len(padded) - 2):
            grams.add(padded[i: i + 3])
    return grams


def trigram_similarity(a: Optional[str], b: Optional[str]) -> float:
    """Same definition as PostgreSQL pg_trgm similarity()."""
    ga, gb = _trigrams(a or ""), _trigrams(b or "")
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    try:
        lat1, lng1, lat2, lng2 = map(float, (lat1, lng1, lat2, lng2))
    except (TypeError, ValueError):
        return float("inf")
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
