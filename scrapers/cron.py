"""
Scraping orchestrator (GitHub Actions entry point).

Usage:
    python cron.py --group official            # one matrix group
    python cron.py --source paris_opendata     # one (or several, comma-separated) sources
    python cron.py --all                       # every enabled source
    python cron.py --post                      # geocode + promote + dedup + expiry + Meilisearch sync
    python cron.py --source dice --dry-run     # fetch + validate only, no database
    python cron.py --list

Exit code 1 when:
  - a key source (paris_opendata, openagenda) returns 0 events,
  - a source drops > 60 % vs its last successful run (when that run had ≥ 20 events),
  - a source crashes before producing anything,
  - a --post step fails.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from sources import GROUPS, SOURCES, select  # noqa: E402
from utils.http import BudgetExceeded, set_budget  # noqa: E402

DROP_THRESHOLD = 0.6
DROP_MIN_PREVIOUS = 20


def collect(spec) -> tuple:
    """Run a spider within its budget. Returns (events, crashed, error_messages)."""
    events, errors, crashed = [], [], False
    set_budget(spec.budget)
    try:
        for ev in spec.fetch() or []:
            events.append(ev)
    except BudgetExceeded:
        errors.append(f"time budget of {spec.budget}s exhausted after {len(events)} events")
        print(f"  [{spec.name}] budget exhausted — keeping {len(events)} events")
    except Exception as e:
        crashed = True
        errors.append(f"{type(e).__name__}: {e}")
        print(f"  [{spec.name}] CRASH: {e}")
        traceback.print_exc()
    finally:
        set_budget(None)
    return events, crashed, errors


def dry_run_report(name: str, events: list) -> None:
    from validation import decide_status, validate

    statuses, reasons = Counter(), Counter()
    for ev in events:
        _, hard, soft, score = validate(ev)
        statuses[decide_status(hard, score)] += 1
        reasons.update(hard + soft)
    print(f"  [{name}] {len(events)} events — status {dict(statuses)}")
    print(f"  [{name}] reasons {dict(reasons.most_common(12))}")
    for ev in events[:3]:
        print(f"    · {ev.get('start_date')} | {ev.get('title', '')[:70]} | {ev.get('venue_name')} "
              f"| {ev.get('price_status')} {ev.get('price_min')}-{ev.get('price_max')}")


def run_sources(specs, dry_run: bool = False) -> list:
    """Run sources sequentially. Returns list of health problems (strings)."""
    problems = []
    conn = None
    if not dry_run:
        from pipelines.ingest import get_db_connection

        conn = get_db_connection()

    for spec in specs:
        missing = [v for v in spec.env if not os.getenv(v)]
        if missing:
            print(f"\n[{spec.name}] skipped: missing env {', '.join(missing)}")
            continue
        print(f"\n{'#' * 60}\n# {spec.name} (group {spec.group}, budget {spec.budget}s)\n{'#' * 60}")
        t0 = time.monotonic()
        started_at = datetime.now(timezone.utc)  # real start time, written in ingestion_logs
        events, crashed, errors = collect(spec)
        print(f"  [{spec.name}] fetched {len(events)} events in {time.monotonic() - t0:.0f}s")

        # One spider may emit several DB sources (venue_<key>): group by event source.
        by_source = defaultdict(list)
        for ev in events:
            by_source[ev.get("source") or spec.name].append(ev)
        if not by_source:
            by_source[spec.name] = []

        if dry_run:
            for name, evs in by_source.items():
                dry_run_report(name, evs)
            if spec.key and not events:
                problems.append(f"{spec.name}: key source returned 0 events")
            if crashed and not events:
                problems.append(f"{spec.name}: crashed ({errors[-1] if errors else '?'})")
            continue

        from pipelines.ingest import last_successful_found, log_finish, log_start, run_pipeline

        for name, evs in by_source.items():
            log_id = log_start(conn, name, started_at)
            previous = last_successful_found(conn, name)
            stats = {"found": len(evs), "new": 0, "updated": 0, "duplicate": 0, "errors": 0, "error_list": []}
            try:
                if evs:
                    stats = run_pipeline(evs, name, conn=conn)
            except Exception as e:
                crashed = True
                errors.append(f"ingest {type(e).__name__}: {e}")
                traceback.print_exc()
                try:
                    conn.rollback()
                except Exception:
                    pass
            finally:
                status = log_finish(conn, log_id, name, stats, crashed, errors + stats.get("error_list", []))
            print(f"  [{name}] log status: {status}")
            found = stats.get("found", 0)
            if spec.key and found == 0:
                problems.append(f"{name}: key source returned 0 events")
            if previous and previous >= DROP_MIN_PREVIOUS and found < (1 - DROP_THRESHOLD) * previous:
                problems.append(f"{name}: dropped from {previous} to {found} events (> {DROP_THRESHOLD:.0%})")
            if crashed and found == 0:
                problems.append(f"{name}: crashed ({errors[-1] if errors else '?'})")

    if conn is not None:
        conn.close()
    return problems


def run_post() -> list:
    """Geocode → promote → dedup → expire → Meilisearch. Each step isolated; failures reported."""
    from pipelines.dedup import run_dedup
    from pipelines.ingest import get_db_connection
    from pipelines.maintenance import expire_events, promote_geocoded
    from pipelines.meili import sync
    from utils.geocode import geocode_missing_venues

    problems = []
    conn = get_db_connection()
    steps = [
        ("geocode", lambda: geocode_missing_venues(conn)),
        ("promote", lambda: promote_geocoded(conn)),
        ("dedup", lambda: run_dedup(conn)),
        ("expire", lambda: expire_events(conn)),
    ]
    for name, step in steps:
        set_budget(15 * 60)
        try:
            step()
        except Exception as e:
            problems.append(f"post/{name}: {type(e).__name__}: {e}")
            traceback.print_exc()
            try:
                conn.rollback()
            except Exception:
                pass
        finally:
            set_budget(None)
    try:
        sync(conn)
    except Exception as e:
        problems.append(f"post/meili: {type(e).__name__}: {e}")
        traceback.print_exc()
    conn.close()
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Paname Club — scraping cron")
    parser.add_argument("--source", help="source name(s), comma-separated")
    parser.add_argument("--group", choices=GROUPS)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--post", action="store_true", help="geocode + dedup + expiry + Meilisearch sync")
    parser.add_argument("--dry-run", action="store_true", help="fetch + validate only (no DB)")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    if args.list:
        for s in SOURCES:
            flag = "" if s.enabled else "  [disabled]"
            print(f"{s.name:18} {s.group:10} key={s.key!s:5} env={','.join(s.env) or '-'}{flag}  {s.notes}")
        return 0

    start = datetime.now(timezone.utc)
    print(f"{'=' * 60}\n  Paname Club cron — started {start.isoformat()}\n{'=' * 60}")
    problems = []
    if args.source or args.group or args.all:
        names = [n.strip() for n in args.source.split(",")] if args.source else None
        specs = select(names, None if args.all else args.group)
        problems += run_sources(specs, dry_run=args.dry_run)
    if args.post and not args.dry_run:
        problems += run_post()

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\n{'=' * 60}\n  Done in {elapsed:.0f}s")
    if problems:
        print("  HEALTH PROBLEMS:")
        for p in problems:
            print(f"   - {p}")
        if os.getenv("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
                f.write("### Scraper health problems\n" + "\n".join(f"- {p}" for p in problems) + "\n")
        return 1
    print("  All healthy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
