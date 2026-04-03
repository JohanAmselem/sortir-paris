"""
Main entry point for running scrapers.
23 sources total.

Usage:
    python run.py --source openagenda
    python run.py --source allocine        # Cinema showtimes (thousands)
    python run.py --source bandsintown     # Concerts
    python run.py --source parismusees     # Museum exhibitions
    python run.py --source fnacspectacles  # Theatre, comedy, dance
    python run.py --source mapado          # Large aggregator
    python run.py --source tmdb            # Films currently showing
    python run.py --source meetup          # Community events
    python run.py --all
"""

import argparse
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv()

from spiders.openagenda import fetch_events as fetch_openagenda
from spiders.paris_opendata import fetch_events as fetch_paris_opendata
from spiders.parisjazzclub import fetch_events as fetch_parisjazzclub
from spiders.newmorning import fetch_events as fetch_newmorning
from spiders.theatreonline import fetch_events as fetch_theatreonline
from spiders.billetreduc import fetch_events as fetch_billetreduc
from spiders.shotgun import fetch_events as fetch_shotgun
from spiders.dice import fetch_events as fetch_dice
from spiders.timeout_paris import fetch_events as fetch_timeout
from spiders.sortir_a_paris import fetch_events as fetch_sortiraparis
from spiders.paris_fr import fetch_events as fetch_paris_fr
from spiders.infoconcert import fetch_events as fetch_infoconcert
from spiders.offi import fetch_events as fetch_offi
from spiders.eventbrite_paris import fetch_events as fetch_eventbrite
from spiders.quefaire_paris import fetch_events as fetch_quefaire
from spiders.lebonbon import fetch_events as fetch_lebonbon
from spiders.allocine import fetch_events as fetch_allocine
from spiders.bandsintown import fetch_events as fetch_bandsintown
from spiders.parismusees import fetch_events as fetch_parismusees
from spiders.fnacspectacles import fetch_events as fetch_fnacspectacles
from spiders.mapado import fetch_events as fetch_mapado
from spiders.tmdb_cinema import fetch_events as fetch_tmdb
from spiders.meetup_paris import fetch_events as fetch_meetup
from pipelines.ingest import run_pipeline


def run_openagenda():
    api_key = os.getenv("OPENAGENDA_API_KEY", "")
    if not api_key:
        print("Warning: OPENAGENDA_API_KEY not set, skipping OpenAgenda")
        return
    from spiders.openagenda import AGENDA_IDS
    all_events = []
    for agenda_id in AGENDA_IDS:
        print(f"Fetching from OpenAgenda: {agenda_id}")
        events = list(fetch_openagenda(api_key, agenda_id))
        all_events.extend(events)
        print(f"  Found {len(events)} events")
    if all_events:
        run_pipeline(all_events, "openagenda")


def run_paris_opendata():
    print("Fetching from Paris Open Data...")
    events = list(fetch_paris_opendata())
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "paris_opendata")


def run_parisjazzclub():
    print("Fetching from Paris Jazz Club...")
    events = list(fetch_parisjazzclub(max_pages=15, days_ahead=60))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "parisjazzclub")


def run_newmorning():
    print("Fetching from New Morning...")
    events = list(fetch_newmorning(max_pages=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "newmorning")


def run_theatreonline():
    print("Fetching from TheatreOnline...")
    events = list(fetch_theatreonline(max_pages=10))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "theatreonline")


def run_billetreduc():
    print("Fetching from BilletReduc...")
    events = list(fetch_billetreduc(max_pages_per_cat=3))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "billetreduc")


def run_shotgun():
    print("Fetching from Shotgun...")
    events = list(fetch_shotgun(days_ahead=60, max_pages=10))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "shotgun")


def run_dice():
    print("Fetching from DICE...")
    events = list(fetch_dice(days_ahead=60, max_pages=10))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "dice")


def run_timeout():
    print("Fetching from Timeout Paris...")
    events = list(fetch_timeout(max_pages=3))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "timeout")


def run_sortiraparis():
    print("Fetching from SortirAParis...")
    events = list(fetch_sortiraparis(max_pages=3))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "sortiraparis")


