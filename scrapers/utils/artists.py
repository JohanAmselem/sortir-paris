"""
Artists of an event (table event_artists, packages/db/sql/0010_artist_alerts.sql).

artist_key(name): the key members follow (user_follows kind 'artist', term = key).
  unidecode → lower case → every non-alphanumeric character becomes a space → spaces
  collapsed → trimmed; valid when 2 to 80 characters (else None).
  MUST stay identical to the TypeScript rule (apps/web/src/lib/artists.ts).

extract_artists(title, category_slug, artists=None, venue_name=None) → [(name, origin)]
  - names given by the source (Ticketmaster attractions, JSON-LD performer, Bandsintown
    lineup) come first, origin 'source', for every category;
  - otherwise, for music events only (concerts / festivals / soirees), the title is
    split into a line-up ("WUCAN + Holystone, en concert à Paris" → WUCAN, Holystone),
    origin 'title'. Conservative: a chunk that looks like a programme, a series, a
    genre or a venue is dropped ("Concert de Metal Symphonique" → nothing).
"""

from __future__ import annotations

import re
from typing import Iterable, List, Optional, Tuple

from unidecode import unidecode

MUSIC_CATEGORIES = frozenset({"concerts", "festivals", "soirees"})
MAX_NAME_LEN = 60
MAX_WORDS = 6

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def artist_key(name: Optional[str]) -> Optional[str]:
    """'Beyoncé' → 'beyonce'; 'AC/DC' → 'ac dc'; None when < 2 or > 80 characters."""
    if not name:
        return None
    key = _NON_ALNUM.sub(" ", unidecode(str(name)).lower()).strip()
    return key if 2 <= len(key) <= 80 else None


# ── source-provided names that are not artists ──
_PLACEHOLDER_KEYS = {
    "no information", "n a", "na", "tba", "tbc", "tbd", "guest", "guests", "special guest",
    "special guests", "invite", "invites", "invite surprise", "various artists", "artistes divers",
    "divers artistes", "artiste", "artistes", "line up", "lineup", "undefined", "unknown", "inconnu",
}

# ── title parsing ──
_DASHES = re.compile(r"\s+[–—―‐|⎜•·]\s+|\s+-\s+")
_BRACKETS = re.compile(r"\[[^\]]*\]")
_TRAILING_PARENS = re.compile(r"\s*\([^()]*\)\s*$")
_HASHTAG = re.compile(r"(?:^|\s)#[^\s#]*(?:\s+[A-Za-zÀ-ÿ0-9][^\s#]*)*")  # "#Jazz Sur Seine 2026"
_GUESTS_COLON = re.compile(r"\s*\+?\s*(?:special\s+)?guests?\s*:\s*", re.I)
_EN_CONCERT = re.compile(r"[\s,]*\b(?:en|in)\s+(?:concert|live|showcase|tourn[ée]e|dj set)\b[^+]*", re.I)
_SEPARATORS = re.compile(
    r"\s+\+\s+|\s*\+\s*(?=[A-ZÀ-Þ0-9])|\s+x\s+|\s+&\s+|\s*,\s+|\s+/\s+|\s+feat\.?\s+|\s+ft\.?\s+|"
    r"\s+featuring\s+|\s+invitent?\s+|\s+avec\s+|\s+with\s+|\s+w/\s*|\s+b2b\s+|\s+vs\.?\s+",
    re.I,
)
# "Kayhan Kalhor et Kiya Tabassian" = two artists, "Mike et Riké" = one duo name.
_ET = re.compile(r"\s+(?:et|and)\s+(?=[A-ZÀ-Þ])")
_JR = re.compile(r",?\s+(jr|sr)\.?(?=$|\s|,)", re.I)
_AT_VENUE = re.compile(r"\s+@\s*.*$")
_A_VENUE = re.compile(r"\s+(?:à|au|aux)\s+(?:la\s+|le\s+|les\s+|l['’]\s*)?(?=[A-ZÀ-Þ0-9]).*$")
_SUFFIXES = re.compile(
    r"(?:\s*[-,:]?\s*\b(?:\+\s*)?(?:special guests?|guests?|invit[ée]s?(?: surprise)?|and more|& more|"
    r"and friends|& friends|dj set|live set|live|release party|album release|sortie d['’]album|"
    r"complet|sold out|annul[ée]|report[ée]|nouvelle date|date suppl[ée]mentaire|"
    r"le \d{1,2}(?:er)? [a-zéû]+(?: \d{4})?|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|20\d\d|"
    r"!+))+\s*$",
    re.I,
)
_PREFIXES = re.compile(
    r"^(?:concert\s*(?:de|du|des|d['’])\s*|sortie d['’]album\s*(?:de|du|d['’])?\s*|"
    r"release party\s*(?:de|du|d['’])?\s*|showcase\s*(?:de|du|d['’])?\s*|r[ée]cital\s*(?:de|du|d['’])\s*)",
    re.I,
)
_STRIP = " -–—:,;!?¡¿\"'«»“”"
_TRAILING_INSTRUMENT = re.compile(
    r"[\s,]+(?:piano|violon|violoncelle|alto|orgue|guitare|clavecin|harpe|fl[uû]te|saxophone|"
    r"trompette|contre-t[ée]nor|soprano|mezzo(?:-soprano)?|baryton|t[ée]nor|chant|voix)$",
    re.I,
)

