"""
Rattrapage des doublons sur les sorties vivantes, avec les règles de pipelines/dedup.py
(titres équivalents au même lieu, heures, expos qui se chevauchent, priorité de source,
articles jamais canoniques).

Usage (depuis scrapers/) :
  python -m tools.backfill_doublons                      # --dry-run (défaut) : lecture seule
  python -m tools.backfill_doublons --garder-canoniques  # ne change pas la fiche affichée
                                                         # des groupes déjà formés
  python -m tools.backfill_doublons --apply              # sauvegarde puis écrit
  python -m tools.backfill_doublons --rollback events_dedup_backup_20261123

Ce qui est recalculé :
- les groupes déjà formés en base (canonical_event_id) sont repris tels quels, puis
  agrandis par les nouvelles règles ; aucun groupe existant n'est défait ;
- un doublon dont la fiche canonique n'est plus vivante (rejetée, expirée, terminée) est
  libéré : rattaché à nouveau s'il a un doublon vivant, sinon ré-affiché ;
- la fiche canonique de chaque groupe est choisie par pipelines.dedup.group_canonical
  (venue_* > billetteries > open data > sortiraparis ; série qui couvre la période ;
  prix connu et image). Une fiche déjà affichée reste affichée quand la nouvelle n'est
  pas strictement meilleure sur ces critères (pas de bascule pour un départage à la note
  de qualité). Une « bascule » = un groupe existant dont la fiche affichée change ;
- comme au dédoublonnage quotidien (FILL_SQL), la fiche affichée reçoit ce qui lui manque
  depuis ses doublons : prix (si inconnu), image, accroche, description (< 80 caractères).

--apply crée d'abord events_dedup_backup_<date>(id, canonical_event_id, price_min,
price_max, price_status, is_free, image_url, short_desc, description) avec l'état
d'origine de chaque ligne touchée, puis écrit par lots de 500 (une ligne n'est écrite
que si elle n'a pas changé entre-temps). --rollback <table> remet ces valeurs.
Relancer ensuite la synchronisation Meilisearch (python cron.py --post) pour la recherche.
Ne pas lancer pendant le dédoublonnage quotidien (Actions « Daily Scraper », 5 h 30 et
15 h 30 UTC).
"""

from __future__ import annotations

import argparse
import os
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipelines.dedup import (  # noqa: E402
    DERIVED_ACTIVITY_WORDS,
    GENERIC_TITLE_WORDS,
    _days,
    _minutes_apart,
    _title_sim,
    build_groups,
    candidate_pairs,
    canonical_pool,
    dates_match,
    group_canonical,
    group_rank,
    is_duplicate,
    time_known,
    times_compatible,
)
from tools.backfill_db import begin, connect, fetch_dicts  # noqa: E402
from utils.dates import PARIS  # noqa: E402

CHUNK = 500
SHORT_DESCRIPTION = 80

ROWS_SQL = """
SELECT e.id::text AS id, e.source, e.title, e.start_date, e.end_date, e.status, e.quality_score,
       e.created_at, e.time_known, e.price_min, e.price_max, e.price_status, e.is_free,
       (e.image_url IS NOT NULL) AS has_image, (e.short_desc IS NOT NULL) AS has_short,
       length(coalesce(e.description, '')) AS desc_len,
       e.canonical_event_id::text AS canonical_event_id,
       COALESCE(v.canonical_venue_id, v.id)::text AS canonical_venue,
       COALESCE(c.lat, v.lat) AS lat, COALESCE(c.lng, v.lng) AS lng,
       COALESCE(c.name, v.name) AS venue_name, v.name AS venue_own_name,
       COALESCE(c.zip_code, v.zip_code) AS zip_code,
       coalesce(s.n, 0) + coalesce(a.n, 0) + coalesce(r.n, 0) AS member_activity
FROM events e
LEFT JOIN venues v ON v.id = e.venue_id
LEFT JOIN venues c ON c.id = v.canonical_venue_id
LEFT JOIN (SELECT event_id, count(*) AS n FROM user_saves GROUP BY 1) s ON s.event_id = e.id
LEFT JOIN (SELECT event_id, count(*) AS n FROM user_attendances GROUP BY 1) a ON a.event_id = e.id
LEFT JOIN (SELECT event_id, count(*) AS n FROM event_reviews GROUP BY 1) r ON r.event_id = e.id
WHERE e.status IN ('active', 'draft')
  AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
"""

