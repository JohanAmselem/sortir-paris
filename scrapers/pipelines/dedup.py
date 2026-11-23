"""
Cross-source event deduplication (AUDIT D11, étendu au lot D du 23/11/2026).

Deux lignes sont des doublons quand leurs dates se chevauchent (jour de Paris) et :
  - même lieu canonique (ou lieux à moins de 150 m) et titres « équivalents »
    (titles_equivalent, sur les titres nettoyés comme à la collecte puis réduits par
    dedup_title) : mêmes mots, similarité de trigrammes > 0,55, OU, au même lieu, le titre
    court contenu en mots entiers et d'un seul tenant dans le long (« Peet » / « Peet -
    l'Olympia », « Magali Gio » / « Magali Gio dans Bagage cabine ») avec au moins un mot
    qui n'est ni générique (« visite guidée », « quatuor », « Chopin »…) ni un mot du nom
    du lieu, et les mêmes nombres (« Saison 2 » ≠ « Saison 3 »). Jamais équivalents : un
    titre fait seulement de mots génériques, une activité dérivée (« Visite guidée :
    Exposition X » ≠ « X »), une période-forfait (« PACK DUO : Luther + Rounhaa ») face à
    une date ;
  - expos et séries : aussi dans deux fiches de lieu voisines non liées (< 400 m) qui
    partagent un mot distinctif (« Musée Carnavalet » / « … - Histoire de Paris ») ;
  - ou lieux pas encore liés mais aux noms compatibles, même créneau, similarité ≥ 0,8.
  Une même source n'a de doublon que chez Ticketmaster (billet + « Prestation » VIP :
  même début exact, même titre nettoyé).

Heures : deux sorties d'un seul jour dont les deux heures sont connues et à plus de
45 min d'écart ne sont jamais fusionnées (19 h et 21 h = deux concerts). Une heure
inconnue (time_known = false, ou 12:00 chez sortiraparis) n'empêche pas le rattachement.
Expos et longues séries : les périodes doivent se chevaucher, sans contrainte d'heure.

Groupes : union avec refus des conflits (conflict) : jamais deux séances d'un même jour
aux heures connues et différentes, jamais deux lignes d'une même source aux titres non
équivalents. Un groupe sans période ne garde pas des dates différentes (coupé par jour).
Les lignes « à rattacher seulement » (sortiraparis et médias, articles « On a vu… ») ne
relient jamais deux groupes et ne sont jamais canoniques : chacune est rattachée au groupe
qui lui ressemble le plus, ou reste seule.

Fiche affichée (group_canonical) : publiée d'abord, jamais un article, une période plutôt
qu'une de ses dates, puis priorité de source venue_* (et programmes officiels) >
ticketmaster, offi, billetreduc, theatreonline, dice > openagenda, paris_opendata >
sortiraparis ; à égalité, prix connu et image, heure connue, qualité, la plus ancienne.
Les champs manquants de la canonique (image, prix inconnu, heure…) sont remplis depuis
les doublons (FILL_SQL). Les doublons dont la canonique n'est plus vivante sont libérés
(RELEASE_SQL) avant chaque passage. Rien n'est jamais supprimé.

Le rattrapage des lignes existantes est tools/backfill_doublons.py (mêmes règles).
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from functools import lru_cache
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from utils.dates import PARIS, paris_day
from pipelines.ingest import _exec_many
from utils.matching import (
    VENUE_GENERIC_KEYS,
    _trigrams,
    dedup_title,
    haversine_m,
    venue_names_compatible,
    venue_tokens,
)
from utils.normalize import normalize_zip
from utils.titles import clean_display_title, is_editorial_article

TITLE_THRESHOLD = 0.55
NEAR_METERS = 150
NEAR_PERIOD_METERS = 400  # expos et séries dans deux fiches de lieu voisines non liées
# Different venue rows whose names designate the same place (no shared geocode yet):
STRONG_TITLE_THRESHOLD = 0.8
SLOT_MINUTES = 45
FAR_METERS = 1500

# Plus haut = plus fiable pour le titre, l'image et l'heure (ordre demandé le 23/11/2026).
VENUE_SOURCE_PRIORITY = 95  # "venue_<key>" = site officiel du lieu
SOURCE_PRIORITY: Dict[str, int] = {
    # programme officiel d'une institution, au même rang que venue_*
    "newmorning": 95, "cinematheque": 95, "forumdesimages": 95, "parismusees": 95,
    # billetteries et agendas spécialisés
    "ticketmaster": 70, "offi": 70, "billetreduc": 70, "theatreonline": 70, "dice": 70,
    "shotgun": 70, "allocine": 70, "parisjazzclub": 60,
    # open data et agendas ouverts
    "openagenda": 50, "paris_opendata": 50, "datatourisme": 50,
    "infoconcert": 45, "fnacspectacles": 45,  # images génériques, faux « gratuit » (0005)
    "meetup": 40, "eventbrite": 40, "bandsintown": 40, "mapado": 40,
    # médias : jamais préférés pour le titre ni l'image
    "timeout": 30, "quefaire_paris": 30, "paris_fr": 30, "lebonbon": 25,
    "sortiraparis": 20,
}
DEFAULT_PRIORITY = 35

# Rattachées seulement : jamais canoniques, ne relient jamais deux groupes.
ATTACH_ONLY_SOURCES = {"sortiraparis", "timeout", "lebonbon"}
# Une même source peut lister deux fois le même concert (Ticketmaster : billet et
# « Prestation » VIP) : même début exact et même titre de comparaison.
SAME_SOURCE_DUP_SOURCES = {"ticketmaster"}
# Sources dont 12:00 veut dire « heure non donnée ».
NOON_UNKNOWN_SOURCES = {"sortiraparis"}

# Un titre court fait seulement de ces mots ne suffit pas pour l'inclusion
# (« Visite guidée » ⊂ « Visite guidée : Art Nouveau … » n'est pas un doublon).
GENERIC_TITLE_WORDS = {
    "visite", "visites", "guidee", "guidees", "guide", "atelier", "ateliers", "jam", "session", "sessions",
    "soiree", "soirees", "nuit", "nuits", "journee", "journees", "quatuor", "trio", "quartet", "quintet",
    "orchestre", "ensemble", "choeur", "recital", "noel", "conference", "conferences", "rencontre",
    "rencontres", "projection", "film", "films", "seance", "cours", "stage", "initiation", "decouverte",
    "balade", "lecture", "lectures", "festival", "gala", "bal", "brunch", "dj", "set", "karaoke", "blind",
    "test", "quiz", "open", "mic", "scene", "ouverte", "impro", "improvisation", "theatre", "danse",
    "cirque", "cinema", "cine", "opera", "ballet", "messe", "office", "vepres", "cantate", "matinee",
    "nocturne", "apero", "aperitif", "degustation", "marche", "entree", "entrees", "billet", "billets",
    "pass", "abonnement", "tarif", "famille", "enfants", "enfant", "jeune", "public", "adultes",
    "exposition", "expositions", "collection", "collections", "permanente", "permanentes", "musee",
    "programme", "saison", "club", "party", "fete", "fetes", "hommage", "carte", "blanche", "classique",
    "jazz", "rock", "electro", "musique", "musiques", "piano", "orgue", "violon", "guitare", "chant",
    "voix", "humour", "comedie", "stand", "up", "one", "man", "woman", "show", "heure", "conte", "contes",
    "histoire", "histoires", "yoga", "meditation", "sport", "course", "premiere", "partie", "special",
    "speciale", "edition", "grand", "grande", "petit", "petite", "best", "of", "mix", "dance", "danser",
    "sur", "pour", "avec", "dans", "par", "chez", "un", "une", "nos", "notre", "vos", "votre",
    # répertoire classique : « Chopin » ⊂ « Récital piano de Mozart, Chopin, Tchaïkovsky »
    # ne dit pas quel interprète (séries « aux chandelles » d'une même église)
    "mozart", "chopin", "bach", "vivaldi", "beethoven", "tchaikovsky", "tchaikovski", "liszt", "satie",
    "schubert", "debussy", "ravel", "haendel", "handel", "brahms", "schumann", "rachmaninov",
    "rachmaninoff", "dvorak", "verdi", "puccini", "bizet", "mendelssohn", "haydn", "faure", "gershwin",
    "piazzolla", "paganini", "grieg", "pachelbel", "albinoni", "gounod", "offenbach", "strauss", "wagner",
    "mahler", "chandelles", "chandelle", "candlelight", "bougies", "gospel", "requiem", "stabat", "mater",
    "ave", "maria", "messie", "magnificat", "symphonie", "concerto", "concertos", "sonate", "sonates",
    "adagio", "adagios", "celebres", "airs", "baroque", "lyrique", "sacree", "sacre",
}


# Une activité tirée d'un événement n'est pas l'événement : « Visite guidée : Exposition
# Cézanne et nous » ≠ « Cézanne et nous », « Atelier en famille … » ≠ l'expo. Un titre qui
# a l'un de ces mots en plus de l'autre n'est jamais équivalent.
DERIVED_ACTIVITY_WORDS = {
    "visite", "visites", "guidee", "guidees", "atelier", "ateliers", "conference", "conferences",
    "rencontre", "rencontres", "projection", "projections", "lecture", "lectures", "masterclass",
    "stage", "stages", "cours", "parcours", "enquete", "brunch", "conte", "contes", "debat", "dedicace",
    "signature", "vernissage", "finissage", "table", "ronde", "colloque", "seminaire", "webinaire",
}


# Une période au titre de forfait ou de liste d'artistes ne représente pas l'une de ses dates.
_BUNDLE_RE = re.compile(r"\s\+\s|\bpack\b|\bforfait\b|\bpass\b|\babonnement\b", re.I)


def source_priority(source: str) -> int:
    if source and source.startswith("venue_"):
        return VENUE_SOURCE_PRIORITY
    return SOURCE_PRIORITY.get(source, DEFAULT_PRIORITY)


def attach_only(row: dict) -> bool:
    v = row.get("_ao")
    if v is None:
        v = row["_ao"] = (row.get("source") in ATTACH_ONLY_SOURCES
                          or is_editorial_article(row.get("title")))
    return v


def _price_known(row: dict) -> bool:
    return row.get("price_status") in ("paid", "free")


def _has_image(row: dict) -> bool:
    return bool(row.get("has_image") or row.get("image_url"))


def canonical_rank(row: dict) -> tuple:
    """Sort key: the max is the canonical row."""
    created = row.get("created_at")
    created_ts = created.timestamp() if isinstance(created, datetime) else 0
    return (
        1 if row.get("status") == "active" else 0,
        0 if attach_only(row) else 1,
        source_priority(row.get("source", "")),
        int(_price_known(row)) + int(_has_image(row)),  # « prix connu et image »
        int(_has_image(row)),
        int(time_known(row)),
        row.get("quality_score") or 0,
        -created_ts,  # older first-seen wins ties
        str(row.get("id")),
    )


def choose_canonical(a: dict, b: dict) -> Tuple[dict, dict]:
    """Return (canonical, duplicate)."""
    return (a, b) if canonical_rank(a) >= canonical_rank(b) else (b, a)


def _days(row: dict) -> Tuple[Optional[date], Optional[date]]:
    s = row.get("_day_start")
    if s is None:
        s = paris_day(row.get("start_date"))
        e = paris_day(row.get("end_date")) if row.get("end_date") else s
        row["_day_start"], row["_day_end"] = s, (e if e and s and e >= s else s)
    return row["_day_start"], row["_day_end"]


def single_day(row: dict) -> bool:
    s, e = _days(row)
    return s is not None and s == e


def time_known(row: dict) -> bool:
    """Heure connue : time_known, sauf 12:00 chez sortiraparis (heure non donnée)."""
    if not row.get("time_known"):
        return False
    start = row.get("start_date")
    if row.get("source") in NOON_UNKNOWN_SOURCES and isinstance(start, datetime):
        local = start.astimezone(PARIS)
        if (local.hour, local.minute) == (12, 0):
            return False
    return True


def dates_match(a: dict, b: dict) -> bool:
    sa, ea = _days(a)
    sb, eb = _days(b)
    if not sa or not sb:
        return False
    return sa <= eb and sb <= ea


def venues_match(a: dict, b: dict) -> bool:
    va, vb = a.get("canonical_venue"), b.get("canonical_venue")
    if va and vb and va == vb:
        return True
    if None not in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) < NEAR_METERS
    return False


@lru_cache(maxsize=100_000)
def _names_compatible(a: Optional[str], b: Optional[str]) -> bool:
    return venue_names_compatible(a, b)


def same_venue(a: dict, b: dict) -> bool:
    """Même lieu canonique, ou lieux voisins aux noms compatibles (condition de l'inclusion).
    Pour une expo ou une série, deux lieux voisins qui partagent un mot distinctif
    suffisent (« Musée Carnavalet » / « Musée Carnavalet - Histoire de Paris », pas encore
    liés) ; pour un soir donné, deux salles d'un même complexe restent distinctes."""
    va, vb = a.get("canonical_venue"), b.get("canonical_venue")
    if va and vb and va == vb:
        return True
    if not venues_match(a, b):
        return False
    if _names_compatible(a.get("venue_name"), b.get("venue_name")):
        return True
    return not (single_day(a) and single_day(b)) and _shared_venue_word(a, b)


# Mots trop courants pour dire « même lieu » entre deux fiches voisines : le Grand
# Palais et le Petit Palais sont à 155 m l'un de l'autre.
NEARBY_GENERIC_WORDS = {"palais", "grand", "grande", "petit", "petite", "espace", "paris", "nouveau", "nouvelle", "saint", "sainte", "royal", "national", "nationale"}


def _shared_venue_word(a: dict, b: dict) -> bool:
    """Un mot distinctif commun aux deux noms de lieu (« carnavalet », pas « musée »)."""
    _prepare(a)
    _prepare(b)
    return any(
        len(w) >= 4 and not w.isdigit() and w not in VENUE_GENERIC_KEYS and w not in NEARBY_GENERIC_WORDS
        for w in a["_vw"] & b["_vw"]
    )


def nearby_same_place(a: dict, b: dict) -> bool:
    """Expo ou série dans deux fiches de lieu pas encore liées, à moins de NEAR_PERIOD_METERS
    et avec un mot distinctif commun (« Musée Carnavalet », 154 m de « Musée Carnavalet -
    Histoire de Paris »)."""
    if single_day(a) and single_day(b):
        return False
    if None in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return False
    return (haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) < NEAR_PERIOD_METERS
            and _shared_venue_word(a, b))


