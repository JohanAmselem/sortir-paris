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


# Words that describe the kind of place rather than which place it is: stripped before
# comparing two venue names ("38 RIV - Jazz Club & Bar" ≈ "38Riv", "Théâtre 71" ≈
# "Malakoff scène nationale – Théâtre 71").
VENUE_GENERIC_WORDS = {
    "theatre", "theatres", "salle", "salles", "paris", "jazz", "club", "bar", "bars", "studio",
    "scene", "scenes", "nationale", "national", "restaurant", "cabaret", "live", "music",
    "musique", "concert", "concerts", "espace", "lieu", "the", "and", "et", "de", "du", "des", "la",
    "le", "les", "l", "d", "a", "au", "aux", "en", "france", "idf", "ile", "spectacle", "spectacles",
    "officiel", "official", "venue", "arena",
}
# Keys too generic to merge on the name alone (needs the same spot).
VENUE_GENERIC_KEYS = {
    "mairie", "mediatheque", "bibliotheque", "eglise", "gymnase", "parc", "square", "jardin",
    "fetes", "centreculturel", "centre", "culturel", "auditorium", "conservatoire", "cinema",
    "maisonquartier", "maison", "galerie", "musee", "chapelle", "temple", "stade", "piscine",
    "kiosque", "place", "cour", "foyer", "atelier", "ateliers", "librairie", "grandesalle",
    "petitesalle", "salledesfetes", "hall", "jardins", "theatre", "salle",
}
_VENUE_SEPARATORS = re.compile(r"\s+[-–—|:/]\s+|\s*[|/]\s*|\s+[–—]\s*|\s*[–—]\s+|\(")


def venue_tokens(name: Optional[str]) -> list:
    """Distinctive tokens of a venue name, in order, each once (generic words, postcodes,
    arrondissements and a trailing "à <town>" removed)."""
    folded = _fold(name)
    words = folded.split()
    if " a " in f" {folded} ":  # "La Seine Musicale à Boulogne-Billancourt"
        head = folded.rsplit(" a ", 1)[0].split()
        if len([w for w in head if w not in VENUE_GENERIC_WORDS]) >= 2:
            words = head
    out = []
    for w in words:
        if w in VENUE_GENERIC_WORDS or re.fullmatch(r"75\d{3}|9[234]\d{3}|\d{1,2}(e|er|eme)", w):
            continue
        if w not in out:
            out.append(w)
    return out


def venue_key(name: Optional[str]) -> str:
    """Compact comparison key: '38 RIV - Jazz Club & Bar' → '38riv', '38Riv' → '38riv',
    'THEATRE MARIGNY - STUDIO MARIGNY' → 'marigny' (tokens sorted: word order is ignored)."""
    return "".join(sorted(venue_tokens(name)))


# Outdoor spots / transport named after a nearby building: never the building itself
# ("Place du Châtelet" is not "Théâtre du Châtelet").
_PLACE_TYPE_WORDS = {"place", "square", "parvis", "rue", "quai", "quais", "berges", "metro", "station",
                     "gare", "jardin", "jardins", "parc", "pont", "esplanade", "avenue", "boulevard",
                     "rampe", "port", "bassin", "canal"}


def venue_name_parts(name: Optional[str]) -> list:
    """'La Seine Musicale - Grande Seine' → ['La Seine Musicale', 'Grande Seine']."""
    return [p.strip(" )") for p in _VENUE_SEPARATORS.split(name or "") if p and p.strip(" )")]


def venue_names_compatible(a: Optional[str], b: Optional[str], min_sim: float = 0.5) -> bool:
    """Do two names designate the same place (given they are at the same spot)?

    True when the distinctive tokens of one are contained in the other's (or their compact
    keys contain each other), or their trigram similarity ≥ min_sim — unless one is a
    hall of a complex: a ' - <hall>' suffix whose distinctive words the other name lacks
    ('La Seine Musicale - Grande Seine' ≠ 'La Seine Musicale - Auditorium' ≠ 'La Seine
    Musicale')."""
    ka, kb = venue_key(a), venue_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    ta, tb = set(venue_tokens(a)), set(venue_tokens(b))
    if bool(ta & _PLACE_TYPE_WORDS) != bool(tb & _PLACE_TYPE_WORDS):
        return False
    na, nb = {w for w in ta if w.isdigit()}, {w for w in tb if w.isdigit()}
    if na and nb and na != nb:
        return False  # "17 rue X" ≠ "19 rue X", "Atelier 77" ≠ "Atelier 78"
    if ka in VENUE_GENERIC_KEYS or kb in VENUE_GENERIC_KEYS:
        return False  # a bare "Galerie" / "Mairie" is not "Galerie Sato"
    for name, other in ((a, tb), (b, ta)):
        parts = venue_name_parts(name)
        prefix = set(venue_tokens(parts[0])) if parts else set()
        for suffix in parts[1:]:
            st = set(venue_tokens(suffix))
            if st and not st <= other and prefix & other:
                return False  # "<complex> - <hall>" and the other name lacks that hall
    if ta <= tb or tb <= ta:
        return True
    short, long_ = sorted((ka, kb), key=len)
    if len(short) >= 4 and short in long_:
        return True
    return trigram_similarity(" ".join(venue_tokens(a)), " ".join(venue_tokens(b))) >= min_sim


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
    """Normalized title for cross-source comparison (dates, COMPLET/ANNULÉ markers and
    editorial tails such as "… en concert à Paris au Bataclan le 9 octobre" removed)."""
    from utils.titles import strip_for_matching

    t = unidecode(strip_for_matching(title)).lower()
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
