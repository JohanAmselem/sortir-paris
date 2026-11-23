"""
Title clean-up shared by validation (display titles) and matching (dedup / series keys).

- strip_date_affixes: "09.OCT | PARIS | Fakear" → "Fakear";
  "Jeanne Lee par Äulne – 09/10/2026 - 17:30" → "Jeanne Lee par Äulne".
- title_flags: "(ANNULÉ)" / "Reporté" → cancelled; "COMPLET" / "sold out" → sold out
  (the marker is removed from the title).
- smart_title_case: "LES 4 SAISONS DE VIVALDI" → "Les 4 Saisons de Vivaldi"
  (only applied to mostly upper-case strings; acronyms such as DJ, UGC, MK2, XIV kept).
- strip_for_matching: strip_date_affixes + editorial tails
  ("… en concert à Paris au Bataclan le 9 octobre 2026") — comparison only, never displayed.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

from unidecode import unidecode

_MONTHS = (
    r"janv(?:ier)?|f[eé]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept?(?:embre)?|"
    r"oct(?:obre)?|nov(?:embre)?|d[eé]c(?:embre)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    r"june?|july?|aug(?:ust)?|october|november|december"
)
_DAYS = r"lun(?:di)?|mar(?:di)?|mer(?:credi)?|jeu(?:di)?|ven(?:dredi)?|sam(?:edi)?|dim(?:anche)?"
_NUM_DATE = r"\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?"
_TXT_DATE = rf"(?:(?:{_DAYS})\.?\s+)?\d{{1,2}}(?:er)?[\s.]*(?:{_MONTHS})\.?(?:\s+\d{{4}})?"
_TIME = r"\d{1,2}\s*(?:[:h]\s*\d{2}|h)"
_DATE_ANY = rf"(?:{_NUM_DATE}|{_TXT_DATE})"
_SEP = r"\s*[–—\-|•·,:/@]\s*"

# Trailing " – 09/10/2026 - 17:30", " - 9 octobre 2026 à 20h", " (09/10/2026)", " | 09.10"
_DATE_SUFFIX_RE = re.compile(
    rf"(?:{_SEP}|\s+)(?:le\s+|du\s+)?\(?\s*{_DATE_ANY}(?:\s*(?:{_SEP}|\s+|à\s+|a\s+)?{_TIME})?\s*\)?\s*$",
    re.I,
)
_TIME_SUFFIX_RE = re.compile(rf"{_SEP}{_TIME}\s*$", re.I)
# Leading "09.OCT | PARIS | ", "09/10/2026 - ", "Ven. 9 octobre : "
_CITY_WORDS = {"paris", "france", "idf", "ile de france", "ile-de-france"}
_DATE_PREFIX_RE = re.compile(rf"^\s*\(?{_DATE_ANY}(?:\s*{_TIME})?\)?\s*[|–—\-:•·]\s*", re.I)

# Editorial tails (matching only): "en concert à Paris…", "au Bataclan le …", "à l'Olympia en 2026"
_EDITORIAL_TAIL_RE = re.compile(
    r"\s+(?:en\s+(?:concert|showcase|live|spectacle|tournee|tournée|dj set)\b.*"
    r"|(?:a|à)\s+paris\b.*"
    r"|(?:au|a\s+la|à\s+la|a\s+l'|à\s+l'|à\s+l’|a\s+l’)\s+[^,]{2,60}\s+le\s+\d{1,2}(?:er)?\s+\w+.*)$",
    re.I,
)

# "reporté" / "postponed" is NOT a cancellation: the event usually has a new date.
_CANCEL_WORDS = r"annul[ée]e?s?|cancell?ed"
_SOLD_OUT_WORDS = r"complet|sold[\s-]?out"
_BRACKET_FLAG_RE = re.compile(rf"[\(\[]\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*[\)\]]", re.I)
_LEAD_FLAG_RE = re.compile(rf"^\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*[–—\-:|•·/]+\s*", re.I)
_TAIL_FLAG_RE = re.compile(rf"\s*[–—\-:|•·/,]+\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*$", re.I)
_CAPS_FLAG_RE = re.compile(r"(?<![A-Za-zÀ-ÿ])(ANNUL[ÉE]E?S?|CANCELL?ED|COMPLET|SOLD[\s-]?OUT)"
                           r"(?![A-Za-zÀ-ÿ])")
_CANCEL_RE = re.compile(rf"^(?:{_CANCEL_WORDS})$", re.I)
# "Annulé en raison d'un nombre insuffisant de participants. X" → the clause goes
_LEAD_CANCEL_CLAUSE_RE = re.compile(
    r"^\s*annul[ée]e?s?\s+(?:en raison|faute|pour cause|suite|par manque)[^.!]*[.!]\s*", re.I)
# a title that starts with the word: "ANNULÉ Apprendre un mouvement…", "Annulé X"
_LEAD_CANCEL_WORD_RE = re.compile(r"^\s*(?:annul[ée]e?s?|cancell?ed)\s+(?=\S)", re.I)
# "Rencontre annulée : Lilia Hassaine"
_CANCEL_COLON_RE = re.compile(r"\s+annul[ée]e?s?\s*(?=:)", re.I)
# editorial: "Saez à l'Arena : son concert reporté à l'automne 2027" (kept as is, flagged)
_CANCEL_EVENT_RE = re.compile(
    r"\b(?:concerts?|spectacles?|shows?|dates?|repr[ée]sentations?|[ée]v[ée]nements?|soir[ée]es?|matchs?)"
    r"\s+(?:est\s+|sont\s+)?annul[ée]e?s?\b", re.I)


def _tidy(t: str) -> str:
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\(\s*\)|\[\s*\]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.strip(" –—-|•·,:/").strip()


def strip_date_affixes(title: Optional[str]) -> str:
    """Remove a leading date (+ city) prefix and a trailing date/time suffix."""
    t = (title or "").strip()
    if not t:
        return ""
    original = t
    # leading "09.OCT | PARIS | …"
    m = _DATE_PREFIX_RE.match(t)
    if m:
        t = t[m.end():]
        parts = [p for p in re.split(r"\s*\|\s*", t)]
        while len(parts) > 1 and unidecode(parts[0]).strip().lower() in _CITY_WORDS:
            parts.pop(0)
        t = " | ".join(parts)
    # trailing date(s)/time: "– 09/10/2026 - 17:30", "- 18:00"
    for _ in range(2):
        new = _DATE_SUFFIX_RE.sub("", t)
        new = _TIME_SUFFIX_RE.sub("", new) if new != t else new
        if new == t:
            break
        t = new
    t = _tidy(t)
    return t if len(t) >= 2 else original


def title_flags(title: Optional[str]) -> Tuple[str, bool, bool]:
    """→ (title without status markers, cancelled, sold_out)."""
    t = (title or "").strip()
    cancelled = sold_out = False

    def mark(word: str) -> None:
        nonlocal cancelled, sold_out
        if _CANCEL_RE.match(word.strip()) or _CANCEL_RE.match(unidecode(word).strip()):
            cancelled = True
        else:
            sold_out = True

    for rx in (_LEAD_CANCEL_CLAUSE_RE, _CANCEL_COLON_RE):
        if rx.search(t):
            cancelled = True
            t = rx.sub(" ", t, count=1).strip()
    if _CANCEL_EVENT_RE.search(t):
        cancelled = True
    for rx in (_BRACKET_FLAG_RE, _LEAD_FLAG_RE, _TAIL_FLAG_RE):
        while True:
            m = rx.search(t)
            if not m:
                break
            mark(m.group(1))
            t = (t[:m.start()] + " " + t[m.end():]).strip()
    # upper-case marker inside a mixed-case title: "Fakear COMPLET supplémentaire"
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) < 0.7:
        for m in list(_CAPS_FLAG_RE.finditer(t)):
            mark(m.group(1))
        t = _CAPS_FLAG_RE.sub(" ", t)
    if _LEAD_CANCEL_WORD_RE.match(t):
        cancelled = True
        t = _LEAD_CANCEL_WORD_RE.sub("", t, count=1)
    t = _tidy(t)
    return (t if len(t) >= 2 else (title or "").strip()), cancelled, sold_out


# ─────────────────────────── title case ───────────────────────────

_SMALL_WORDS = {
    "de", "du", "des", "la", "le", "les", "et", "à", "a", "au", "aux", "en", "sur", "pour", "par",
    "dans", "avec", "sans", "un", "une", "ou", "chez", "vs", "the", "of", "and", "or", "in", "on",
    "at", "to", "for", "with", "by", "from", "an", "y", "d", "l",
}
_ACRONYMS = {
    "DJ", "MC", "UGC", "MK2", "USA", "UK", "NYC", "RER", "SNCF", "RATP", "BD", "VO", "VF",
    "VOST", "VOSTFR", "OST", "IA", "AI", "LGBT", "LGBTQ", "LGBTQIA", "TV", "CD", "LP", "EP", "PSG",
    "BNF", "MJC", "CNSMD", "R&B", "RNB", "OK", "KO", "SOS", "FM", "XXL", "XL", "BBC", "ONU", "UE",
    "VIP", "NBA", "NFL", "WWE", "MMA", "ABBA", "AC/DC", "ACDC", "UB40", "BTS", "PNL", "SCH", "JUL",
    "IAM", "NTM", "MGMT", "LCD", "XX", "CNRS", "EDF", "IRCAM", "ADN", "UFO",
}
_ROMAN_RE = re.compile(r"^(?=[IVXL])L?X{0,3}(IX|IV|V?I{0,3})$")
_VOWELS = set("AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ")
_WORD_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.U)


def _is_mostly_upper(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) <= 4:
        return False
    return sum(c.isupper() for c in letters) / len(letters) > 0.7


def _keep_upper(word: str) -> bool:
    w = word.upper()
    if w in _ACRONYMS or _ROMAN_RE.match(w):
        return True
    if any(c.isdigit() for c in w) and any(c.isalpha() for c in w):
        return True  # MK2, B2B, UB40
    letters = [c for c in w if c.isalpha()]
    return 1 < len(letters) <= 4 and not any(c in _VOWELS for c in letters)  # PNL, TKT, DJ


def _cap(word: str) -> str:
    return word[:1].upper() + word[1:].lower() if word else word


def _case_word(word: str, first: bool) -> str:
    if _keep_upper(word):
        return word.upper()
    low = word.lower()
    m = re.match(r"^([ldjnsc]|qu|jusqu|lorsqu|puisqu)(['’])(.+)$", low)
    if m:  # l'avare → L'Avare (first) / l'Avare
        prefix = m.group(1).capitalize() if first else m.group(1)
        return prefix + m.group(2) + _case_word(m.group(3), True)
    if not first and low in _SMALL_WORDS:
        return low
    return _cap(low)


def smart_title_case(text: Optional[str]) -> Optional[str]:
    """Title-case a mostly upper-case string (> 70 % upper-case letters, > 4 letters).
    Other strings are returned unchanged."""
    if not text or not _is_mostly_upper(text):
        return text
    out, pos, first = [], 0, True
    for m in _WORD_RE.finditer(text):
        out.append(text[pos:m.start()])
        word = m.group(0)
        # hyphenated compounds are split by the regex: "SAINT-GERMAIN" → each part
        prev = text[m.start() - 1] if m.start() else ""
        out.append(_case_word(word, first or prev in "–—(\"«:|/."))
        first = False
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def strip_for_matching(title: Optional[str]) -> str:
    """Title stripped of dates, status markers and editorial tails (comparison only)."""
    t, _, _ = title_flags(title)
    t = strip_date_affixes(t)
    stripped = _EDITORIAL_TAIL_RE.sub("", t).strip()
    return stripped if len(stripped) >= 2 else t


# ─────────────────── nettoyage d'affichage (lot D, 23/11/2026) ───────────────────
#
# Appliqué à la collecte (validation._clean_title, APRÈS la mise en casse : un nom
# d'artiste en capitales voulues, « KALIKA - L'Olympia » → « KALIKA », n'est jamais
# retouché) et au rattrapage des lignes existantes (tools/backfill_titres.py).
# Règles prudentes : dans le doute, le titre est rendu tel quel.

# Séparateurs d'un suffixe de salle : « Peet - l'Olympia », « MONO @ Cabaret Sauvage »,
# « X | Le Trianon ». Jamais « au » / « à » : « Un soir au Zénith » est un vrai titre.
_VENUE_SUFFIX_SEP_RE = re.compile(r"\s+[-–—|@·•]\s+|\s+@|@\s+")
# Un suffixe fait seulement de ces mots ne désigne pas un lieu précis (« Midi musical -
# Opéra ! », « Exposition … - Mairie du 10e ») : jamais retiré.
_VENUE_WEAK_WORDS = {"opera", "musee", "galerie", "mairie", "eglise", "cinema", "centre", "maison",
                     "bibliotheque", "mediatheque", "conservatoire", "auditorium", "jardin", "parc",
                     "place", "chapelle", "temple", "stade", "cour", "hall", "foyer", "atelier",
                     "ateliers", "librairie", "grande", "petite", "culturel", "fetes", "quartier"}
# Ce qui reste du titre ne doit pas être un mot générique (« Concert - Grande Salle »).
_GENERIC_HEADS = {
    "concert", "concerts", "spectacle", "spectacles", "exposition", "expo", "soiree", "soirée",
    "seance", "séance", "evenement", "événement", "event", "live", "show", "festival", "theatre",
    "théâtre", "danse", "opera", "opéra", "visite", "atelier", "conference", "conférence",
}


def _venue_words(name: Optional[str]) -> set:
    from utils.matching import venue_tokens

    return set(venue_tokens(name))


def _looks_like_venue(suffix: str, venue_names) -> bool:
    from utils.matching import venue_key

    words = _venue_words(suffix)
    if not words or words <= _VENUE_WEAK_WORDS:
        return False  # « - Paris », « - Théâtre », « - Opéra ! » : rien de distinctif
    numbers = set(re.findall(r"\d+", suffix))
    for name in venue_names:
        if not name:
            continue
        vw = _venue_words(name)
        if numbers - set(re.findall(r"\d+", name)):
            continue  # « Mairie du 10e » n'est pas la « Mairie du 20e »
        if vw and (words <= vw or venue_key(suffix) == venue_key(name)):
            return True
    return False


def _balanced(text: str) -> bool:
    """Pas de guillemet ni de parenthèse ouverts : on ne coupe pas au milieu d'un titre cité."""
    return (text.count('"') % 2 == 0 and text.count("«") == text.count("»")
            and text.count("(") == text.count(")") and text.count("[") == text.count("]")
            and text.count("“") == text.count("”"))


