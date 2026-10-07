"""
Que Faire à Paris spider — https://quefaire.paris.fr

DEPRECATED / DUPLICATE SOURCE — recommended to keep DISABLED.
- On 2026-10-07 quefaire.paris.fr serves a static "Maintenance" page (HTTP 404 on
  /fiches/all); the service moved to www.paris.fr/quefaire.
- Its content is the "Que faire à Paris" database, ingested in full by the
  paris_opendata spider via the official open-data API. Scraping it again would
  double-ingest the same events.

The module stays importable and fail-safe: it probes the site once, and only if it
serves schema.org Event JSON-LD again does it parse that (no guessing from CSS
classes, no default dates/prices). `parse_quefaire_dates` is kept for callers and
now uses the shared French date parser (fixes the "du 15 oct au 10 janv" month-order
/ year-rollover bug).
"""

from __future__ import annotations

from datetime import date
from typing import Generator, List, Optional, Tuple

from utils.dates import parse_date_fr
from utils.http import PoliteClient
from utils.jsonld import events_from_html

SOURCE = "quefaire_paris"
BASE_URL = "https://quefaire.paris.fr"
PROBE_URL = f"{BASE_URL}/"


def is_maintenance_page(html: Optional[str]) -> bool:
    if not html:
        return True
    head = html[:3000].lower()
    return "<title>maintenance</title>" in head or "maintenance" in head.split("</title>")[0]


def parse_page(html: str, url: str = PROBE_URL) -> List[dict]:
    """Events from schema.org JSON-LD only (00:00 = time unknown)."""
    if is_maintenance_page(html):
        return []
    return events_from_html(html, source=SOURCE, base_url=url, midnight_unknown=True)


def parse_quefaire_dates(text: Optional[str], today: Optional[date] = None) -> Tuple[Optional[str], Optional[str]]:
    """'Du 29 avril au 25 juin 2026' → (start ISO UTC, end ISO UTC); (None, None) if no date.

    Dates without a time are flagged by the shared parser (stored at 12:00 / 23:59 Paris).
    """
    fr = parse_date_fr(text, today=today)
    if fr is None:
        return (None, None)
    f = fr.to_fields()
    return (f["start_date"], f["end_date"])


def fetch_events(max_pages: int = 1) -> Generator[dict, None, None]:
    """One probe request; yields nothing while the site is in maintenance."""
    with PoliteClient(retries=1) as client:
        html = client.get_text(PROBE_URL)
    if html is None or is_maintenance_page(html):
        print("  [quefaire_paris] quefaire.paris.fr is offline (maintenance page) — "
              "source disabled; same data comes from paris_opendata")
        return
    events = parse_page(html, PROBE_URL)
    if not events:
        print("  [quefaire_paris] no schema.org events on quefaire.paris.fr — nothing fetched")
    for ev in events:
        yield ev