# A chunk containing one of these words is a programme / series / venue, not an artist.
_GENERIC_WORDS = {
    "concert", "concerts", "soiree", "soirees", "jam", "jams", "session", "sessions", "open mic",
    "scene ouverte", "festival", "festivals", "musee", "party", "night", "nights", "nuit", "nuits",
    "hommage", "tribute", "show", "experience", "karaoke", "bingo", "blind test", "clubbing",
    "edition", "celebration", "spectacle", "cine concert", "masterclass", "atelier", "ateliers",
    "conference", "visite", "recital", "symphonie", "symphonies", "symphonique", "requiem",
    "messe", "concerto", "stabat", "saisons", "noel", "christmas", "halloween", "nouvel an",
    "programme", "guest", "guests", "friends", "invites", "candlelight", "gala", "bal", "boum",
    "fete", "apero", "brunch", "release", "album", "tour", "tournee", "anniversaire", "birthday",
    "best of", "classiques", "hits", "lundis", "mardis", "mercredis", "jeudis", "vendredis",
    "samedis", "dimanches", "musicaux", "musicales", "jazz club", "club", "salon", "dj set",
    "live", "more", "complet", "programmation", "cabaret", "drag", "quiz", "brocante",
    "orchestre de", "orchestre national", "philharmonie", "olympia", "bataclan", "zenith",
    "cigale", "maroquinerie", "arena", "cathedrale", "eglise", "chapelle", "basilique",
    "plein air", "dansant", "dansante", "danse", "carnaval", "marathon", "matinee", "apres midi",
    "after", "warm up", "closing", "opening", "residency", "residence", "takeover", "showcase",
    "battle", "contest", "tremplin", "audition", "concours", "chorale", "choral", "heritage",
    "special", "carte blanche", "legende", "legendes", "story", "raconte", "sonate", "sonates",
    "kiosque", "evaluation", "chante", "joue", "interprete", "autour de",
}
_GENERIC_RE = re.compile(r"\b(?:" + "|".join(sorted((re.escape(w) for w in _GENERIC_WORDS), key=len, reverse=True)) + r")\b")