def venue_names_match(a: dict, b: dict) -> bool:
    """Two venue rows that are probably the same place: compatible names, postcodes equal
    or one unknown, and not geocoded far apart."""
    za, zb = normalize_zip(a.get("zip_code")), normalize_zip(b.get("zip_code"))
    if za and zb and za != zb:
        return False
    if None not in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        if haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) > FAR_METERS:
            return False
    return _names_compatible(a.get("venue_name"), b.get("venue_name"))


def _minutes_apart(a: dict, b: dict) -> Optional[float]:
    da, db = a.get("start_date"), b.get("start_date")
    if isinstance(da, datetime) and isinstance(db, datetime):
        return abs((da - db).total_seconds()) / 60
    return None


def same_slot(a: dict, b: dict) -> bool:
    """Same Paris day, and starts within SLOT_MINUTES when both times are known."""
    sa, sb = _days(a)[0], _days(b)[0]
    if not sa or sa != sb:
        return False
    if time_known(a) and time_known(b):
        gap = _minutes_apart(a, b)
        if gap is not None:
            return gap <= SLOT_MINUTES
    return True


def times_compatible(a: dict, b: dict) -> bool:
    """Deux sorties d'un seul jour aux heures connues : au plus 45 min d'écart.
    Une période (expo, série) n'a pas d'heure de séance : pas de contrainte."""
    if single_day(a) and single_day(b):
        return same_slot(a, b)
    return True


