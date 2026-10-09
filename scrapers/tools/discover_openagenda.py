"""
Discover public OpenAgenda agendas with events in Paris + petite couronne (75/92/93/94).

No API key needed: it uses the public JSON that the openagenda.com front-end itself
calls (robots.txt allows everything, checked 2026-10-09):

  GET https://openagenda.com/agendas.json?search=<kw>&official=1&size=100[&after[]=…]
      → {total, after, agendas: [{uid, title, slug, official, description, locationSet,
         network, summary: {keywords, publishedEvents: {upcoming, current, passed}}}]}
  GET https://openagenda.com/agendas/<uid>/events.v2.json?relative[]=current
      &relative[]=upcoming&size=100&includeFields[]=location.postalCode&…
      → {total, events: [{uid, location: {postalCode, address, department, …}}]}

Pipeline:
  1. search every keyword (communes of 92/93/94, Paris, institutions, themes);
  2. keep official agendas with ≥ MIN_ACTIVE current+upcoming events (with
     --include-unofficial also non-official ones, ≥ 5 events), not blacklisted
     (religious services, social services, trade fairs, jobs…), not already configured;
  3. sample up to 100 current/upcoming events of each candidate (locations only) and
     keep it when at least one is in 75/92/93/94. mode "all" when ≥ 50 % of the located
     events are in zone, else mode "dept" (the spider then filters server-side with
     `department[]`);
  4. print config lines for spiders/openagenda_config.py and write a JSON report.

Politeness: honest PanameClubBot UA, 1 request / second, responses cached on disk
(--cache) so re-runs cost nothing. A full run is ~200 searches + ~600 samples ≈ 15 min.

Usage (from scrapers/):
  .venv/bin/python -m tools.discover_openagenda --cache /tmp/oa-cache \
      --report /tmp/oa-report.json --snippet /tmp/oa-snippet.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from spiders.openagenda import ZONE_DEPARTMENTS, location_department, location_zone  # noqa: E402
from spiders.openagenda_config import AGENDA_IDS, OUT_OF_ZONE_AGENDA_IDS, DISABLED_AGENDA_IDS  # noqa: E402
from utils.http import PoliteClient  # noqa: E402
from utils.normalize import detect_category  # noqa: E402

SEARCH_URL = "https://openagenda.com/agendas.json"
EVENTS_URL = "https://openagenda.com/agendas/{uid}/events.v2.json"

MIN_ACTIVE = 2            # current + upcoming events announced by the agenda summary
SAMPLE_SIZE = 100
ALL_MODE_SHARE = 0.5      # ≥ 50 % of located events in zone → fetch everything
MAX_SEARCH_PAGES = 10
MIN_CULTURAL_SHARE = 0.25  # sampled events whose title/keywords map to one of our categories
MIN_IN_ZONE_DEPT_MODE = 3
# Non-official agendas (venues, associations, festivals that did not request the
# "official" badge) are only kept with --include-unofficial and stricter rules.
MIN_ACTIVE_UNOFFICIAL = 5
UNOFFICIAL_MIN_SHARE = 0.8
MIN_CULTURAL_SHARE_UNOFFICIAL = 0.4  # a mostly-out-of-zone agenda must still bring a few events

COMMUNES_92 = [
    "Antony", "Asnières-sur-Seine", "Bagneux", "Bois-Colombes", "Boulogne-Billancourt",
    "Bourg-la-Reine", "Châtenay-Malabry", "Châtillon", "Chaville", "Clamart", "Clichy",
    "Colombes", "Courbevoie", "Fontenay-aux-Roses", "Garches", "La Garenne-Colombes",
    "Gennevilliers", "Issy-les-Moulineaux", "Levallois-Perret", "Malakoff",
    "Marnes-la-Coquette", "Meudon", "Montrouge", "Nanterre", "Neuilly-sur-Seine",
    "Le Plessis-Robinson", "Puteaux", "Rueil-Malmaison", "Saint-Cloud", "Sceaux", "Sèvres",
    "Suresnes", "Vanves", "Vaucresson", "Ville-d'Avray", "Villeneuve-la-Garenne",
]
COMMUNES_93 = [
    "Aubervilliers", "Aulnay-sous-Bois", "Bagnolet", "Le Blanc-Mesnil", "Bobigny", "Bondy",
    "Le Bourget", "Clichy-sous-Bois", "Coubron", "La Courneuve", "Drancy", "Dugny",
    "Épinay-sur-Seine", "Gagny", "Gournay-sur-Marne", "L'Île-Saint-Denis", "Les Lilas",
    "Livry-Gargan", "Montfermeil", "Montreuil", "Neuilly-Plaisance", "Neuilly-sur-Marne",
    "Noisy-le-Grand", "Noisy-le-Sec", "Pantin", "Les Pavillons-sous-Bois",
    "Pierrefitte-sur-Seine", "Le Pré-Saint-Gervais", "Le Raincy", "Romainville",
    "Rosny-sous-Bois", "Saint-Denis", "Saint-Ouen", "Sevran", "Stains",
    "Tremblay-en-France", "Vaujours", "Villemomble", "Villepinte", "Villetaneuse",
]
COMMUNES_94 = [
    "Ablon-sur-Seine", "Alfortville", "Arcueil", "Boissy-Saint-Léger", "Bonneuil-sur-Marne",
    "Bry-sur-Marne", "Cachan", "Champigny-sur-Marne", "Charenton-le-Pont",
    "Chennevières-sur-Marne", "Chevilly-Larue", "Choisy-le-Roi", "Créteil",
    "Fontenay-sous-Bois", "Fresnes", "Gentilly", "L'Haÿ-les-Roses", "Ivry-sur-Seine",
    "Joinville-le-Pont", "Le Kremlin-Bicêtre", "Limeil-Brévannes", "Maisons-Alfort",
    "Mandres-les-Roses", "Marolles-en-Brie", "Nogent-sur-Marne", "Noiseau", "Orly",
    "Ormesson-sur-Marne", "Périgny", "Le Perreux-sur-Marne", "Le Plessis-Trévise",
    "La Queue-en-Brie", "Rungis", "Saint-Mandé", "Saint-Maur-des-Fossés", "Saint-Maurice",
    "Santeny", "Sucy-en-Brie", "Thiais", "Valenton", "Villecresnes", "Villejuif",
    "Villeneuve-le-Roi", "Villeneuve-Saint-Georges", "Villiers-sur-Marne", "Vincennes",
    "Vitry-sur-Seine",
]
TERRITORIES = [
    "Paris", "Ville de Paris", "mairie arrondissement", "Paris Musées", "Hauts-de-Seine",
    "Seine-Saint-Denis", "Val-de-Marne", "Est Ensemble", "Plaine Commune",
    "Paris Terres d'Envol", "Grand-Orly Seine Bièvre", "Paris Est Marne et Bois",
    "Grand Paris Sud Est Avenir", "Vallée Sud Grand Paris", "Paris Ouest La Défense",
    "Boucle Nord de Seine", "Grand Paris Seine Ouest", "Grand Paris Grand Est",
    "Métropole du Grand Paris", "Île-de-France", "Grand Paris", "La Défense",
]
THEMES = [
    "bibliothèque", "bibliothèques", "médiathèque", "médiathèques", "conservatoire", "musée",
    "musées", "université", "sorbonne", "théâtre", "scène nationale", "festival", "cinéma",
    "concert", "musiques actuelles", "danse", "exposition", "centre culturel",
    "centre d'art", "maison des arts", "saison culturelle", "agenda culturel", "culture",
    "archives", "patrimoine", "parc", "jardin", "science", "fête de la science",
    "MJC", "maison de quartier", "maison des jeunes", "ludothèque", "street art", "jazz",
    "opéra", "orchestre", "cirque", "marionnette", "littérature", "librairie", "poésie",
    "photographie", "architecture", "institut culturel", "cité universitaire", "CNAM",
    "Collège de France", "BnF", "Muséum", "Bpi", "MC93", "Centre national de la danse",
    "Philharmonie", "Centquatre", "Maison des métallos", "Cité de l'architecture",
    "La Villette", "Institut du monde arabe", "Sciences Po", "ENS", "Inalco",
    "École des Beaux-Arts", "Mois du film documentaire", "Nuit blanche",
    "Journées du matrimoine", "salon du livre", "Banlieues bleues", "Villes des musiques du monde",
    "Africolor", "Festival d'automne", "Rencontres chorégraphiques",
    # second pass (2026-10-09): venue types and Paris neighbourhoods
    "salle de concert", "galerie", "atelier", "compagnie", "ensemble", "chorale",
    "centre social", "maison de la culture", "espace culturel", "tiers-lieu", "lecture",
    "club", "café", "péniche", "cabaret", "humour", "stand-up", "slam", "conte",
    "électro", "hip hop", "musique classique", "orgue", "chanson", "rock", "bal",
    "vernissage", "visite guidée", "balade urbaine", "conférence", "rencontre", "débat",
    "jeune public", "famille", "enfants", "quartier", "association culturelle",
    "Belleville", "Montmartre", "Marais", "Ménilmontant", "Bastille", "Batignolles",
    "Montparnasse", "Pigalle", "Butte-aux-Cailles", "Canal Saint-Martin", "La Chapelle",
    "Goutte d'Or", "Oberkampf", "Quartier latin", "Saint-Germain", "Paris 10", "Paris 11",
    "Paris 12", "Paris 13", "Paris 14", "Paris 15", "Paris 17", "Paris 18", "Paris 19",
    "Paris 20",
]

# Agendas that are official and active but not cultural outings (decided by the
# previous curation of openagenda_config.py, extended here).
BLACKLIST_RE = re.compile(
    r"dioc[eè]se|paroisse|\b[ée]glise\b|cath[ée]drale|chapelle|sanctuaire|basilique|"
    r"\bmesses?\b|allocations familiales|\bcaf\b|colos? apprenantes|aide[s]? vacances|"
    r"structures? d.accueil|h[ée]bergement|emploi|recrutement|job ?dating|"
    r"\bunimev\b|salon (professionnel|du cheval|nautique)|smart (food|weeks)|"
    r"conseil municipal|info jeunes|d[ée]cider pour paris|"
    r"formation continue|webinaire|webinar|s[ée]minaires? de recherche|soutenance|"
    r"don du sang|vaccination|d[ée]pistage|entrepreneu|\btpe\b|\bpme\b|france num|"
    r"appels? [àa] candidature|facult[ée] de m[ée]decine|[ée]nergie|recherche et de l.innovation|"
    r"chambres? d.agriculture|chambre de commerce|\bcci\b|f[ée]d[ée]ration (anarchiste|fran[cç]aise)",
    re.I,
)


# Reviewed by hand on 2026-10-09 (sampled event titles): kept out on purpose.
EXCLUDED_UIDS = {
    648405: "'Que faire à Paris' mirror — duplicate of the paris_opendata source",
    4125758: "L'Officiel des spectacles — duplicate of the offi source",
    34565671: "religious services (Tous les événements catho)",
    2749382: "AFC France — family associations, mostly trainings",
    65333215: "Espace Parent-Enfant — parenting talks, not outings",
    76305859: "Mission Vivre ensemble — trainings for social workers",
    88130979: "DAAC — calls for applications for schools",
    53854747: "'structure production' — unclear agenda, 2 events",
}


# ─────────────────────────── HTTP with a disk cache ───────────────────────────

class CachedClient:
    def __init__(self, cache_dir: Optional[Path]):
        self.cache = cache_dir
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = PoliteClient(delay=1.0, timeout=30.0)
        self.hits = self.requests = 0

    def get_json(self, url: str, params: List[Tuple[str, str]]):
        key = hashlib.sha1((url + "?" + json.dumps(params)).encode()).hexdigest()
        path = self.cache / f"{key}.json" if self.cache else None
        if path and path.exists():
            self.hits += 1
            return json.loads(path.read_text())
        self.requests += 1
        data = self.client.get_json(url, params=params)
        if data is not None and path:
            path.write_text(json.dumps(data, ensure_ascii=False))
        return data

    def close(self):
        self.client.close()


# ─────────────────────────── steps ───────────────────────────

def search(client: CachedClient, keyword: str, official: bool = True,
           max_pages: int = MAX_SEARCH_PAGES) -> List[dict]:
    """official=True → official=1 agendas only; False → official=0 (non-official) only."""
    out: List[dict] = []
    after = None
    for _ in range(max_pages):
        # lower-case: the search is noticeably fuzzier with capitalised words
        params = [("search", keyword.lower()), ("size", "100")]
        params.append(("official", "1" if official else "0"))
        if after:
            params += [("after[]", str(a)) for a in after]
        data = client.get_json(SEARCH_URL, params)
        if not data or not data.get("agendas"):
            break
        out.extend(data["agendas"])
        after = data.get("after")
        if not after or len(data["agendas"]) < 100:
            break
    return out


def active_count(agenda: dict) -> int:
    pe = ((agenda.get("summary") or {}).get("publishedEvents") or {})
    return int(pe.get("upcoming") or 0) + int(pe.get("current") or 0)


def blacklisted(agenda: dict) -> Optional[str]:
    text = " ".join(str(x or "") for x in (
        agenda.get("title"), agenda.get("description"),
        (agenda.get("network") or {}).get("title"), (agenda.get("locationSet") or {}).get("title"),
    ))
    m = BLACKLIST_RE.search(text)
    return m.group(0) if m else None


def sample_zone(client: CachedClient, uid: int, size: int = SAMPLE_SIZE) -> dict:
    params = [("relative[]", "current"), ("relative[]", "upcoming"), ("size", str(size))]
    for f in ("uid", "location.postalCode", "location.address", "location.department",
              "location.adminLevel2", "location.latitude", "location.longitude", "location.city",
              "attendanceMode", "title", "keywords"):
        params.append(("includeFields[]", f))
    data = client.get_json(EVENTS_URL.format(uid=uid), params)
    if data is None:
        return {"error": True}
    zones: Counter = Counter()
    depts: Counter = Counter()
    online = cultural = 0
    for ev in data.get("events") or []:
        kw = ev.get("keywords")
        if isinstance(kw, dict):
            kw = kw.get("fr") or kw.get("en") or []
        title = ev.get("title")
        if isinstance(title, dict):
            title = title.get("fr") or next(iter(title.values()), "")
        if detect_category(", ".join(map(str, kw or [])) or None, str(title or "")):
            cultural += 1
        if ev.get("attendanceMode") == 2:
            online += 1
            continue
        loc = ev.get("location") or {}
        z = location_zone(loc)
        zones[z] += 1
        if z == "in":
            depts[location_department(loc) or "75"] += 1
        elif z == "out":
            depts[location_department(loc) or "?"] += 1
    return {
        "total": int(data.get("total") or 0),
        "sampled": len(data.get("events") or []),
        "in": zones["in"], "out": zones["out"], "unknown": zones["unknown"], "online": online,
        "cultural": cultural,
        "depts": dict(depts),
    }


CULTURAL_TITLE_RE = re.compile(
    r"m[ée]diath[eè]que|biblioth[eè]que|th[ée][aâ]tre|conservatoire|mus[ée]e|cin[ée]ma|sc[eè]ne|"
    r"festival|cultur|concert|jazz|danse|op[ée]ra|\barts?\b|palais|d[ée]couverte|science|saison|"
    r"programmation|spectacle|livre|librairie|musique|cirque|patrimoine|exposition|galerie",
    re.I,
)


def cultural_title(agenda_row: dict) -> bool:
    return bool(CULTURAL_TITLE_RE.search(f"{agenda_row.get('title') or ''} {agenda_row.get('description') or ''}"))


def classify(stats: dict, official: bool = True, cultural_name: bool = False
             ) -> Tuple[Optional[str], Optional[str], str]:
    """→ (mode 'all'|'dept'|None, main department, reason).

    Non-official agendas must be stricter: mostly in zone (mode 'all' only) and clearly
    cultural. Agendas whose name says they are cultural skip the event-category check
    (artist names rarely map to a category)."""
    if stats.get("error"):
        return None, None, "events not readable"
    if stats["in"] == 0:
        return None, None, "no sampled event in 75/92/93/94"
    min_cult = MIN_CULTURAL_SHARE if official else MIN_CULTURAL_SHARE_UNOFFICIAL
    if not official and stats["sampled"] < MIN_ACTIVE_UNOFFICIAL:
        return None, None, f"non-official with only {stats['sampled']} events"
    if stats["sampled"] and stats["cultural"] / stats["sampled"] < min_cult and not (
            cultural_name and official):
        return None, None, f"off-topic ({stats['cultural']}/{stats['sampled']} events with a category)"
    located = stats["in"] + stats["out"]
    share = stats["in"] / located if located else 0
    in_depts = {d: n for d, n in stats["depts"].items() if d in ZONE_DEPARTMENTS}
    main = max(in_depts, key=in_depts.get) if in_depts else "75"
    if not official:
        if share >= UNOFFICIAL_MIN_SHARE:
            return "all", main, f"non-official, {share:.0%} in zone"
        return None, None, f"non-official and only {share:.0%} in zone"
    if share >= ALL_MODE_SHARE:
        return "all", main, f"{share:.0%} in zone"
    if stats["in"] < MIN_IN_ZONE_DEPT_MODE:
        return None, None, f"only {stats['in']} sampled events in zone ({share:.0%})"
    return "dept", "idf", f"only {share:.0%} in zone → department[] filter"


def keywords() -> Iterable[str]:
    seen = set()
    for kw in TERRITORIES + COMMUNES_92 + COMMUNES_93 + COMMUNES_94 + THEMES:
        if kw.lower() not in seen:
            seen.add(kw.lower())
            yield kw


def py_comment(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).replace("#", "").strip()[:70]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=None, help="directory for cached JSON responses")
    ap.add_argument("--report", type=Path, default=None, help="write the full JSON report here")
    ap.add_argument("--snippet", type=Path, default=None, help="write config lines here")
    ap.add_argument("--min-active", type=int, default=MIN_ACTIVE)
    ap.add_argument("--keywords", nargs="*", help="override the keyword list")
    ap.add_argument("--max-candidates", type=int, default=3000)
    ap.add_argument("--include-unofficial", action="store_true",
                    help="also search non-official agendas (stricter keep rules)")
    args = ap.parse_args(argv)

    client = CachedClient(args.cache)
    known = set(AGENDA_IDS) | set(OUT_OF_ZONE_AGENDA_IDS) | set(DISABLED_AGENDA_IDS)
    agendas: Dict[int, dict] = {}
    found_by: Dict[int, List[str]] = {}
    try:
        kws = list(args.keywords or keywords())
        for i, kw in enumerate(kws, 1):
            res = search(client, kw)
            if args.include_unofficial:
                res = res + search(client, kw, official=False)
            for a in res:
                uid = a.get("uid")
                if uid is None:
                    continue
                agendas.setdefault(uid, a)
                found_by.setdefault(uid, []).append(kw)
            print(f"[search {i}/{len(kws)}] {kw!r}: {len(res)} agendas "
                  f"(unique so far {len(agendas)})", flush=True)

        report = []
        candidates = []
        for uid, a in agendas.items():
            row = {"uid": uid, "title": a.get("title"), "slug": a.get("slug"),
                   "official": a.get("official"), "active": active_count(a),
                   "upcoming": ((a.get("summary") or {}).get("publishedEvents") or {}).get("upcoming"),
                   "current": ((a.get("summary") or {}).get("publishedEvents") or {}).get("current"),
                   "network": (a.get("network") or {}).get("title"),
                   "keywords": found_by.get(uid, [])[:5]}
            if uid in known:
                row["decision"] = "already configured"
            elif uid in EXCLUDED_UIDS:
                row["decision"] = f"excluded by hand: {EXCLUDED_UIDS[uid]}"
            elif not a.get("official") and not args.include_unofficial:
                row["decision"] = "not official"
            elif row["active"] < (args.min_active if a.get("official") else MIN_ACTIVE_UNOFFICIAL):
                row["decision"] = f"inactive ({row['active']} current+upcoming)"
            elif blacklisted(a):
                row["decision"] = f"blacklisted ({blacklisted(a)})"
            else:
                candidates.append(row)
                row["decision"] = "candidate"
            report.append(row)
        candidates.sort(key=lambda r: -r["active"])
        candidates = candidates[: args.max_candidates]
        print(f"\n{len(agendas)} agendas found, {len(candidates)} candidates to sample", flush=True)

        for i, row in enumerate(candidates, 1):
            stats = sample_zone(client, row["uid"])
            mode, dept, reason = classify(stats, official=bool(row["official"]),
                                          cultural_name=cultural_title(agendas[row["uid"]]))
            row.update(sample=stats, mode=mode, dept=dept,
                       decision=("keep" if mode else "drop") + f": {reason}")
            if i % 25 == 0:
                print(f"[sample {i}/{len(candidates)}] (requests {client.requests}, cache {client.hits})",
                      flush=True)
    finally:
        client.close()

    kept = [r for r in report if r.get("mode")]
    order = {"75": 0, "idf": 1, "92": 2, "93": 3, "94": 4}
    kept.sort(key=lambda r: (order.get(r["dept"], 9), -r["active"]))
    today = date.today().isoformat()
    lines = []
    for r in kept:
        s = r["sample"]
        lines.append(
            f'    ({r["uid"]}, "{r["dept"]}", "{r["mode"]}"),'
            f'  # {"" if r["official"] else "[non-official] "}{py_comment(r["title"])} — {r["upcoming"]}/{r["current"]}, '
            f'{s["in"]}/{s["in"] + s["out"]} in zone  # discovered {today}'
        )
    by_dept = Counter(r["dept"] for r in kept)
    print(f"\nKEPT {len(kept)} agendas: {dict(by_dept)}")
    print(f"HTTP requests {client.requests}, cache hits {client.hits}")
    if args.snippet:
        args.snippet.write_text("\n".join(lines) + "\n")
    else:
        print("\n".join(lines))
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