def strip_venue_suffix(title: Optional[str], venue_names) -> str:
    """« Peet - l'Olympia » → « Peet » quand la ligne a lieu à L'Olympia ;
    « JOLAGREEN23 - Zénith Paris - la Villette » → « JOLAGREEN23 ».
    Seulement si tous les mots distinctifs du suffixe sont dans le nom du lieu de la
    ligne (venue_names : nom du lieu et de son lieu canonique)."""
    t = (title or "").strip()
    names = [n for n in (venue_names or []) if n]
    if not t or not names:
        return t
    for m in _VENUE_SUFFIX_SEP_RE.finditer(t):
        head, suffix = t[:m.start()].strip(), t[m.end():].strip()
        if not head or not suffix or not _balanced(head):
            continue
        if _looks_like_venue(suffix, names):
            # « AUPINARD au Zénith Paris - La Villette » : la coupe tomberait au milieu du nom
            # du lieu (« Zénith Paris » reste) → on ne coupe pas ici
            tail = set(_venue_words(" ".join(head.split()[-3:])))
            if any(tail & _venue_words(n) for n in names):
                continue
            head = _tidy(head)
            letters = [c for c in head if c.isalpha()]
            if len(letters) >= 2 and unidecode(head).lower() not in {unidecode(w) for w in _GENERIC_HEADS} \
                    and not _looks_like_venue(head, names):
                return head
            return t
    return t