def _prepare(row: dict) -> None:
    """Titre de comparaison calculé une fois par ligne (titre nettoyé comme à la collecte)."""
    if "_tok" in row:
        return
    shown = clean_display_title(row.get("title"), source=row.get("source"),
                                venue_names=[row.get("venue_name"), row.get("venue_own_name")])
    row["_dt"] = dedup_title(shown or row.get("title"))
    row["_tok"] = tuple(row["_dt"].split())
    row["_tg"] = frozenset(_trigrams(row["_dt"]))
    row["_digits"] = frozenset(w for w in row["_tok"] if w.isdigit())
    row["_vw"] = frozenset(venue_tokens(row.get("venue_name"))) | frozenset(venue_tokens(row.get("venue_own_name")))


def _title_sim(a: dict, b: dict) -> float:
    _prepare(a)
    _prepare(b)
    ga, gb = a["_tg"], b["_tg"]
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


def _contains(short: Sequence[str], long_: Sequence[str]) -> bool:
    n = len(short)
    return any(tuple(long_[i:i + n]) == tuple(short) for i in range(len(long_) - n + 1))


def titles_equivalent(a: dict, b: dict, inclusion: bool = True) -> bool:
    """Titres du même spectacle : identiques, très proches (trigrammes > 0,55), ou — au
    même lieu (inclusion=True) — le court contenu en mots entiers dans le long."""
    _prepare(a)
    _prepare(b)
    ta, tb = a["_tok"], b["_tok"]
    if not ta or not tb:
        return False
    sa, sb = set(ta), set(tb)
    if ta == tb or (sa == sb and len(sa) >= 2):
        return True  # mêmes mots (« Haendel : Le Messie » / « Le Messie de Haendel »)
    da, db = a["_digits"], b["_digits"]
    if da and db and da != db:
        return False  # « Saison 2 » / « Saison 3 », « partie 1 » / « partie 2 »
    if (sa ^ sb) & DERIVED_ACTIVITY_WORDS:
        return False  # « Visite guidée : X » n'est pas « X »
    venue_words = a["_vw"] | b["_vw"]
    if any(all(w in GENERIC_TITLE_WORDS or w in venue_words for w in t) for t in (ta, tb)):
        return False  # « Visite guidée » ≈ « Visite guidée : Art Nouveau » par trigrammes : non
    if _title_sim(a, b) > TITLE_THRESHOLD:
        return True
    if not inclusion or da != db:
        return False
    (short, rs), (long_, rl) = sorted(((ta, a), (tb, b)), key=lambda t: (len(t[0]), len(" ".join(t[0]))))
    if len(short) == len(long_) or not _contains(short, long_):
        return False
    if single_day(rs) and not single_day(rl) and _BUNDLE_RE.search(rl.get("title") or ""):
        return False  # « PACK DUO : Luther + Rounhaa » (27→29/01) n'est pas le concert de Rounhaa
    meaningful = [w for w in short if w not in GENERIC_TITLE_WORDS and w not in venue_words]
    min_chars = 3 if (single_day(a) and single_day(b)) else 5  # expos : plus exigeant
    return len("".join(meaningful)) >= min_chars