# Même remplissage que pipelines.dedup.FILL_SQL, limité aux champs sauvegardés.
FILL_SQL = """
UPDATE events c SET
    image_url   = COALESCE(c.image_url, d.image_url),
    short_desc  = COALESCE(c.short_desc, d.short_desc),
    description = CASE WHEN length(coalesce(c.description, '')) < 80
                        AND length(coalesce(d.description, '')) > length(coalesce(c.description, ''))
                       THEN d.description ELSE c.description END,
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

BACKUP_COLUMNS = ("id, canonical_event_id, price_min, price_max, price_status, is_free, image_url, short_desc, "
                  "description, start_date, time_known")


# ─────────────────────────── plan (pur) ───────────────────────────

def _class(row: dict, members: List[dict]) -> tuple:
    """Critères qui justifient une bascule : publiée, pas un article, rang de la source,
    période plutôt que date seule, prix connu et image. Jamais la note de qualité seule."""
    return group_rank(row, members)[:5]


def fill_pairs(canon: dict, members: List[dict]) -> tuple:
    """Pure : [(canonique, donneur)] dans l'ordre de rang, et ce que chacun apporte."""
    state = {"image": bool(canon.get("has_image")), "short": bool(canon.get("has_short")),
             "desc": canon.get("desc_len") or 0, "price": canon.get("price_status") in ("paid", "free"),
             "time": bool(canon.get("time_known"))}
    pairs, gains = [], Counter()
    has_range = any(_days(m)[0] != _days(m)[1] for m in members)
    for d in sorted((m for m in members if m is not canon), key=lambda m: group_rank(m, members, has_range),
                    reverse=True):
        got = []
        if not state["image"] and d.get("has_image"):
            state["image"] = True
            got.append("image")
        if not state["short"] and d.get("has_short"):
            state["short"] = True
            got.append("accroche")
        if state["desc"] < SHORT_DESCRIPTION and (d.get("desc_len") or 0) > state["desc"]:
            state["desc"] = d.get("desc_len") or 0
            got.append("description")
        if not state["price"] and d.get("price_status") in ("paid", "free"):
            state["price"] = True
            got.append("prix")
        if not state["time"] and d.get("time_known") and _days(d)[0] == _days(canon)[0]:
            state["time"] = True
            got.append("heure")
        if got:
            pairs.append((canon["id"], d["id"]))
            gains.update(got)
    return pairs, gains