# Ticketmaster vend les forfaits VIP sous un titre « Prestation <artiste> »
# (« Prestation Tori Kelly », « Prestation Hospitalite Muse ») : même concert.
_PRESTATION_RE = re.compile(r"^\s*prestations?\s+(?:hospitalit[ée]s?\s+|vip\s+)?(?:[-–:]\s*)?(?=\S)", re.I)


def strip_prestation_prefix(title: Optional[str]) -> str:
    t = (title or "").strip()
    new = _PRESTATION_RE.sub("", t, count=1).strip()
    if new == t or len([c for c in new if c.isalpha()]) < 2:
        return t
    # « Prestation the Pretty Reckless » → « The Pretty Reckless » (minuscule de la mise en casse)
    return new[:1].upper() + new[1:] if new[:1].islower() else new


# sortiraparis : « X en concert à <lieu> en <mois> <année> », « X, le groupe qui …,
# en concert à … ». « en concert » doit être suivi d'un lieu, d'une date ou de la fin.
# Sensible à la casse : « Disney en Concert » est un titre de spectacle, pas un article.
_SAP_CONCERT_RE = re.compile(
    r"^(?P<name>.+?)\s*,?\s+en\s+concerts?"
    r"(?=\s*$|\s*[:,–—-]|\s+(?:à|a|au|aux|dans|sur|avec|pour|le|les|en|du|des|ce|cet|cette|chez|"
    r"lors|exceptionnel|unique|gratuit|acoustique|live|symphonique)\b)",
)
# Têtes d'article, jamais des noms : « Qui est X, … en concert », « Pourquoi … »
_SAP_QUESTION_RE = re.compile(r"^(?:qui|que|quoi|pourquoi|comment|quand|o[uù]|quel(?:le)?s?)\b", re.I)
# Suffixes de reportage : « … - nos photos », « … : nos photos de l'exposition … »,
# « … : notre critique », « … - notre avis », « …, les photos »
_SAP_REVIEW_TAIL_RE = re.compile(
    r"\s*[-–—:,]\s*(?:(?:nos|les)\s+photos\b.*|notre\s+(?:critique|avis)\s*!?)\s*$", re.I)