def same_source_duplicate(a: dict, b: dict) -> bool:
    """Une même source qui liste deux fois le même concert (billet + « Prestation » VIP)."""
    if a.get("source") != b.get("source") or a.get("source") not in SAME_SOURCE_DUP_SOURCES:
        return False
    if not (single_day(a) and single_day(b) and time_known(a) and time_known(b)):
        return False
    if a.get("start_date") != b.get("start_date") or not same_venue(a, b):
        return False
    _prepare(a)
    _prepare(b)
    return bool(a["_tok"]) and a["_tok"] == b["_tok"]


def is_duplicate(a: dict, b: dict) -> bool:
    if a.get("source") == b.get("source"):
        return same_source_duplicate(a, b)  # otherwise never (recurring shows)
    if not dates_match(a, b) or not times_compatible(a, b):
        return False
    if venues_match(a, b):
        if titles_equivalent(a, b, inclusion=False):
            return True
        return titles_equivalent(a, b, inclusion=True) and same_venue(a, b)
    if nearby_same_place(a, b):
        return titles_equivalent(a, b, inclusion=True)
    # venue rows not linked/geocoded yet ("Seine Musicale" / "La Seine Musicale"):
    # stricter title and same time slot
    return (same_slot(a, b) and _title_sim(a, b) >= STRONG_TITLE_THRESHOLD
            and venue_names_match(a, b))