def plan(rows: List[dict], keep_canonicals: bool = False) -> dict:
    """Pure : ce qu'il faudrait écrire. Retourne desired {id: canonique ou None},
    changes [(id, ancien, nouveau)], fills [(canonique, donneur)], groups, stats."""
    by_id = {r["id"]: r for r in rows}
    existing: Dict[str, List[str]] = defaultdict(list)
    orphans = set()
    for r in rows:
        c = r.get("canonical_event_id")
        if c:
            if c in by_id:
                existing[c].append(r["id"])
            else:
                orphans.add(r["id"])  # caché derrière une fiche qui n'est plus vivante
    usable = [r for r in rows if r.get("start_date")]
    groups, attached = build_groups(usable, [[c] + m for c, m in existing.items()])
    extra_of = defaultdict(list)
    for o, root in attached.items():
        extra_of[root].append(o)

    desired: Dict[str, Optional[str]] = {r["id"]: None for r in rows}
    final_groups = []
    for root, idx in groups.items():
        if len(idx) < 2 and root not in extra_of:
            continue
        members = [usable[i] for i in idx]
        canon = group_canonical(members)
        # fiches déjà affichées du groupe (plusieurs si le groupe en réunit plusieurs)
        pool_ids = {m["id"] for m in canonical_pool(members)}
        current = [m for m in members if not m.get("canonical_event_id") and m["id"] in existing
                   and m["id"] in pool_ids]
        if current:
            best_current = max(current, key=lambda m: group_rank(m, members))
            if keep_canonicals or _class(best_current, members) >= _class(canon, members):
                canon = best_current  # pas de bascule sans gain réel
        everyone = members + [usable[o] for o in extra_of.get(root, [])]
        for m in everyone:
            desired[m["id"]] = None if m["id"] == canon["id"] else canon["id"]
        final_groups.append((canon, everyone))

    changes = [(i, by_id[i].get("canonical_event_id"), d) for i, d in desired.items()
               if (by_id[i].get("canonical_event_id") or None) != d]
    changed_ids = {i for i, _, _ in changes}

    fills, gains = [], Counter()
    for canon, everyone in final_groups:
        if not any(m["id"] in changed_ids for m in everyone):
            continue  # groupe inchangé : le dédoublonnage quotidien l'a déjà rempli
        p, g = fill_pairs(canon, everyone)
        fills += p
        gains.update(g)

    # ── décompte ──
    st = Counter()
    for i, old, new in changes:
        r = by_id[i]
        if old is None and new is not None:
            st["lignes_rattachees"] += 1
            if i in existing and new in existing[i]:
                st["dont_bascules"] += 1  # l'ancienne fiche passe derrière un de ses doublons
            else:
                st["dont_nouvelles_fusions"] += 1
            if (r.get("member_activity") or 0) > 0:
                st["dont_avec_activite_membre"] += 1
        elif old is not None and new is None:
            st["orphelins_reaffiches" if i in orphans else "doublons_devenus_canoniques"] += 1
        else:
            st["orphelins_rattaches_ailleurs" if i in orphans else "doublons_repointes"] += 1
    st["groupes"] = len(final_groups)
    st["groupes_modifies"] = sum(1 for _, ev in final_groups if any(m["id"] in changed_ids for m in ev))
    st["orphelins"] = len(orphans)
    for k, v in gains.items():
        st[f"remplissage_{k}"] = v
    st["affichees_avant"] = sum(1 for r in rows if not r.get("canonical_event_id"))
    st["affichees_apres"] = sum(1 for d in desired.values() if d is None)
    return {"desired": desired, "changes": changes, "fills": fills, "groups": final_groups,
            "stats": st, "by_id": by_id, "orphans": orphans}


def refusal_reason(a: dict, b: dict) -> Optional[str]:
    """Pourquoi deux lignes proches ne sont pas fusionnées (None = doublons)."""
    if is_duplicate(a, b):
        return None
    if a.get("source") == b.get("source"):
        return "même source"
    if not dates_match(a, b):
        return "dates disjointes"
    if not times_compatible(a, b):
        return f"heures connues et différentes ({int(_minutes_apart(a, b) or 0)} min d'écart)"
    if a["_digits"] and b["_digits"] and a["_digits"] != b["_digits"]:
        return "nombres différents"
    if (set(a["_tok"]) ^ set(b["_tok"])) & DERIVED_ACTIVITY_WORDS:
        return "activité dérivée (visite, atelier…)"
    short = min((a["_tok"], b["_tok"]), key=len)
    if short and all(w in GENERIC_TITLE_WORDS or w in (a["_vw"] | b["_vw"]) for w in short):
        return "titre court générique ou nom du lieu"
    return "titres non équivalents"


# ─────────────────────────── sortie lisible ───────────────────────────

def _fmt(r: dict) -> str:
    start = r["start_date"].astimezone(PARIS)
    t = start.strftime("%H:%M") if time_known(r) else "heure ?"
    s, e = _days(r)
    when = f"{s:%d/%m}" if s == e else f"{s:%d/%m}→{e:%d/%m}"
    price = {"paid": "prix", "free": "gratuit"}.get(r.get("price_status"), "prix ?")
    return f"[{r['source']}] « {r['title'][:90]} » {when} {t}, {price}{', image' if r.get('has_image') else ''}"