def run_paris_fr():
    print("Fetching from Paris.fr...")
    events = list(fetch_paris_fr(max_pages=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "paris_fr")


def run_infoconcert():
    print("Fetching from InfoConcert...")
    events = list(fetch_infoconcert(max_pages=15, days_ahead=90))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "infoconcert")


def run_offi():
    print("Fetching from L'Officiel des Spectacles...")
    events = list(fetch_offi(max_pages=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "offi")


def run_eventbrite():
    print("Fetching from Eventbrite Paris...")
    events = list(fetch_eventbrite(max_pages=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "eventbrite")


def run_quefaire():
    print("Fetching from Que Faire à Paris...")
    events = list(fetch_quefaire(max_pages=10))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "quefaire_paris")


def run_lebonbon():
    print("Fetching from Le Bonbon Paris...")
    events = list(fetch_lebonbon(max_pages=10))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "lebonbon")


def run_allocine():
    print("Fetching from Allociné (cinéma)...")
    events = list(fetch_allocine(max_cinemas=60, days_ahead=7))
    print(f"  Found {len(events)} showtimes")
    if events:
        run_pipeline(events, "allocine")


def run_bandsintown():
    print("Fetching from Bandsintown (concerts)...")
    events = list(fetch_bandsintown(max_pages=20, days_ahead=90))
    print(f"  Found {len(events)} concerts")
    if events:
        run_pipeline(events, "bandsintown")


def run_parismusees():
    print("Fetching from Paris Musées + musées nationaux (expos)...")
    events = list(fetch_parismusees(max_pages=10))
    print(f"  Found {len(events)} exhibitions")
    if events:
        run_pipeline(events, "parismusees")


def run_fnacspectacles():
    print("Fetching from FNAC Spectacles...")
    events = list(fetch_fnacspectacles(max_pages_per_cat=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "fnacspectacles")


def run_mapado():
    print("Fetching from Mapado...")
    events = list(fetch_mapado(max_pages_per_cat=5))
    print(f"  Found {len(events)} events")
    if events:
        run_pipeline(events, "mapado")


def run_tmdb():
    print("Fetching from TMDB (films à l'affiche)...")
    events = list(fetch_tmdb(days_ahead=7, max_pages=5))
    print(f"  Found {len(events)} screenings")
    if events:
        run_pipeline(events, "tmdb")


def run_meetup():
    print("Fetching from Meetup Paris...")
    events = list(fetch_meetup(max_pages=5))
    print(f"  Found {len(events)} meetups")
    if events:
        run_pipeline(events, "meetup")


SOURCES = {
    "openagenda": run_openagenda,
    "paris_opendata": run_paris_opendata,
    "parisjazzclub": run_parisjazzclub,
    "newmorning": run_newmorning,
    "theatreonline": run_theatreonline,
    "billetreduc": run_billetreduc,
    "shotgun": run_shotgun,
    "dice": run_dice,
    "timeout": run_timeout,
    "sortiraparis": run_sortiraparis,
    "paris_fr": run_paris_fr,
    "infoconcert": run_infoconcert,
    "offi": run_offi,
    "eventbrite": run_eventbrite,
    "quefaire_paris": run_quefaire,
    "lebonbon": run_lebonbon,
    "allocine": run_allocine,
    "bandsintown": run_bandsintown,
    "parismusees": run_parismusees,
    "fnacspectacles": run_fnacspectacles,
    "mapado": run_mapado,
    "tmdb": run_tmdb,
    "meetup": run_meetup,
}


def main():
    parser = argparse.ArgumentParser(description="Paname Club — Event Scraper")
    parser.add_argument("--source", choices=SOURCES.keys(), help="Source to scrape")
    parser.add_argument("--all", action="store_true", help="Run all sources")
    args = parser.parse_args()

    if args.all:
        for name, runner in SOURCES.items():
            print(f"\n{'#'*50}")
            print(f"# Running: {name}")
            print(f"{'#'*50}")
            try:
                runner()
            except Exception as e:
                print(f"Error running {name}: {e}")
    elif args.source:
        SOURCES[args.source]()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