def conflict(a: dict, b: dict) -> bool:
    """Deux lignes qui ne peuvent pas être dans le même groupe :
    - une même source et des titres non équivalents (deux spectacles qu'une ligne au
      titre long, « PACK DUO : Luther + Rounhaa », relierait) ;
    - deux sorties d'un même jour aux heures connues et à plus de 45 min d'écart."""
    if a.get("source") == b.get("source") and not (
            same_source_duplicate(a, b) or titles_equivalent(a, b, inclusion=same_venue(a, b))):
        return True
    if not (single_day(a) and single_day(b)) or _days(a)[0] != _days(b)[0]:
        return False  # séances de jours différents : reliées par leur série, c'est voulu
    if time_known(a) and time_known(b):
        gap = _minutes_apart(a, b)
        if gap is not None and gap > SLOT_MINUTES:
            return True  # 19 h et 21 h : deux séances
    return False


def _cells(row: dict) -> List[tuple]:
    keys = []
    start_day, end_day = _days(row)
    if start_day and start_day == end_day and row.get("venue_name"):
        # same day + a distinctive venue word: candidates for venue_names_match
        toks = row.setdefault("_vt", venue_tokens(row.get("venue_name")))
        for tok in toks + ["".join(sorted(toks))]:  # "38Riv" and "38 RIV" share the compact key
            if tok:
                keys.append(("n", start_day, tok))
    if row.get("canonical_venue"):
        keys.append(("v", row["canonical_venue"]))
    if row.get("lat") is not None and row.get("lng") is not None:
        ci = math.floor(float(row["lat"]) / 0.0015)
        cj = math.floor(float(row["lng"]) / 0.0022)
        keys.append(("g", ci, cj))
    return keys