# A chunk starting with a genre word ("Metal Symphonique", "Jazz from NY") is a description.
_GENRE_WORDS = {
    "metal", "rock", "jazz", "pop", "electro", "electronique", "techno", "house", "disco", "classique",
    "baroque", "gospel", "blues", "rap", "hip", "reggae", "funk", "soul", "k pop", "kpop", "salsa",
    "tango", "musique", "musiques", "chanson", "chansons", "punk", "folk", "world", "afro",
    "latino", "latin", "dub", "drum", "trance", "hardcore", "indie", "lyrique", "opera", "operette",
    "piano", "orgue", "violon", "guitare", "chant", "chants", "chorale", "swing", "manouche",
    "flamenco", "fado", "rnb", "r b", "variete", "zouk", "kizomba", "bachata", "dancehall",
    "amapiano", "groove",
}
# Composers in classical programmes ("Verdi : Requiem", "Beethoven, Dvorak & Korngold") are
# not the performers members want alerts for.
_COMPOSERS = {
    "bach", "js bach", "j s bach", "beethoven", "mozart", "vivaldi", "verdi", "liszt", "chopin",
    "debussy", "ravel", "haendel", "handel", "schubert", "schumann", "brahms", "tchaikovski",
    "tchaikovsky", "mahler", "dvorak", "korngold", "bizet", "puccini", "rossini", "wagner", "haydn",
    "mendelssohn", "rachmaninov", "rachmaninoff", "satie", "faure", "saint saens", "berlioz",
    "stravinsky", "prokofiev", "chostakovitch", "shostakovich", "strauss", "offenbach", "gershwin",
    "piazzolla", "astor piazzolla", "albinoni", "pergolese", "monteverdi", "purcell", "telemann",
    "rameau", "lully", "couperin", "scarlatti", "paganini", "grieg", "sibelius", "elgar", "bartok",
    "poulenc", "gounod", "massenet", "bruckner", "franck", "borodine", "moussorgski", "smetana",
    "janacek", "messiaen", "pärt", "part", "glass", "philip glass", "ennio morricone", "morricone",
    "hans zimmer", "john williams",
}
_STOP_START = {
    "dans", "du", "des", "en", "pour", "sur", "a", "au", "aux", "entre", "autour", "sous", "vers",
    "quand", "avec", "chez", "une", "un", "the best", "le meilleur", "la grande", "le grand",
    "spectacle", "soiree", "concert", "visite", "vivez", "venez", "decouvrez",
}
_REJECT_KEYS = {"paris", "ile de france", "france", "live", "dj", "guest", "guests", "mc", "trio", "duo",
                "quartet", "quintet", "ensemble", "orchestre", "choeur", "big band", "and more", "more",
                "djs", "dj", "mcs", "jr", "sr"}
_YEAR = re.compile(r"\b(?:19|20)\d\d\b")


def _is_artist_chunk(name: str, venue_key: Optional[str], title_has_upper: bool) -> bool:
    if not name or len(name) > MAX_NAME_LEN:
        return False
    key = artist_key(name)
    if not key or key in _REJECT_KEYS or key in _PLACEHOLDER_KEYS or key in _COMPOSERS:
        return False
    words = key.split()
    if len(words) > MAX_WORDS:
        return False
    if len(key.replace(" ", "")) < 2:
        return False
    if venue_key and (key == venue_key or key in venue_key.split(" - ")):
        return False
    if _GENERIC_RE.search(key):
        return False
    if words[0] in _GENRE_WORDS or " ".join(words[:2]) in _GENRE_WORDS:
        return False
    if words[0] in _STOP_START or " ".join(words[:2]) in _STOP_START:
        return False
    if _YEAR.search(key) and len(words) > 1:
        return False  # "BOUM 1986", "Festival 2026"
    if title_has_upper and name[0].islower():
        return False  # "confidences et passions", "les Classiques"
    if not re.search(r"[A-Za-zÀ-ÿ]", name) or name.count("(") != name.count(")"):
        return False
    return True