# « Drogues : l'exposition du musée de l'Homme … » → « Drogues »
# Pas quand le vrai titre suit (« Institut Giacometti : l'expo Sortir du bois … ») : le mot
# qui suit « l'exposition » doit commencer par une minuscule.
_SAP_EXPO_TAIL_RE = re.compile(r"\s*:\s+l['’]expo(?:sition)?(?:\s+(?=[a-zà-ÿ])|\s*$).*$", re.I)
_SAP_EXPO_NEXT_UPPER_RE = re.compile(r":\s+l['’]expo(?:sition)?\s+[A-ZÀ-Þ]")


def _plausible_name(name: str) -> bool:
    letters = [c for c in name if c.isalpha()]
    return (len(letters) >= 2 and not _SAP_QUESTION_RE.match(name)
            and unidecode(name).lower() not in {unidecode(w) for w in _GENERIC_HEADS})


def sortiraparis_title(title: Optional[str], venue_names=()) -> str:
    """Titre d'article sortiraparis → nom de l'événement, seulement quand c'est sûr.
    Un article de critique ou de sélection (is_editorial_article) est rendu tel quel :
    il est rejeté à la collecte ou rattaché, jamais renommé."""
    t = (title or "").strip()
    if not t or is_editorial_article(t):
        return t
    names = [n for n in (venue_names or []) if n]
    tail = _SAP_REVIEW_TAIL_RE.sub("", t).strip()
    if tail != t and _plausible_name(tail):
        t = tail
    m = _SAP_CONCERT_RE.match(t)
    if m:
        name = m.group("name").strip()
        # « The Pogues, le groupe qui a révolutionné le folk irlandais » : une apposition
        # commence par une minuscule ; « Earth, Wind & Fire » reste entier.
        head, sep, rest = name.partition(",")
        if sep and rest.strip()[:1].islower():
            name = head.strip()
        name = _tidy(name)
        if _plausible_name(name) and ":" not in name and "?" not in name:
            return name
        return t
    if not _SAP_EXPO_NEXT_UPPER_RE.search(t):
        expo = _SAP_EXPO_TAIL_RE.sub("", t).strip()
        # « Palais Galliera : l'exposition mode … » : la tête est le lieu, pas l'expo
        if expo != t and _plausible_name(expo) and len(expo) >= 3 and not _looks_like_venue(expo, names):
            return expo
    return t