def candidate_pairs(rows: List[dict]) -> List[Tuple[int, int]]:
    """Index pairs that share a bucket (same venue, nearby, or same day + venue word)."""
    buckets: Dict[tuple, List[int]] = defaultdict(list)
    for idx, r in enumerate(rows):
        for k in _cells(r):
            buckets[k].append(idx)
    # périodes en jours ordinaux : deux lignes sans jour commun ne sont jamais comparées
    first = [(_days(r)[0].toordinal() if _days(r)[0] else 0) for r in rows]
    last = [(_days(r)[1].toordinal() if _days(r)[1] else -1) for r in rows]
    n = len(rows)
    seen = set()
    out = []
    for key, members in buckets.items():
        if key[0] == "n" and len(members) > 300:
            continue  # a venue word shared by hundreds of events that day is not distinctive
        candidates = list(members)
        if key[0] == "g":  # add neighbouring geo cells
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di or dj:
                        candidates += buckets.get(("g", key[1] + di, key[2] + dj), [])
        for x in members:
            sx = rows[x].get("source")
            fx, lx = first[x], last[x]
            for y in candidates:
                if x == y or first[y] > lx or fx > last[y]:
                    continue
                if sx == rows[y].get("source") and sx not in SAME_SOURCE_DUP_SOURCES:
                    continue  # same-source rows are never duplicates: skip before bookkeeping
                pair_key = x * n + y if x < y else y * n + x
                if pair_key not in seen:
                    seen.add(pair_key)
                    out.append((min(x, y), max(x, y)))
    return out


def group_rank(row: dict, members: List[dict], has_range: Optional[bool] = None) -> tuple:
    """canonical_rank, avec juste avant la source : « est une période » quand le groupe en
    contient une. Une date seule ne représente pas une série : « La Coccinelle et le
    Jardinier » 13/09→03/01 plutôt que la date du 03/01, « Holiday on Ice » 11→14/02 de
    Ticketmaster plutôt que le seul 11/02 du site du Zénith (dont l'heure et l'image
    sont reprises par FILL_SQL)."""
    if has_range is None:
        has_range = any(not single_day(m) for m in members)
    r = canonical_rank(row)
    return r[:2] + (int(not single_day(row)) if has_range else 1,) + r[2:]


def canonical_pool(members: List[dict]) -> List[dict]:
    """Les lignes qui peuvent être la fiche affichée d'un groupe : jamais une ligne « à
    rattacher seulement » s'il y en a une autre ; seulement les séries quand une source a
    des séances à plusieurs dates dans le groupe."""
    pool = [r for r in members if not attach_only(r)] or list(members)
    days_per_source = defaultdict(set)
    for r in pool:
        if single_day(r):
            days_per_source[r.get("source")].add(_days(r)[0])
    if any(len(d) > 1 for d in days_per_source.values()):
        # several sessions (different days) of one source joined through a run/series row
        # of another: the run is what is displayed, never one session hiding the others
        ranged = [r for r in pool if not single_day(r)]
        pool = ranged or pool
    return pool


def group_canonical(members: List[dict]) -> dict:
    """La fiche affichée d'un groupe (canonical_pool) : la mieux classée (group_rank)."""
    has_range = any(not single_day(m) for m in members)
    return max(canonical_pool(members), key=lambda r: group_rank(r, members, has_range))


class _Groups:
    """Union-find qui refuse une union créant un conflit (conflict) dans le groupe."""

    def __init__(self, rows: List[dict]):
        self.rows = rows
        self.parent = list(range(len(rows)))
        self.members: Dict[int, List[int]] = {i: [i] for i in range(len(rows))}

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, x: int, y: int, check: bool = True) -> bool:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return True
        if check and any(conflict(self.rows[p], self.rows[q])
                         for p in self.members[rx] for q in self.members[ry]):
            return False
        if len(self.members[rx]) < len(self.members[ry]):
            rx, ry = ry, rx
        self.parent[ry] = rx
        self.members[rx] += self.members.pop(ry)
        return True


def _split_without_run(rows: List[dict], idx: List[int]) -> List[List[int]]:
    """Un groupe sans période (hors articles) ne garde jamais des séances de jours
    différents : sans série pour les représenter, une séance cacherait les autres. Il est
    coupé par jour, et ses lignes « à rattacher seulement » repartent seules (rattrapage :
    « Festival Mondial du Cirque de Demain » 21→24/01 de sortiraparis tenait ensemble les
    spectacles A, B et L de quatre soirs)."""
    core = [i for i in idx if not attach_only(rows[i])]
    if any(not single_day(rows[i]) for i in core):
        return [idx]
    days = defaultdict(list)
    for i in core:
        days[_days(rows[i])[0]].append(i)
    if len(days) <= 1:
        return [idx]
    return list(days.values()) + [[i] for i in idx if attach_only(rows[i])]