def print_report(p: dict, rows: List[dict], examples: int = 40, refusals: int = 10) -> None:
    st, by_id, desired = p["stats"], p["by_id"], p["desired"]
    print(f"[doublons] {len(by_id)} sorties vivantes lues, {st['affichees_avant']} affichées")
    for k in ("groupes", "groupes_modifies", "lignes_rattachees", "dont_nouvelles_fusions", "dont_bascules",
              "dont_avec_activite_membre", "doublons_devenus_canoniques", "doublons_repointes", "orphelins",
              "orphelins_reaffiches", "orphelins_rattaches_ailleurs", "remplissage_prix", "remplissage_image",
              "remplissage_description", "remplissage_accroche", "remplissage_heure", "affichees_apres"):
        print(f"  {k:36} {st.get(k, 0)}")
    print(f"  {'lignes écrites (canonical_event_id)':36} {len(p['changes'])}")
    changed_ids = {i for i, _, _ in p["changes"]}
    changed = [(c, ev) for c, ev in p["groups"] if any(m["id"] in changed_ids for m in ev)]
    rnd = random.Random(23)
    sample = rnd.sample(changed, min(examples, len(changed)))
    print(f"\n[doublons] {len(sample)} exemples de groupes modifiés (C = fiche affichée après) :")
    for canon, everyone in sample:
        print(f"  @ {canon.get('venue_name')}")
        for m in sorted(everyone, key=lambda m: m is not canon):
            old = by_id[m["id"]].get("canonical_event_id")
            note = ""
            if old is None and m is not canon:
                note = "  ← était affichée"
            elif old is not None and m is canon:
                note = "  ← était cachée"
            print(f"    {'C' if m is canon else 'd'} {_fmt(m)}{note}")
    if not refusals:
        return
    shown = [r for r in rows if desired[r["id"]] is None and r.get("start_date")]
    near = []
    for x, y in candidate_pairs(shown):
        a, b = shown[x], shown[y]
        if a.get("source") == b.get("source") or a.get("canonical_venue") != b.get("canonical_venue"):
            continue
        if not dates_match(a, b):
            continue
        share = (set(a["_tok"]) & set(b["_tok"])) - GENERIC_TITLE_WORDS
        if _title_sim(a, b) < 0.35 and not share:
            continue
        reason = refusal_reason(a, b)
        if reason:
            near.append((reason, a, b))
    by_reason = defaultdict(list)
    for item in near:
        by_reason[item[0].split(" (")[0]].append(item)
    print(f"\n[doublons] {len(near)} paires proches (même lieu, dates communes, un mot en commun) laissées "
          f"séparées : { {k: len(v) for k, v in sorted(by_reason.items(), key=lambda kv: -len(kv[1]))} }")
    picked = []
    while len(picked) < refusals and any(by_reason.values()):
        for k in list(by_reason):
            if by_reason[k] and len(picked) < refusals:
                picked.append(by_reason[k].pop(rnd.randrange(len(by_reason[k]))))
    for reason, a, b in picked:
        print(f"  @ {a.get('venue_name')} — {reason}\n    {_fmt(a)}\n    {_fmt(b)}")


# ─────────────────────────── écriture ───────────────────────────

def _batches(items):
    for i in range(0, len(items), CHUNK):
        yield items[i:i + CHUNK]


