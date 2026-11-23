"""
Connexion à la base pour les scripts de rattrapage (tools/backfill_*.py).

- Une seule connexion, fermée par le gestionnaire de contexte.
- Lecture (--dry-run, par défaut) : transaction READ ONLY vérifiée (SHOW
  transaction_read_only), statement_timeout local de 20 s. Rien ne peut être écrit.
- Écriture (--apply / --rollback) : transaction normale, statement_timeout local de
  20 s par transaction ; les scripts écrivent par lots et valident chaque lot.

DATABASE_URL vient de l'environnement (ou d'un .env chargé par python-dotenv). Utiliser
de préférence le pooler « transaction » de Supabase (port 6543) : le pool « session »
(5432) est partagé avec la prod et sature vite. Seuls des SET LOCAL sont émis, donc
rien ne fuit d'une transaction à l'autre dans le pooler.
"""

from __future__ import annotations

import os
from contextlib import contextmanager

STATEMENT_TIMEOUT = "20s"


def _url() -> str:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise SystemExit("DATABASE_URL n'est pas défini")
    return url


def begin(conn) -> None:
    """Première instruction de chaque transaction : délai maximal par requête."""
    with conn.cursor() as cur:
        cur.execute(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'")


@contextmanager
def connect(write: bool = False):
    """Connexion unique. write=False → transaction READ ONLY (vérifiée)."""
    import psycopg2

    conn = psycopg2.connect(_url(), connect_timeout=15, application_name="panameclub-backfill")
    try:
        # psycopg2 ≥ 2.7 émet « BEGIN READ ONLY » : rien n'est changé au niveau de la
        # session (compatible avec le pooler transaction).
        conn.set_session(readonly=not write, autocommit=False)
        begin(conn)
        if not write:
            with conn.cursor() as cur:
                cur.execute("SHOW transaction_read_only")
                if cur.fetchone()[0] != "on":
                    raise SystemExit("la transaction n'est pas en lecture seule : arrêt")
        yield conn
        if not write:
            conn.rollback()
    finally:
        conn.close()


def fetch_dicts(conn, sql: str, params=None) -> list:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