def build_groups(rows: List[dict], existing: Optional[Iterable[Iterable[str]]] = None):
    """Pure : (groups, attached) où groups = {n° de groupe: [index]} et attached =
    {index d'une ligne à rattacher seulement: n° du groupe choisi}.

    existing : groupes déjà formés en base, [canonique, doublon, …] (rattrapage) : repris
    tels quels, sauf ceux dont la canonique est « à rattacher seulement » (sortiraparis,
    article), dont les membres sont regroupés à nouveau."""
    for r in rows:
        _prepare(r)
    g = _Groups(rows)
    index = {str(r["id"]): i for i, r in enumerate(rows)}
    for group in existing or []:
        idx = [index[str(i)] for i in group if str(i) in index]
        if not idx or attach_only(rows[idx[0]]):
            continue
        for i in idx[1:]:
            g.union(idx[0], i, check=False)

    pairs = candidate_pairs(rows)
    core_links = []
    extra_links = defaultdict(list)
    for x, y in pairs:
        a, b = rows[x], rows[y]
        ax, ay = attach_only(a), attach_only(b)
        if ax and ay:
            continue
        if not is_duplicate(a, b):
            continue
        if ax or ay:
            o, c = (x, y) if ax else (y, x)
            extra_links[o].append(c)
        else:
            core_links.append((x, y))
    # les liens les plus sûrs d'abord : titres identiques, puis similarité décroissante
    core_links.sort(key=lambda p: (rows[p[0]]["_tok"] != rows[p[1]]["_tok"],
                                   -_title_sim(rows[p[0]], rows[p[1]]), p))
    for x, y in core_links:
        g.union(x, y)

    groups: Dict[int, List[int]] = {}
    group_of: Dict[int, int] = {}
    for members in g.members.values():
        for part in _split_without_run(rows, sorted(members)):
            gid = len(groups)
            groups[gid] = part
            for i in part:
                group_of[i] = gid

    attached: Dict[int, int] = {}
    for o, partners in extra_links.items():
        if len(groups[group_of[o]]) > 1:
            continue  # déjà dans un groupe existant (rattrapage)
        best = None
        for c in partners:
            gid = group_of[c]
            members = [rows[i] for i in groups[gid]]
            if any(conflict(rows[o], m) for m in members):
                continue
            canon = group_canonical(members)
            if canon.get("status") != "active" and rows[o].get("status") == "active":
                continue  # ne pas cacher une ligne publiée derrière un brouillon
            key = (_title_sim(rows[o], rows[c]), canonical_rank(canon), -gid)
            if best is None or key > best[0]:
                best = (key, gid)
        if best is not None:
            attached[o] = best[1]
    return groups, attached


def find_duplicates(rows: Iterable[dict], existing: Optional[Iterable[Iterable[str]]] = None) -> Dict[str, str]:
    """Return {duplicate_id: canonical_id} for a set of candidate rows."""
    rows = [r for r in rows if r.get("start_date")]
    groups, attached = build_groups(rows, existing)
    out: Dict[str, str] = {}
    canon_of: Dict[int, str] = {}
    for root, idx in groups.items():
        if len(idx) < 2 and root not in attached.values():
            continue
        best = group_canonical([rows[i] for i in idx])
        canon_of[root] = str(best["id"])
        for i in idx:
            if str(rows[i]["id"]) != canon_of[root]:
                out[str(rows[i]["id"])] = canon_of[root]
    for o, root in attached.items():
        out[str(rows[o]["id"])] = canon_of[root]
    return out


