"""
Source registry: one line per source. Used by cron.py (and run.py for compatibility).

group   → GitHub Actions matrix job that runs it (official / ticketing / media / venues / cinema)
key     → a key source: 0 events fails the run
budget  → wall-clock budget in seconds (the spider stops cleanly when exhausted)
env     → required environment variables (source skipped with a log line when missing)
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional


@dataclass
class SourceSpec:
    name: str
    group: str
    module: str
    func: str = "fetch_events"
    kwargs: dict = field(default_factory=dict)
    key: bool = False
    budget: int = 15 * 60
    env: List[str] = field(default_factory=list)
    enabled: bool = True
    notes: str = ""

    def fetch(self) -> Iterable[dict]:
        mod = importlib.import_module(self.module)
        return getattr(mod, self.func)(**self.kwargs)


SOURCES: List[SourceSpec] = [
    # ── official / open data ──
    SourceSpec("paris_opendata", "official", "spiders.paris_opendata", key=True, budget=20 * 60),
    SourceSpec("openagenda", "official", "spiders.openagenda", func="fetch_all", key=True,
               budget=25 * 60, env=["OPENAGENDA_API_KEY"]),
    SourceSpec("datatourisme", "official", "spiders.datatourisme", budget=10 * 60,
               env=["DATATOURISME_API_KEY"],
               notes="DATAtourisme (Licence Ouverte) API v1 — see docs/DATATOURISME.md"),
    SourceSpec("parismusees", "official", "spiders.parismusees"),
    SourceSpec("paris_fr", "official", "spiders.paris_fr", enabled=False,
               notes="same records as paris_opendata (paris.fr/quefaire front-end) — duplicate"),
    SourceSpec("quefaire_paris", "official", "spiders.quefaire_paris", enabled=False,
               notes="site in maintenance; same data as paris_opendata"),
    # ── ticketing / aggregators ──
    SourceSpec("ticketmaster", "ticketing", "spiders.ticketmaster", env=["TICKETMASTER_API_KEY"]),
    SourceSpec("fnacspectacles", "ticketing", "spiders.fnacspectacles", enabled=False,
               notes="blocked: all requests (incl. robots.txt) time out for the bot UA"),
    SourceSpec("billetreduc", "theatre", "spiders.billetreduc", budget=25 * 60,
               notes="Paris + 92/93/94 listings; detail pages for real date/time/price"),
    SourceSpec("mapado", "ticketing", "spiders.mapado", enabled=False,
               notes="no public feed: /paris 404, mapado.com is now B2B ticketing"),
    SourceSpec("eventbrite", "ticketing", "spiders.eventbrite_paris", enabled=False,
               notes="blocked from datacenter IPs (HTTP 405 on GitHub runners); works from a residential IP"),
    SourceSpec("meetup", "ticketing", "spiders.meetup_paris"),
    SourceSpec("dice", "ticketing", "spiders.dice"),
    SourceSpec("shotgun", "ticketing", "spiders.shotgun", enabled=False,
               notes="blocked: Vercel security checkpoint (HTTP 429 JS challenge)"),
    SourceSpec("bandsintown", "ticketing", "spiders.bandsintown", enabled=False,
               notes="blocked: site 403 Cloudflare; official API artist-based (needs BANDSINTOWN_APP_ID + BANDSINTOWN_ARTISTS)"),
    # ── media / listings ──
    SourceSpec("sortiraparis", "media", "spiders.sortir_a_paris"),
    SourceSpec("timeout", "media", "spiders.timeout_paris", budget=5 * 60),
    SourceSpec("offi", "media", "spiders.offi"),
    SourceSpec("infoconcert", "media", "spiders.infoconcert", enabled=False,
               notes="blocked: Cloudflare 403 challenge to bot UA (parser ready)"),
    SourceSpec("theatreonline", "media", "spiders.theatreonline"),
    SourceSpec("lebonbon", "media", "spiders.lebonbon", enabled=False,
               notes="editorial articles only, no event structure (yields nothing)"),
    # ── venues (official venue websites, structured data) ──
    SourceSpec("venues", "venues", "spiders.venues_structured", budget=30 * 60,
               notes="one DB source per venue: venue_<key>"),
    SourceSpec("newmorning", "venues", "spiders.newmorning", kwargs={"max_details": 80}),
    SourceSpec("parisjazzclub", "venues", "spiders.parisjazzclub",
               kwargs={"max_pages": 45, "days_ahead": 7}),
    # ── culture (programme parsers of single institutions) ──
    SourceSpec("cinematheque", "culture", "spiders.cinematheque", budget=10 * 60,
               kwargs={"months": 3, "days_ahead": 60, "max_details": 450}),
    SourceSpec("forumdesimages", "culture", "spiders.forumdesimages", budget=5 * 60),
    SourceSpec("residentadvisor", "media", "spiders.residentadvisor", enabled=False,
               notes="not implemented: event pages behind a DataDome captcha (not bypassed)"),
    # ── cinema ──
    SourceSpec("allocine", "cinema", "spiders.allocine", budget=35 * 60,
               kwargs={"max_cinemas": 82, "days_ahead": 7},
               notes="7 days; Allociné publishes Wed→Tue programmes on Mon/Tue, later days skipped"),
    SourceSpec("tmdb", "cinema", "spiders.tmdb_cinema", enabled=False,
               notes="enrichment only (posters/synopsis for allocine) — never an event source"),
]

BY_NAME: Dict[str, SourceSpec] = {s.name: s for s in SOURCES}
GROUPS = sorted({s.group for s in SOURCES})


def select(names: Optional[List[str]] = None, group: Optional[str] = None) -> List[SourceSpec]:
    if names:
        unknown = [n for n in names if n not in BY_NAME]
        if unknown:
            raise SystemExit(f"Unknown source(s): {', '.join(unknown)}. Known: {', '.join(BY_NAME)}")
        return [BY_NAME[n] for n in names]
    return [s for s in SOURCES if s.enabled and (group is None or s.group == group)]
