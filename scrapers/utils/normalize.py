"""Normalization utilities for scraped event data."""

from __future__ import annotations

import html
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable, Optional

from unidecode import unidecode

# ─────────────────────────────── text ───────────────────────────────

_SCRIPT_RE = re.compile(r"<\s*(script|style|noscript|iframe|template)\b[^>]*>.*?<\s*/\s*\1\s*>", re.I | re.S)
_BLOCK_TAG_RE = re.compile(r"<\s*(br|/p|/div|/li|/h\d|/tr|p|div|li|h\d|tr)\b[^>]*>", re.I)
_TAG_RE = re.compile(r"<[^>]*>")
_DANGEROUS_RE = re.compile(r"<\s*/?\s*(script|style|iframe|object|embed|svg|img|on\w+)", re.I)


def clean_text(text: Optional[str]) -> Optional[str]:
    """HTML → plain text.

    Order matters (audit XSS finding): unescape FIRST, then strip tags (replaced by a
    space so words are not glued), repeated so double-encoded markup
    ("&amp;lt;script&amp;gt;") cannot survive.
    """
    if not text:
        return None
    text = str(text)
    for _ in range(3):
        text = html.unescape(text)
        text = _SCRIPT_RE.sub(" ", text)
        text = _BLOCK_TAG_RE.sub(" ", text)
        text = _TAG_RE.sub(" ", text)
        if "&" not in text and "<" not in text:
            break
    # Any remaining "<tag" that looks dangerous: neutralise the bracket.
    text = _DANGEROUS_RE.sub(lambda m: m.group(0).replace("<", " "), text)
    text = text.replace(" ", " ").replace("​", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def truncate(text: Optional[str], max_len: int = 160) -> Optional[str]:
    """Truncate text to max_len, breaking at word boundary."""
    if not text or len(text) <= max_len:
        return text
    truncated = text[:max_len].rsplit(" ", 1)[0].rstrip(" ,;:.-")
    return truncated + "…"


def generate_slug(title: str, date: Optional[str] = None) -> str:
    """URL slug from title and optional date (date taken in Paris local time)."""
    slug = unidecode(title or "").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")[:90].strip("-")
    if date:
        try:
            from utils.dates import paris_day

            d = paris_day(date)
            if d:
                slug += f"-{d.isoformat()}"
        except Exception:
            try:
                slug += f"-{datetime.fromisoformat(date).strftime('%Y-%m-%d')}"
            except ValueError:
                pass
    return slug or "evenement"


def absolute_url(base: str, href: Optional[str]) -> Optional[str]:
    """urljoin that also handles protocol-relative and empty values."""
    from urllib.parse import urljoin

    if not href:
        return None
    href = href.strip()
    if href.startswith("data:") or href.startswith("javascript:"):
        return None
    return urljoin(base, href)


# ─────────────────────────────── geography ───────────────────────────────

IDF_BBOX = (48.12, 49.24, 1.44, 3.56)  # lat_min, lat_max, lng_min, lng_max
IDF_DEPARTMENTS = {"75", "77", "78", "91", "92", "93", "94", "95"}

# Service zone = Paris + petite couronne (reachable by metro / RER in < 45 min).
SERVICE_DEPARTMENTS = {"75", "92", "93", "94"}
# lat_min, lat_max, lng_min, lng_max — covers 92/93/94 with a small margin.
SERVICE_BBOX = (48.70, 49.01, 2.14, 2.64)


def arrondissement_from_zip(zip_code: Optional[str]) -> Optional[str]:
    """75001 → '1er', 75011 → '11e', 75116 → '16e'. None outside Paris."""
    if not zip_code:
        return None
    m = re.match(r"^\s*75(\d{3})\s*$", str(zip_code))
    if not m:
        return None
    n = int(m.group(1))
    if n == 116:
        n = 16
    if not 1 <= n <= 20:
        return None
    return "1er" if n == 1 else f"{n}e"


def extract_zip(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = re.search(r"\b(7[5789]\d{3}|9[1-5]\d{3})\b", text)
    return m.group(1) if m else None


def smart_title_case_safe(text: Optional[str]) -> Optional[str]:
    """utils.titles.smart_title_case (imported lazily)."""
    from utils.titles import smart_title_case

    return smart_title_case(text)


def normalize_zip(raw) -> Optional[str]:
    """Postcode as 5 digits, or None.

    '75 018' / '75018.' / '75002 Paris' / '75010 - 75018' → first valid code;
    '750009' (typo, 6 digits) → '75009'; 'à venir' / '7500' / '1050' → None."""
    if raw is None:
        return None
    t = str(raw).strip()
    if not t:
        return None
    t = re.sub(r"\b(\d{2})\s(\d{3})\b", r"\1\2", t)  # "75 018"
    m = re.search(r"(?<!\d)(\d{5})(?!\d)", t)
    if m:
        return m.group(1)
    m = re.fullmatch(r"(75)0(0\d{2}|1[01]\d)", re.sub(r"\D", "", t))  # "750009" → "75009"
    if m and len(re.sub(r"\D", "", t)) == 6:
        return m.group(1) + m.group(2)
    return None


# Venue "names" that are not places (event published without its address).
_PLACEHOLDER_VENUE_RE = re.compile(
    r"^\s*(a venir|a definir|a confirmer|a determiner|tba|tbc|tbd|n/?a|nc|non communique\w*|"
    r"lieu (a venir|a definir|a confirmer|secret|communique\w*|precise\w*|surprise)|secret location|"
    r"adresse (secrete|communiquee\w*|transmise\w*|envoyee\w*|precisee\w*|donnee\w*)\b.*|"
    r"lieu (communique|transmis|precise|envoye|donne)\w* (a|apres|lors|par|aux|sur)\b.*|"
    r".*\b(communique|transmis|envoye|precise)e?s? (a|apres|lors de) l'?\s*inscription\b.*|"
    r"en ligne|online|visioconference)\s*$"
)


def is_placeholder_venue(*texts: Optional[str]) -> bool:
    """True when the venue name (or address) is a placeholder such as
    'Adresse communiquée à l'inscription', 'Lieu secret', 'à venir'."""
    return any(_PLACEHOLDER_VENUE_RE.match(_fold(t).replace("’", "'")) for t in texts if t)


# Cities / countries that are certainly outside Paris + petite couronne. Used when a venue
# has neither coordinates nor postcode ("Auditorium de la Grotte Cosquer, Marseille").
_FAR_PLACES = (
    "marseille", "lyon", "lille", "bordeaux", "toulouse", "nantes", "nice", "strasbourg",
    "montpellier", "rennes", "reims", "rouen", "le havre", "grenoble", "dijon", "angers",
    "nimes", "avignon", "tours", "orleans", "amiens", "metz", "nancy", "caen", "brest",
    "limoges", "clermont-ferrand", "perpignan", "besancon", "annecy", "la rochelle",
    "aix-en-provence", "cannes", "toulon", "poitiers", "pau", "bayonne", "biarritz", "deauville",
    "chartres", "beauvais", "compiegne", "chantilly", "fontainebleau", "versailles",
    "belgique", "bruxelles", "suisse", "geneve", "lausanne", "luxembourg", "canada", "quebec",
    "montreal", "allemagne", "berlin", "londres", "london", "espagne", "italie", "slovenie",
    "pays-bas", "amsterdam", "royaume-uni", "etats-unis", "new york",
)
_FAR_RE = re.compile(r"(?<![a-z-])(" + "|".join(re.escape(p) for p in _FAR_PLACES) + r")(?![a-z-])")


def far_from_zone(name: Optional[str], address: Optional[str], city: Optional[str]) -> bool:
    """True when the city, the address or a ', <City>' suffix of the venue name points
    outside the service zone (no coordinates/postcode needed). Street names are not
    matched: 'rue de Marseille' (Paris 10e) stays in zone."""
    c = _fold(city)
    if c and _FAR_RE.fullmatch(c.replace("cedex", "").strip()):
        return True
    for text in (address, name):
        t = _fold(text)
        if not t:
            continue
        # only the last comma-separated part counts: "…, Marseille" / "…, 1050 Bruxelles, Belgique"
        tail = t.rsplit(",", 1)[-1].strip()
        tail = re.sub(r"^\d{4,5}\s+", "", tail)
        if tail and _FAR_RE.fullmatch(tail):
            return True
    return False


def in_service_zone(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    return SERVICE_BBOX[0] <= lat <= SERVICE_BBOX[1] and SERVICE_BBOX[2] <= lng <= SERVICE_BBOX[3]


def in_idf(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    return IDF_BBOX[0] <= lat <= IDF_BBOX[1] and IDF_BBOX[2] <= lng <= IDF_BBOX[3]


# ─────────────────────────────── prices ───────────────────────────────

_FREE_RE = re.compile(
    r"\b(gratuit|gratuite|gratuits|gratuites|entree libre|acces libre|entree gratuite|"
    r"libre participation|prix libre|free entry|free admission|sans reservation gratuite)\b"
)
_ONLY_FREE_RE = re.compile(r"^\s*(free|gratis|0|0[.,]00)\s*$")
_AMOUNT = r"(?<![\d.,])(\d{1,4}(?:[.,]\d{1,2})?)"
_CUR = r"(?:euros?\b|eur\b)"
_RANGE_RE = re.compile(rf"(?:de\s+)?{_AMOUNT}\s*{_CUR}?\s*(?:-|–|à|a|au)\s*{_AMOUNT}\s*{_CUR}")
_AMOUNT_AFTER_RE = re.compile(rf"{_AMOUNT}\s*{_CUR}")
_CONDITIONAL_FREE_RE = re.compile(
    r"gratuit\w*\s+(pour|pr|aux|moins|-|jusqu|le|les|sur|avec|sous|enfants?|etudiant|chomeur|adherent)"
)


MAX_PLAUSIBLE_PRICE = 100_000  # 1 000 € in centimes: anything above is a parse error


def _is_year(raw: str) -> bool:
    return bool(re.fullmatch(r"20[2-3]\d", raw.strip()))


def to_centimes(value) -> Optional[int]:
    """'19,99' / 19.99 / Decimal → 1999 (exact, no float rounding)."""
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value).strip().replace(",", ".").replace(" ", ""))
    except InvalidOperation:
        return None
    if d < 0:
        return None
    return int((d * 100).quantize(Decimal("1")))


def _price_result(status: str, pmin: int = 0, pmax: int = 0) -> dict:
    return {
        "price_min": pmin,
        "price_max": pmax,
        "is_free": status == "free",
        "price_status": status,
    }


UNKNOWN_PRICE = _price_result("unknown")
FREE_PRICE = _price_result("free")


def parse_price_fr(raw: Optional[str]) -> dict:
    """Parse a French price string.

    Returns dict(price_min, price_max [centimes], is_free, price_status in free|paid|unknown).
    No price information → 'unknown' (never 'free').
    """
    if raw is None:
        return dict(UNKNOWN_PRICE)
    text = unidecode(str(raw)).lower().replace(" ", " ")
    text = re.sub(r"\s+", " ", text).strip()
    # note: unidecode turns "€" into "EUR" → matched by _CUR below
    if not text:
        return dict(UNKNOWN_PRICE)
    if _ONLY_FREE_RE.match(text):
        return dict(FREE_PRICE)

    amounts = []
    for m in _RANGE_RE.finditer(text):
        if _is_year(m.group(1)):  # "jusqu'au 3 mars 2026 - 12 €": the year is not a price
            continue
        a, b = to_centimes(m.group(1)), to_centimes(m.group(2))
        if a is not None and b is not None:
            amounts += [a, b]
    for m in _AMOUNT_AFTER_RE.finditer(text):
        v = to_centimes(m.group(1))
        if v is not None:
            amounts.append(v)
    raw_s = str(raw)
    for m in re.finditer(r"€\s*(\d{1,4}(?:[.,]\d{1,2})?)", raw_s):
        if not raw_s[: m.start()].rstrip()[-1:].isdigit():  # "€15", not "12 € 2 adultes"
            v = to_centimes(m.group(1))
            if v is not None:
                amounts.append(v)

    has_free = bool(_FREE_RE.search(text))
    amounts = [a for a in amounts if a <= MAX_PLAUSIBLE_PRICE]
    positive = [a for a in amounts if a > 0]

    if positive:
        pmin, pmax = min(positive), max(positive)
        if has_free:
            pmin = 0  # "gratuit pour les -26 ans, 12€" → 0–12 €, not free
        return _price_result("paid", pmin, pmax)
    if amounts and not positive:
        return dict(FREE_PRICE)  # "0 €"
    if has_free:
        return dict(FREE_PRICE)
    return dict(UNKNOWN_PRICE)


# Backward compatible name used by older spiders.
parse_price = parse_price_fr


def price_from_numbers(low, high=None, *, free_flag: Optional[bool] = None) -> dict:
    """Structured prices (euros, numbers or strings) → price dict."""
    lo = to_centimes(low)
    hi = to_centimes(high) if high is not None else lo
    if hi is None:
        hi = lo
    if lo is None and hi is not None:
        lo = hi
    if lo is None:
        if free_flag is True:
            return dict(FREE_PRICE)
        return dict(UNKNOWN_PRICE)
    if lo > hi:
        lo, hi = hi, lo
    if hi == 0:
        return dict(FREE_PRICE)
    return _price_result("paid", lo, hi)


def price_from_offers(offers) -> dict:
    """schema.org Offer / AggregateOffer / list of offers → price dict."""
    if not offers:
        return dict(UNKNOWN_PRICE)
    if isinstance(offers, dict):
        offers = [offers]
    lows, highs = [], []
    free = None
    for o in offers:
        if not isinstance(o, dict):
            continue
        cur = (o.get("priceCurrency") or "EUR").upper()
        if cur not in ("EUR", "€"):
            continue
        if o.get("isAccessibleForFree") in (True, "true", "True"):
            free = True
        for key_lo, key_hi in (("lowPrice", "highPrice"), ("price", "price")):
            lo = to_centimes(o.get(key_lo))
            hi = to_centimes(o.get(key_hi))
            if lo is not None:
                lows.append(lo)
            if hi is not None:
                highs.append(hi)
        spec = o.get("priceSpecification")
        if isinstance(spec, dict):
            v = to_centimes(spec.get("price"))
            if v is not None:
                lows.append(v)
                highs.append(v)
    if not lows and not highs:
        return dict(FREE_PRICE) if free else dict(UNKNOWN_PRICE)
    allv = lows + highs
    return price_from_numbers(min(allv) / 100, max(allv) / 100)


# ─────────────────────────────── categories ───────────────────────────────

VALID_CATEGORIES = (
    "concerts", "expos", "theatre", "cinema", "festivals",
    "conferences", "danse", "spectacles", "ateliers", "visites",
    "soirees", "sport",  # packages/db/sql/0007_categories.sql
)

# Whole-word keywords, accent-insensitive (compared after unidecode/lower).
CATEGORY_KEYWORDS = {
    "concerts": [
        "concert", "concerts", "musique live", "live music", "jazz", "rock",
        "rap", "hip-hop", "hip hop", "chanson", "recital", "orchestre", "symphonique",
        "opera", "electro", "showcase", "chorale", "quatuor", "philharmonie",
    ],
    "expos": [
        "exposition", "expositions", "expo", "expos", "vernissage", "retrospective",
        "galerie", "installation", "photographies", "oeuvres",
    ],
    "theatre": [
        "theatre", "piece de theatre", "comedie", "tragedie", "mise en scene", "seul en scene",
        "boulevard", "theatral", "theatrale",
    ],
    "cinema": [
        "cinema", "film", "films", "projection", "avant-premiere", "court-metrage",
        "courts-metrages", "documentaire", "cine-club", "cine",
    ],
    "festivals": ["festival", "festivals"],
    "conferences": [
        "conference", "conferences", "debat", "debats", "table ronde", "masterclass", "colloque",
        "rencontre-debat", "lecture", "dedicace", "seminaire",
        "causerie", "conference-debat",
    ],
    "danse": ["danse", "ballet", "choregraphie", "choregraphique", "bal", "hip-hop danse"],
    "spectacles": [
        "spectacle", "spectacles", "cirque", "magie", "magicien", "one man show",
        "one woman show", "humour", "humoriste", "stand-up", "stand up", "cabaret",
        "marionnettes", "comedie musicale", "conte", "contes",
    ],
    "ateliers": [
        "atelier", "ateliers", "workshop", "stage", "cours", "initiation",
        "brunch", "degustation", "jeu de piste", "chasse au tresor", "escape game",
    ],
    "visites": [
        "visite", "visites", "visite guidee", "balade", "promenade", "patrimoine",
        "journees du patrimoine", "circuit",
    ],
    "soirees": [
        "clubbing", "club night", "soiree club", "party", "dj set", "dj sets", "dj", "djs",
        "karaoke", "afterwork", "after work", "after-work", "boum", "blind test", "blind-test",
        "soiree jeux", "soiree jeu", "jeux de societe", "quiz", "rave", "techno", "house music",
        "soiree dansante", "dancefloor", "silent disco", "apero", "aperitif", "teuf", "bingo",
    ],
    "sport": [
        "sport", "sports", "sportif", "sportive", "yoga", "fitness", "pilates", "zumba",
        "course", "course a pied", "running", "marathon", "semi-marathon", "trail", "randonnee",
        "randonnees", "equitation", "gym", "gymnastique", "natation", "escalade", "boxe",
        "tai chi", "qi gong", "meditation", "renforcement musculaire", "marche nordique",
        "triathlon", "sport proximite",
    ],
}

# Explicit mapping of raw source labels (normalized) → category slug.
RAW_CATEGORY_MAP = {
    "concert": "concerts", "concerts": "concerts", "musique": "concerts", "music": "concerts",
    "musiques": "concerts", "jazz": "concerts", "classique": "concerts", "opera": "concerts",
    "classique-opera": "concerts", "electro": "concerts", "rock": "concerts", "pop": "concerts",
    "exposition": "expos", "expositions": "expos", "expo": "expos", "expos": "expos",
    "art": "expos", "arts visuels": "expos", "musee": "expos", "musees": "expos",
    "theatre": "theatre", "theatres": "theatre", "comedie": "theatre",
    "cinema": "cinema", "film": "cinema", "films": "cinema", "projection": "cinema",
    "festival": "festivals", "festivals": "festivals",
    "conference": "conferences", "conferences": "conferences", "debat": "conferences",
    "rencontre": "conferences", "rencontres": "conferences", "lecture": "conferences",
    "danse": "danse", "ballet": "danse", "danse-ballet-opera": "danse",
    "spectacle": "spectacles", "spectacles": "spectacles", "humour": "spectacles",
    "one-man-show-humour": "spectacles", "cirque": "spectacles", "spectacle-enfant": "spectacles",
    "jeune public": "spectacles", "magie": "spectacles", "cabaret": "spectacles",
    "atelier": "ateliers", "ateliers": "ateliers", "stage": "ateliers", "cours": "ateliers",
    "loisirs": "ateliers",
    "sport": "sport", "sports": "sport", "bien-etre": "sport", "sport et bien-etre": "sport",
    "paris sport proximite": "sport", "sport proximite": "sport", "yoga": "sport",
    "soiree": "soirees", "soirees": "soirees", "clubbing": "soirees", "club": "soirees",
    "nightlife": "soirees", "party": "soirees", "fete": "soirees", "karaoke": "soirees",
    "visite": "visites", "visites": "visites", "balade": "visites", "patrimoine": "visites",
    "visite guidee": "visites", "promenade": "visites",
}

# Tie-break priority (first wins)
_PRIORITY = [
    "festivals", "cinema", "soirees", "expos", "danse", "theatre", "concerts", "spectacles",
    "conferences", "sport", "visites", "ateliers",
]

# A title that STARTS with one of these words says what the event is, whatever the
# source category ("Atelier gravure" listed under Expositions, "Blind test" under Concerts).
_TITLE_LEAD = [
    (re.compile(r"^(atelier|ateliers|workshop|stage|cours|initiation|masterclass)\b"), "ateliers"),
    (re.compile(r"^(conference|conferences|conference-debat|rencontre|rencontres|debat|table ronde|"
                r"causerie|colloque|lecture|dedicace|seminaire)\b"), "conferences"),
    (re.compile(r"^(visite|visites|balade|promenade)\b"), "visites"),
    (re.compile(r"^(projection|cine-club|avant-premiere)\b"), "cinema"),
    (re.compile(r"^(yoga|fitness|pilates|zumba|randonnee|course a pied|marche nordique|"
                r"equitation|tai chi|qi gong)\b"), "sport"),
]
# Party formats: override a concert / theatre / expo / show label from the source.
_SOIREE_RE = re.compile(
    r"(?<![a-z0-9])(clubbing|club night|soiree club|party|dj set|dj sets|karaoke|afterwork|after work|"
    r"after-work|boum|blind test|blind-test|soiree jeux|soiree jeu|silent disco|rave|teuf)(?![a-z0-9])"
)
_OVERRIDABLE = {None, "concerts", "theatre", "expos", "spectacles", "danse"}


def title_category_override(title: Optional[str], current: Optional[str]) -> Optional[str]:
    """Category imposed by the title itself, or None to keep `current`.

    - a leading format word (Atelier…, Conférence…, Visite…, Projection…, Yoga…) always wins
      over a generic label (concerts/theatre/expos/spectacles/danse) or no label;
    - party formats (DJ set, karaoké, afterwork, boum, blind test, soirée jeux…) →
      soirees, unless the source said festival/cinema."""
    t = _fold(title)
    if not t:
        return None
    t = re.sub(r"^[^a-z0-9]+", "", t)
    for rx, slug in _TITLE_LEAD:
        if rx.match(t):
            return None if current in (slug, "festivals") else slug
    if _SOIREE_RE.search(t) and current in _OVERRIDABLE:
        return "soirees"
    return None


_KW_RES = {
    slug: re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(k) for k in sorted(kws, key=len, reverse=True)) + r")(?![a-z0-9])")
    for slug, kws in CATEGORY_KEYWORDS.items()
}