def clean_display_title(title: Optional[str], *, source: Optional[str] = None,
                        venue_names=()) -> str:
    """Nettoyage d'affichage à la collecte (après title_flags, strip_date_affixes et la
    mise en casse) : préfixe « Prestation » de Ticketmaster, titres d'article de
    sortiraparis, suffixe de salle redondant. Les capitales ne sont jamais modifiées."""
    t = (title or "").strip()
    if not t:
        return t
    if source == "ticketmaster":
        t = strip_prestation_prefix(t)
    if source == "sortiraparis":
        t = sortiraparis_title(t, venue_names)
    t = strip_venue_suffix(t, venue_names)
    return t


# ─────────────────── articles et jeux concours (lot D) ───────────────────

# Articles éditoriaux (sortiraparis, Que faire à Paris…) : rejetés à la collecte par les
# sources de médias et d'open data, jamais fiche canonique. « On a kidnappé le Père-Noël »,
# « Notre humble avis », « Nos cœurs invincibles » sont de vrais titres : seules ces
# formules exactes comptent.
EDITORIAL_SOURCES = {"sortiraparis", "paris_opendata", "openagenda", "timeout", "lebonbon",
                     "quefaire_paris", "paris_fr"}
_ARTICLE_RE = re.compile(
    r"^\s*(?:on\s+a\s+(?:vu|aim[ée]|ador[ée]|test[ée]|craqu[ée])\b"
    r"|j['’]ai\s+(?:vu|aim[ée]|test[ée])\s*:"
    r"|nos\s+coups?\s+de\s+c(?:œ|oe)urs?\b"
    r"|que\s+faire\s+(?:à|a|ce|cette|cet|en|pendant|le|les|pour|quand|dans|aux?)\b"
    r"|top\s+\d+\b"
    r"|les\s+\d+\s+(?:meilleur|plus\s+belle|plus\s+beaux|incontournable|expos|concerts|sorties|spectacles)"
    r"|les\s+(?:meilleur(?:e?s)?|plus\s+belles?|plus\s+beaux)\s+(?:expos|expositions|concerts|sorties|spectacles|pi[eè]ces|activit|adresses|march[ée]s)"
    r"|o[uù]\s+(?:voir|f[eê]ter|sortir|admirer|faire)\b"
    r"|id[ée]es?\s+(?:de\s+)?sorties?\b)",
    re.I,
)


