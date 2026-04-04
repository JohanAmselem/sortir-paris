"""
Auto-generate rich keywords from event data for improved search relevance.
Used during ingestion to enrich Meilisearch documents.
"""

import re
from typing import Optional

# ─── Comprehensive French cultural keyword dictionaries ───

GENRE_MUSIC = {
    "jazz": ["jazz", "swing", "bebop", "bossa", "manouche", "free jazz", "big band", "improvisation jazz"],
    "rock": ["rock", "indie", "garage", "grunge", "punk rock", "rock alternatif", "post-rock"],
    "pop": ["pop", "synth-pop", "indie pop", "electro-pop", "dream pop", "k-pop"],
    "electro": ["electro", "techno", "house", "deep house", "drum and bass", "trance", "ambient", "dubstep", "minimal"],
    "hip-hop": ["hip-hop", "hip hop", "rap", "trap", "drill", "boom bap", "freestyle", "slam", "spoken word"],
    "classique": ["classique", "orchestre", "symphonique", "symphonie", "chambre", "quatuor", "sonate", "concerto", "baroque", "opera", "opéra", "lyrique", "choeur", "chorale"],
    "metal": ["metal", "heavy metal", "death metal", "black metal", "doom", "hardcore", "metalcore"],
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
    "stand-up": ["stand-up", "stand up", "one man show", "one woman show", "seul en scène", "solo", "sketch"],
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
) -> list[str]:
    """Extract rich keywords from event data for Meilisearch."""
    keywords = set()
    text = f"{title} {short_desc or ''} {description or ''}".lower()
    full_text = f"{text} {venue_name or ''}".lower()

    # 1. Genre-specific keywords
    all_genres = {
        **GENRE_MUSIC,
        **GENRE_ART,
        **GENRE_THEATRE,
        **GENRE_DANSE,
    }
    for genre, terms in all_genres.items():
        for term in terms:
            if term.lower() in full_text:
                keywords.add(genre)
                for related in terms:
                    if len(related) >= 3:
                        keywords.add(related)
                break

    # 2. Ambiance keywords
    for ambiance, terms in AMBIANCE_KEYWORDS.items():
        for term in terms:
            if term.lower() in full_text:
                keywords.add(ambiance)
                for related in terms:
                    keywords.add(related)
                break

    # 3. Category enrichment
    if category_slug and category_slug in CATEGORY_ENRICHMENT:
        for term in CATEGORY_ENRICHMENT[category_slug]:
            keywords.add(term)

    # 4. Free-related
    if "gratuit" in text or "entrée libre" in text:
        keywords.update(["gratuit", "entrée libre", "free", "bon plan", "sortie gratuite"])

    # 5. Time-related
    if "nocturne" in text or "nuit" in text:
        keywords.update(["nocturne", "soirée", "nuit"])
    if "brunch" in text or "matin" in text:
        keywords.update(["brunch", "matinée", "matin"])

    return [k for k in sorted(keywords) if len(k) >= 2]


def keywords_to_search_string(keywords: list[str]) -> str:
    """Join keywords into a flat searchable string for Meilisearch."""
    return " ".join(keywords)
