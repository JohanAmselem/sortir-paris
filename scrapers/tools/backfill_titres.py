"""
Rattrapage des titres existants avec la règle de la collecte (utils/titles.clean_display_title) :
préfixe « Prestation » de Ticketmaster, titres d'article sortiraparis
(« X en concert à … » → « X »), suffixe de salle redondant (« Peet - l'Olympia » → « Peet »).

La règle dépend du nom du lieu de chaque ligne (mots distinctifs) : elle est appliquée en
Python, pas en SQL, pour être exactement celle de la collecte.

Usage (depuis scrapers/) :
  python -m tools.backfill_titres                 # --dry-run (défaut) : lecture seule
  python -m tools.backfill_titres --apply         # sauvegarde puis écrit
  python -m tools.backfill_titres --rollback events_titles_backup_20261123

--apply crée d'abord events_titles_backup_<date>(id, title) avec le titre d'origine de
chaque ligne modifiée, puis met à jour par lots de 500 (une ligne n'est réécrite que si
son titre n'a pas changé entre-temps). --rollback remet les titres sauvegardés.
Seules les sorties vivantes (active / draft, pas terminées) sont concernées.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.titles import (  # noqa: E402
    clean_display_title,
    sortiraparis_title,
    strip_prestation_prefix,
)
from tools.backfill_db import begin, connect, fetch_dicts  # noqa: E402

CHUNK = 500

ROWS_SQL = """
SELECT e.id::text AS id, e.source, e.title, v.name AS venue_name, c.name AS canonical_venue_name
FROM events e
LEFT JOIN venues v ON v.id = e.venue_id
LEFT JOIN venues c ON c.id = v.canonical_venue_id
WHERE e.status IN ('active', 'draft')
  AND coalesce(e.end_date, e.start_date) >= now() - interval '6 hours'
"""


def rule_of(row: dict, new: str) -> str:
    """Règle qui a changé le titre (pour le décompte)."""
    t = row["title"]
    if row["source"] == "ticketmaster" and strip_prestation_prefix(t) != t:
        return "prestation"
    if row["source"] == "sortiraparis" and sortiraparis_title(t) != t:
        return "article_sortiraparis"
    return "suffixe_de_salle"


def plan(rows) -> list:
    """Pure : [(row, nouveau titre)] pour les lignes dont le titre change."""
    out = []
    for r in rows:
        new = clean_display_title(r["title"], source=r["source"],
                                  venue_names=[r.get("venue_name"), r.get("canonical_venue_name")])
        if new and new != r["title"]:
            out.append((r, new))
    return out


def dry_run(conn, examples: int = 30) -> list:
    rows = fetch_dicts(conn, ROWS_SQL)
    changes = plan(rows)
    by_rule = Counter(rule_of(r, n) for r, n in changes)
    by_source = Counter(r["source"] if not r["source"].startswith("venue_") else "venue_*" for r, _ in changes)
    print(f"[titres] {len(rows)} sorties vivantes lues, {len(changes)} titres à nettoyer")
    print(f"[titres] par règle : {dict(by_rule.most_common())}")
    print(f"[titres] par source : {dict(by_source.most_common())}")
    # exemples variés : un peu de chaque règle
    shown, per_rule = [], Counter()
    quota = max(1, examples // max(1, len(by_rule)))
    for r, n in sorted(changes, key=lambda x: x[0]["id"]):
        k = rule_of(r, n)
        if per_rule[k] < quota:
            per_rule[k] += 1
            shown.append((k, r, n))
    for r, n in sorted(changes, key=lambda x: x[0]["id"]):
        if len(shown) >= examples:
            break
        if all(r is not s[1] for s in shown):
            shown.append((rule_of(r, n), r, n))
    for k, r, n in shown[:examples]:
        print(f"  [{k}] [{r['source']}] « {r['title']} » → « {n} »  (lieu : {r.get('venue_name')})")
    return changes


def apply(conn, changes: list) -> str:
    table = f"events_titles_backup_{date.today():%Y%m%d}"
    with conn.cursor() as cur:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS {table} (
            id uuid PRIMARY KEY, title text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now())""")
        for i in range(0, len(changes), CHUNK):
            chunk = changes[i:i + CHUNK]
            cur.execute(f"""INSERT INTO {table} (id, title)
                SELECT * FROM unnest(%s::uuid[], %s::text[]) ON CONFLICT (id) DO NOTHING""",
                        ([r["id"] for r, _ in chunk], [r["title"] for r, _ in chunk]))
    conn.commit()
    print(f"[titres] sauvegarde : {table} ({len(changes)} lignes)")
    written = 0
    for i in range(0, len(changes), CHUNK):
        chunk = changes[i:i + CHUNK]
        begin(conn)
        with conn.cursor() as cur:
            cur.execute("""UPDATE events e SET title = d.new, updated_at = now()
                FROM unnest(%s::uuid[], %s::text[], %s::text[]) AS d(id, old, new)
                WHERE e.id = d.id AND e.title = d.old""",
                        ([r["id"] for r, _ in chunk], [r["title"] for r, _ in chunk], [n for _, n in chunk]))
            written += cur.rowcount
        conn.commit()
    print(f"[titres] {written} titres réécrits")
    return table


def rollback(conn, table: str) -> int:
    if not re.fullmatch(r"events_titles_backup_\d{8}", table):
        raise SystemExit(f"nom de table inattendu : {table}")
    with conn.cursor() as cur:
        cur.execute(f"UPDATE events e SET title = b.title, updated_at = now() FROM {table} b "
                    f"WHERE e.id = b.id AND e.title IS DISTINCT FROM b.title")
        n = cur.rowcount
    conn.commit()
    print(f"[titres] {n} titres restaurés depuis {table}")
    return n


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="(défaut) compte et montre, n'écrit rien")
    g.add_argument("--apply", action="store_true", help="sauvegarde puis écrit")
    g.add_argument("--rollback", metavar="TABLE", help="restaure les titres d'une table de sauvegarde")
    p.add_argument("--examples", type=int, default=30)
    a = p.parse_args(argv)
    if a.rollback:
        with connect(write=True) as conn:
            rollback(conn, a.rollback)
        return 0
    if a.apply:
        with connect(write=True) as conn:
            changes = dry_run(conn, a.examples)
            if changes:
                apply(conn, changes)
        return 0
    with connect(write=False) as conn:
        dry_run(conn, a.examples)
    return 0


if __name__ == "__main__":
    sys.exit(main())
