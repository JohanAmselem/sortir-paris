"""
Manual entry point (kept for compatibility). The source list lives in sources.py and the
orchestration (time budgets, logs, health checks) in cron.py.

Usage:
    python run.py --source openagenda
    python run.py --source dice --dry-run
    python run.py --all
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from cron import run_sources  # noqa: E402
from sources import BY_NAME, select  # noqa: E402

# name → zero-arg runner (backward compatible with the old SOURCES dict)
SOURCES = {name: (lambda n=name: run_sources(select([n]))) for name in BY_NAME}


def main() -> int:
    parser = argparse.ArgumentParser(description="Paname Club — Event Scraper")
    parser.add_argument("--source", choices=sorted(BY_NAME), help="Source to scrape")
    parser.add_argument("--all", action="store_true", help="Run all enabled sources")
    parser.add_argument("--dry-run", action="store_true", help="fetch + validate only (no DB)")
    args = parser.parse_args()

    if args.all:
        problems = run_sources(select(None), dry_run=args.dry_run)
    elif args.source:
        problems = run_sources(select([args.source]), dry_run=args.dry_run)
    else:
        parser.print_help()
        return 0
    for p in problems:
        print(f"PROBLEM: {p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