def _fold(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", unidecode(text or "").lower()).strip()


def map_raw_category(raw: Optional[str]) -> Optional[str]:
    """Exact (normalized) lookup of a source category label."""
    if not raw:
        return None
    key = _fold(raw).strip(" /,-")
    if key in VALID_CATEGORIES:
        return key
    if key in RAW_CATEGORY_MAP:
        return RAW_CATEGORY_MAP[key]
    # "Concerts / Jazz" → first part that maps
    for part in re.split(r"[/,|>;]+", key):
        part = part.strip()
        if part in RAW_CATEGORY_MAP:
            return RAW_CATEGORY_MAP[part]
    return None


def _scores(text: str) -> dict:
    out = {}
    for slug, rx in _KW_RES.items():
        n = len(rx.findall(text))
        if n:
            out[slug] = n
    return out


def _best(scores: dict) -> Optional[str]:
    if not scores:
        return None
    top = max(scores.values())
    for slug in _PRIORITY:
        if scores.get(slug) == top:
            return slug
    return None


def detect_category(
    raw_category: Optional[str],
    title: str,
    description: Optional[str] = None,
    source_map: Optional[dict] = None,
) -> Optional[str]:
    """Detect category slug.

    Priority: title format word / party format (title_category_override) >
    explicit per-source map > generic raw-label map > title keywords >
    raw-category keywords > description keywords. Whole words only, so
    "Manifestation" ≠ festival, "exposé" ≠ expo, "parcours" ≠ visite.
    Returns None when nothing matches (allowed; soft penalty in validation).
    """
    lead = title_category_override(title, None)
    if lead:
        return lead
    if raw_category and source_map:
        key = _fold(raw_category)
        for k, v in source_map.items():
            if _fold(k) == key:
                return v
    mapped = map_raw_category(raw_category)
    if mapped:
        return mapped
    best = _best(_scores(_fold(title)))
    if best:
        return best
    best = _best(_scores(_fold(raw_category)))
    if best:
        return best
    return _best(_scores(_fold(description)))


# ─────────────────────────────── misc ───────────────────────────────

_ONLINE_RE = re.compile(
    r"\b(en ligne|online|webinar|webinaire|zoom|livestream|en distanciel|virtual event|visioconference)\b"
)


def looks_online(*texts: Optional[str]) -> bool:
    return any(_ONLINE_RE.search(_fold(t)) for t in texts if t)


def first_non_empty(values: Iterable) -> Optional[str]:
    for v in values:
        if v:
            return v
    return None


def compute_quality_score(
    title: Optional[str],
    description: Optional[str],
    image_url: Optional[str],
    start_date: Optional[str],
    price_raw: Optional[str],
    booking_url: Optional[str],
) -> int:
    """Legacy score kept for backward compatibility — the authoritative score is
    computed by validation.validate() at ingestion time."""
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