def is_editorial_article(title: Optional[str]) -> bool:
    """Titre d'article de critique ou de sélection (« On a vu, on a aimé … »,
    « Nos coups de cœur », « Que faire ce week-end »…)."""
    return bool(_ARTICLE_RE.search(title or ""))


# Jeux concours : « Gagnez des places pour … », « Remportez des entrées … »,
# « Jeu-concours … », « Des places à gagner », « Concours de dessins … ».
# Les concours musicaux joués en public restent (« Finale du concours Long-Thibaud »,
# « Concours Long-Thibaud (violon) Soirée de gala »).
_CONTEST_RE = re.compile(
    r"\bjeux?[\s-]+concours\b"
    r"|\b(?:gagnez|gagner|remportez|remporter|tentez\s+de\s+gagner)\b.{0,25}?"
    r"\b(?:places?|invitations?|billets?|entr[ée]es?|pass|lots?|cadeaux?|exemplaires?)\b"
    r"|\b(?:places?|invitations?|billets?|entr[ée]es?|pass|lots?|cadeaux?)\s+(?:sont\s+)?[àa]\s+gagner\b"
    r"|^\s*[àa]\s+gagner\b"
    r"|^\s*concours\b(?!.*\b(?:finale?s?|demi-finales?|gala|r[ée]cital|concerts?|laur[ée]at(?:e|s|es)?|"
    r"[ée]preuves?|remise\s+des\s+prix|c[ée]r[ée]monie|audition)\b)",
    re.I,
)


def is_contest(title: Optional[str]) -> bool:
    return bool(_CONTEST_RE.search(title or ""))
