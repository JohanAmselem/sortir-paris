"""
Auto-generate rich keywords from event data for improved search relevance.
Used during ingestion to enrich Meilisearch documents.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

from unidecode import unidecode


def _fold(text: str) -> str:
    return unidecode(text or "").lower()


@lru_cache(maxsize=4096)
def _term_re(term: str):
    return re.compile(r"(?<![a-z0-9])" + re.escape(_fold(term)) + r"(?![a-z0-9])")


def _has(term: str, folded_text: str) -> bool:
    """Whole-word, accent-insensitive match (no more 'rap' in 'rapide')."""
    return bool(_term_re(term).search(folded_text))

# ─── Comprehensive French cultural keyword dictionaries ───

GENRE_MUSIC = {
    "jazz": ["jazz", "swing", "bebop", "bossa", "manouche", "free jazz", "big band", "improvisation jazz"],
    "rock": ["rock", "indie", "garage", "grunge", "punk rock", "rock alternatif", "post-rock"],
    "pop": ["pop", "synth-pop", "indie pop", "electro-pop", "dream pop", "k-pop"],
    "electro": ["electro", "techno", "house", "deep house", "drum and bass", "trance", "ambient", "dubstep", "minimal"],
    "hip-hop": ["hip-hop", "hip hop", "rap", "trap", "drill", "boom bap", "freestyle", "slam", "spoken word"],
    "classique": ["classique", "orchestre", "symphonique", "symphonie", "chambre", "quatuor", "sonate", "concerto", "baroque", "opera", "opéra", "lyrique", "choeur", "chorale"],
    # "hardcore" alone is ambiguous (hardcore rap, hardcore techno): only explicit forms.
    "metal": ["metal", "heavy metal", "death metal", "black metal", "thrash metal", "doom metal", "metalcore",
              "hardcore punk", "nu metal", "stoner", "sludge", "grindcore", "deathcore", "post-metal"],
    "soul": ["soul", "funk", "r&b", "rnb", "neo-soul", "motown", "disco", "groove"],
    "reggae": ["reggae", "dub", "dancehall", "ska", "ragga"],
    "blues": ["blues", "delta blues", "chicago blues"],
    "folk": ["folk", "acoustique", "singer-songwriter", "country", "bluegrass", "americana"],
    "chanson": ["chanson", "chanson française", "variété", "francophone"],
    "world": ["world", "musique du monde", "afrobeat", "afro", "salsa", "cumbia", "fado", "flamenco", "oriental", "gnawa", "zouk", "latin", "brésilien"],
}

GENRE_ART = {
    "contemporain": ["art contemporain", "contemporain", "installation", "art numérique", "performance"],
    "photo": ["photographie", "photo", "photographe", "argentique"],
    "peinture": ["peinture", "tableau", "toile", "huile", "aquarelle", "acrylique"],
    "sculpture": ["sculpture", "sculpteur", "modelage", "céramique"],
    "street-art": ["street art", "graffiti", "fresque", "mural", "urbain"],
    "impressionnisme": ["impressionnisme", "impressionniste"],
}

GENRE_THEATRE = {
    "comedie": ["comédie", "comique", "humour", "drôle", "rire", "burlesque", "vaudeville"],
    "drame": ["drame", "dramatique", "tragédie", "tragique"],
    "impro": ["improvisation", "impro", "match impro"],
    "stand-up": ["stand-up", "stand up", "one man show", "one woman show", "seul en scène", "sketch"],
    "jeune": ["jeune public", "enfants", "familial", "conte", "conteur"],
    "musical": ["comédie musicale", "musical", "opérette", "cabaret"],
}

GENRE_DANSE = {
    "contemporaine": ["danse contemporaine", "modern dance"],
    "classique": ["ballet", "danse classique", "pointes"],
    "hip-hop-danse": ["breakdance", "break", "bboy", "krump", "popping", "locking", "voguing"],
    "sociale": ["salsa", "tango", "bachata", "kizomba", "lindy hop", "rock acrobatique"],
}

AMBIANCE_KEYWORDS = {
    "romantique": ["romantique", "amoureux", "couple", "saint-valentin", "intime"],
    "festif": ["festif", "fête", "party", "soirée", "dansant", "clubbing", "nuit", "nocturne"],
    "chill": ["chill", "détente", "relaxant", "zen", "calme", "lounge"],
    "familial": ["famille", "enfants", "kids", "jeune public", "tout public", "ludique"],
    "underground": ["underground", "alternatif", "off", "indé", "indépendant", "squat", "friche"],
    "pleinair": ["plein air", "extérieur", "jardin", "parc", "terrasse", "rooftop", "balade"],
    "immersif": ["immersif", "immersion", "expérience", "interactif", "participatif", "escape game", "réalité virtuelle"],
}

CATEGORY_ENRICHMENT = {
    "concerts": ["concert", "musique", "live", "scène", "artiste", "musicien", "groupe", "chanteur"],
    "expos": ["exposition", "expo", "art", "artiste", "oeuvre", "vernissage", "galerie", "musée"],
    "theatre": ["théâtre", "pièce", "spectacle", "acteur", "mise en scène", "représentation"],
    "cinema": ["cinéma", "film", "projection", "réalisateur", "séance", "ciné"],
    "festivals": ["festival", "programmation", "lineup", "affiche", "scène", "plein air"],
    "conferences": ["conférence", "débat", "rencontre", "discussion", "table ronde", "masterclass"],
    "danse": ["danse", "chorégraphie", "chorégraphe", "danseur", "mouvement", "ballet"],
    "spectacles": ["spectacle", "scène", "artiste", "performance", "show"],
    "ateliers": ["atelier", "workshop", "cours", "stage", "formation", "créatif", "DIY"],
    "visites": ["visite", "guidée", "balade", "parcours", "patrimoine", "histoire", "architecture", "découverte"],
    "sport": ["sport", "activité physique", "entraînement", "bien-être", "santé"],
}


def extract_keywords(
    title: str,
    description: Optional[str] = None,
    short_desc: Optional[str] = None,
    category_slug: Optional[str] = None,
    venue_name: Optional[str] = None,
    is_free: bool = False,
    tags: Optional[list] = None,
) -> list[str]:
    """Keywords for search: the genres/terms actually found in the event text and
    in the source's own genre tags (e.g. Ticketmaster "Rock, Metal").

    Only the matched term and its genre name are added. Adding every sibling term of
    a family (the old behaviour) tagged a hip-hop night "black metal, death metal…" as
    soon as "hardcore" appeared, and a "metal" search returned mostly non-metal events.
    """
    keywords = set()
    text = _fold(f"{title} {short_desc or ''} {description or ''} {' '.join(tags or [])}")
    full_text = f"{text} {_fold(venue_name or '')}"

    # 1. Genre-specific keywords
    all_genres = {
        **GENRE_MUSIC,
        **GENRE_ART,
        **GENRE_THEATRE,
        **GENRE_DANSE,
    }
    for genre, terms in all_genres.items():
        for term in terms:
            if _has(term, full_text):
                keywords.add(genre)
                keywords.add(term)

    # 2. Ambiance keywords (same rule: what was found + the ambiance name)
    for ambiance, terms in AMBIANCE_KEYWORDS.items():
        for term in terms:
            if _has(term, full_text):
                keywords.add(ambiance)
                keywords.add(term)

    # 3. Category enrichment
    if category_slug and category_slug in CATEGORY_ENRICHMENT:
        for term in CATEGORY_ENRICHMENT[category_slug]:
            keywords.add(term)

    # 4. Free-related
    if is_free:
        keywords.update(["gratuit", "entrée libre", "free", "bon plan", "sortie gratuite"])

    # 5. Time-related
    if _has("nocturne", text) or _has("nuit", text):
        keywords.update(["nocturne", "soirée", "nuit"])
    if _has("brunch", text) or _has("matin", text):
        keywords.update(["brunch", "matinée", "matin"])

    return [k for k in sorted(keywords) if len(k) >= 2]


def keywords_to_search_string(keywords: list[str]) -> str:
    """Join keywords into a flat searchable string for Meilisearch."""
    return " ".join(keywords)