def _clean_chunk(chunk: str) -> str:
    c = re.sub(r"\.{2,}|…", " ", chunk).strip(_STRIP)
    c = _AT_VENUE.sub("", c)
    c = _EN_CONCERT.sub("", c)
    for _ in range(3):
        before = c
        c = _TRAILING_PARENS.sub("", c)
        c = _SUFFIXES.sub("", c).strip(_STRIP)
        c = _TRAILING_INSTRUMENT.sub("", c)
        c = _PREFIXES.sub("", c)
        if c == before:
            break
    c = _A_VENUE.sub("", c)
    return re.sub(r"\s+", " ", c).strip(_STRIP)


def _split(text: str) -> List[str]:
    out = []
    for raw in _SEPARATORS.split(text):
        parts = _ET.split(raw)
        if len(parts) > 1 and all(len(x.split()) >= 2 for x in parts):
            out.extend(parts)
        else:
            out.append(raw)
    return [p for p in (_clean_chunk(x) for x in out) if p]


def _looks_generic(part: str) -> bool:
    key = artist_key(_clean_chunk(part)) or ""
    words = key.split()
    return (not key or bool(_GENERIC_RE.search(key)) or (words and words[0] in _GENRE_WORDS)
            or bool(re.search(r"#|\[\d|\b\d+\b|curator|presents?|pr[ée]sente", part, re.I)))


def _title_artists(title: str, venue_key: Optional[str]) -> List[str]:
    t = re.sub(r"\s+", " ", title or "").strip()
    if not t:
        return []
    has_upper = any(ch.isupper() for ch in t)
    t = _BRACKETS.sub(" ", t)
    t = _TRAILING_PARENS.sub("", t)  # "(Samba+DJS)", "( Yunglegend/Copilote/Ran... )"
    t = _JR.sub(lambda m: f" {m.group(1)}.", t)  # "Leslie Odom, JR." is one name
    t = _GUESTS_COLON.sub(" + ", t)
    t = _HASHTAG.sub(" ", t)
    t = _EN_CONCERT.sub("", t)  # "X en concert à Paris : nouvelle date" → "X"
    t = re.sub(r"\s+", " ", t).strip(" -–—:,;")

    # "Series : line-up" or "Artist : tour / programme"
    if re.search(r"\s:\s|:\s", t):
        left, right = re.split(r"\s*:\s+", t, maxsplit=1)
        lineup = len([x for x in _SEPARATORS.split(right) if x.strip()]) >= 2
        if _TRAILING_INSTRUMENT.search(left):
            t = left  # "Frank Braley, piano : Beethoven, Dvorak & Korngold"
        elif _looks_generic(left) or lineup:
            t = right
        else:
            t = left
    # "Artist - venue / tour" or "Series - Artist"
    parts = [p for p in _DASHES.split(t) if p.strip()]
    if len(parts) > 1:
        left_is_lineup = len([x for x in _SEPARATORS.split(parts[0]) if x.strip()]) >= 2
        t = parts[1] if (not left_is_lineup and _looks_generic(parts[0])
                         and not _looks_generic(parts[1])) else parts[0]

    out: List[str] = []
    for chunk in _split(t):
        if _is_artist_chunk(chunk, venue_key, has_upper):
            out.append(chunk)
    return out


def extract_artists(
    title: Optional[str],
    category_slug: Optional[str],
    artists: Optional[Iterable[str]] = None,
    venue_name: Optional[str] = None,
) -> List[Tuple[str, str]]:
    """[(name, origin)], unique by artist_key, source names first."""
    venue_key = artist_key(venue_name)
    out: List[Tuple[str, str]] = []
    seen = set()

    def add(name: str, origin: str) -> None:
        name = re.sub(r"\s+", " ", name or "").strip()[:120]
        key = artist_key(name)
        if not key or key in seen or key in _PLACEHOLDER_KEYS or key == venue_key:
            return
        seen.add(key)
        out.append((name, origin))

    for name in artists or []:
        if isinstance(name, str) and len(name.strip()) <= 120:
            add(name, "source")
    if out:
        return out  # the source knows its line-up better than our title parsing
    if category_slug in MUSIC_CATEGORIES and title:
        for name in _title_artists(title, venue_key):
            add(name, "title")
    return out
