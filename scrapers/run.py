"""
Main entry point for running scrapers.
Usage:
    python run.py --source openagenda
    python run.py --source paris_opendata
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


SOURCES = {
    "openagenda": run_openagenda,
    "paris_opendata": run_paris_opendata,
}


def main():
    parser = argparse.ArgumentParser(description="Sortir Paris — Event Scraper")
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
