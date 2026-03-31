"""
Main entry point for running scrapers.
Usage:
    python run.py --source openagenda
    python run.py --source paris_opendata
    python run.py --source parisjazzclub
    python run.py --source newmorning
    python run.py --source theatreonline
    python run.py --source billetreduc
    python run.py --source shotgun
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


SOURCES = {
    "openagenda": run_openagenda,
    "paris_opendata": run_paris_opendata,
    "parisjazzclub": run_parisjazzclub,
    "newmorning": run_newmorning,
    "theatreonline": run_theatreonline,
    "billetreduc": run_billetreduc,
    "shotgun": run_shotgun,
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