FILL_SQL = """
UPDATE events c SET
    image_url   = COALESCE(c.image_url, d.image_url),
    short_desc  = COALESCE(c.short_desc, d.short_desc),
    description = CASE WHEN length(coalesce(c.description, '')) < 80
                        AND length(coalesce(d.description, '')) > length(coalesce(c.description, ''))
                       THEN d.description ELSE c.description END,
    booking_url = COALESCE(c.booking_url, d.booking_url),
    category_id = COALESCE(c.category_id, d.category_id),
    venue_id    = COALESCE(c.venue_id, d.venue_id),
    price_min   = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_min ELSE c.price_min END,
    price_max   = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_max ELSE c.price_max END,
    is_free     = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.is_free ELSE c.is_free END,
    price_status = CASE WHEN c.price_status = 'unknown' AND d.price_status <> 'unknown' THEN d.price_status ELSE c.price_status END,
    start_date  = CASE WHEN NOT c.time_known AND d.time_known
                        AND (c.start_date AT TIME ZONE 'Europe/Paris')::date = (d.start_date AT TIME ZONE 'Europe/Paris')::date
                        AND (c.end_date IS NULL OR c.end_date >= d.start_date)
                       THEN d.start_date ELSE c.start_date END,
    time_known  = c.time_known OR (d.time_known
                        AND (c.start_date AT TIME ZONE 'Europe/Paris')::date = (d.start_date AT TIME ZONE 'Europe/Paris')::date
                        AND (c.end_date IS NULL OR c.end_date >= d.start_date)),
    updated_at  = now()
FROM events d
WHERE c.id = %(canonical)s AND d.id = %(dup)s
"""


MARK_SQL = "UPDATE events SET canonical_event_id = %(canonical)s, updated_at = now() WHERE id = %(dup)s AND id <> %(canonical)s"
# rows that pointed at the (now) duplicate follow it to the canonical
FOLLOW_SQL = "UPDATE events SET canonical_event_id = %(canonical)s WHERE canonical_event_id = %(dup)s"

# Doublons dont la fiche canonique n'est plus vivante (rejetée, expirée, terminée) : ils
# étaient cachés derrière une fiche invisible (734 sorties le 23/11/2026, ex. « Déni »
# d'Offi jusqu'au 10/01 derrière une séance expirée). Libérés avant le dédoublonnage, qui
# les rattache à nouveau s'ils ont un doublon vivant.
RELEASE_SQL = """
UPDATE events d SET canonical_event_id = NULL, updated_at = now()
WHERE d.canonical_event_id IS NOT NULL
  AND d.status IN ('active', 'draft')
  AND coalesce(d.end_date, d.start_date) >= now() - interval '6 hours'
  AND NOT EXISTS (
      SELECT 1 FROM events c
      WHERE c.id = d.canonical_event_id
        AND c.status IN ('active', 'draft')
        AND coalesce(c.end_date, c.start_date) >= now() - interval '6 hours')
"""

ROWS_SQL = """
SELECT e.id, e.source, e.title, e.start_date, e.end_date, e.status,
       e.quality_score, e.created_at, e.price_status, (e.image_url IS NOT NULL) AS has_image,
       COALESCE(v.canonical_venue_id, v.id) AS canonical_venue,
       COALESCE(c.lat, v.lat) AS lat, COALESCE(c.lng, v.lng) AS lng,
       COALESCE(c.name, v.name) AS venue_name, v.name AS venue_own_name,
       COALESCE(c.zip_code, v.zip_code) AS zip_code,
       e.time_known
FROM events e
JOIN venues v ON v.id = e.venue_id
LEFT JOIN venues c ON c.id = v.canonical_venue_id
WHERE e.status IN ('active', 'draft')
  AND e.canonical_event_id IS NULL
  AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
"""


def run_dedup(conn) -> int:
    """Find and mark cross-source duplicates among live events. Returns #rows marked."""
    cur = conn.cursor()
    cur.execute(RELEASE_SQL)
    released = cur.rowcount
    cur.execute(ROWS_SQL)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    mapping = find_duplicates(rows)
    # Batched: a few round trips per 200 duplicates instead of 5 per duplicate.
    items = [{"canonical": c, "dup": d} for d, c in mapping.items()]
    marked = 0
    for i in range(0, len(items), 200):
        chunk = items[i:i + 200]
        cur.execute("SAVEPOINT dedup")
        try:
            _exec_many(cur, FILL_SQL, chunk)
            _exec_many(cur, MARK_SQL, chunk)
            _exec_many(cur, FOLLOW_SQL, chunk)
            cur.execute("RELEASE SAVEPOINT dedup")
            marked += len(chunk)
            continue
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT dedup")
        for p in chunk:  # replay one by one so a bad pair does not block the batch
            cur.execute("SAVEPOINT dedup")
            try:
                for sql in (FILL_SQL, MARK_SQL, FOLLOW_SQL):
                    cur.execute(sql, p)
                cur.execute("RELEASE SAVEPOINT dedup")
                marked += 1
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT dedup")
                print(f"  [dedup] {p['dup']} → {p['canonical']} failed: {e}")
    conn.commit()
    cur.close()
    print(f"[dedup] {released} doublons libérés (fiche canonique plus vivante), "
          f"{len(rows)} live events scanned, {marked} marked as duplicates")
    return marked