def apply(conn, p: dict) -> str:
    from pipelines.ingest import _exec_many

    table = f"events_dedup_backup_{date.today():%Y%m%d}"
    ids = sorted({i for i, _, _ in p["changes"]} | {c for c, _ in p["fills"]})
    begin(conn)
    with conn.cursor() as cur:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS {table} (
            id uuid PRIMARY KEY, canonical_event_id uuid, price_min integer, price_max integer,
            price_status text, is_free boolean, image_url text, short_desc text, description text,
            start_date timestamptz, time_known boolean, saved_at timestamptz NOT NULL DEFAULT now())""")
        for chunk in _batches(ids):
            cur.execute(f"INSERT INTO {table} ({BACKUP_COLUMNS}) SELECT {BACKUP_COLUMNS} FROM events "
                        f"WHERE id = ANY(%s::uuid[]) ON CONFLICT (id) DO NOTHING", (chunk,))
    conn.commit()
    print(f"[doublons] sauvegarde : {table} ({len(ids)} lignes)")

    written = Counter()
    # 1. les nouvelles fiches affichées d'abord, puis les doublons, puis le remplissage
    first = [(i, old) for i, old, new in p["changes"] if new is None]
    then = [(i, old, new) for i, old, new in p["changes"] if new is not None]
    for chunk in _batches(first):
        begin(conn)
        with conn.cursor() as cur:
            cur.execute("""UPDATE events e SET canonical_event_id = NULL, updated_at = now()
                FROM unnest(%s::uuid[], %s::uuid[]) AS d(id, old)
                WHERE e.id = d.id AND e.canonical_event_id IS NOT DISTINCT FROM d.old""",
                        ([i for i, _ in chunk], [o for _, o in chunk]))
            written["affichees"] += cur.rowcount
        conn.commit()
    for chunk in _batches(then):
        begin(conn)
        with conn.cursor() as cur:
            cur.execute("""UPDATE events e SET canonical_event_id = d.new, updated_at = now()
                FROM unnest(%s::uuid[], %s::uuid[], %s::uuid[]) AS d(id, old, new)
                WHERE e.id = d.id AND e.canonical_event_id IS NOT DISTINCT FROM d.old AND d.new <> e.id""",
                        ([i for i, _, _ in chunk], [o for _, o, _ in chunk], [n for _, _, n in chunk]))
            written["rattachees"] += cur.rowcount
        conn.commit()
    for chunk in _batches(p["fills"]):
        begin(conn)
        with conn.cursor() as cur:
            _exec_many(cur, FILL_SQL, [{"canonical": c, "dup": d} for c, d in chunk])
        conn.commit()
        written["remplissages"] += len(chunk)
    print(f"[doublons] écrit : {dict(written)}")
    return table


def rollback(conn, table: str) -> int:
    if not re.fullmatch(r"events_dedup_backup_\d{8}", table):
        raise SystemExit(f"nom de table inattendu : {table}")
    cols = [c.strip() for c in BACKUP_COLUMNS.split(",") if c.strip() != "id"]
    sets = ", ".join(f"{c} = b.{c}" for c in cols)
    with conn.cursor() as cur:
        cur.execute(f"""UPDATE events e SET {sets}, updated_at = now() FROM {table} b
            WHERE e.id = b.id AND ({", ".join("e." + c for c in cols)})
                  IS DISTINCT FROM ({", ".join("b." + c for c in cols)})""")
        n = cur.rowcount
    conn.commit()
    print(f"[doublons] {n} lignes restaurées depuis {table}")
    return n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="(défaut) compte et montre, n'écrit rien")
    g.add_argument("--apply", action="store_true", help="sauvegarde puis écrit")
    g.add_argument("--rollback", metavar="TABLE", help="restaure depuis une table de sauvegarde")
    ap.add_argument("--garder-canoniques", action="store_true",
                    help="ne change pas la fiche affichée des groupes déjà formés (sauf un article)")
    ap.add_argument("--examples", type=int, default=40)
    ap.add_argument("--refus", type=int, default=10, help="cas proches non fusionnés à montrer")
    a = ap.parse_args(argv)
    if a.rollback:
        with connect(write=True) as conn:
            rollback(conn, a.rollback)
        return 0
    with connect(write=False) as conn:  # lecture, connexion fermée avant le calcul
        rows = fetch_dicts(conn, ROWS_SQL)
    p = plan(rows, keep_canonicals=a.garder_canoniques)
    print_report(p, rows, a.examples, a.refus)
    if a.apply and (p["changes"] or p["fills"]):
        with connect(write=True) as conn:
            apply(conn, p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
