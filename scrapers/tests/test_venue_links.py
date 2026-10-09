"""Venue linking (pipelines/venue_links.py) on real production names (9 Oct 2026)."""

import json
import os
from datetime import datetime, timezone

from pipelines.venue_links import link_venues, plan_links
from utils.matching import venue_key, venue_names_compatible

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "venues_link_sample.json")


def _rows():
    with open(FIXTURE) as f:
        return json.load(f)


def test_plan_links_real_sample():
    links = plan_links(_rows())
    expected = {
        "38riv": "38riv-club", "38riv-bar": "38riv-club",
        "athenee-caps": "athenee",
        "seine-musicale": "seine-musicale-la", "seine-musicale-boulogne": "seine-musicale-la",
        "marigny": "marigny-studio-caps", "studio-marigny": "marigny-studio-caps",
        "marigny-theatre": "marigny-studio-caps",
        "sunset-sunside-slash": "sunside", "sunset-sunside": "sunside", "sunside-caps": "sunside",
        "theatre-71-sn": "theatre-71", "theatre-71-malakoff": "malakoff-71",
    }
    for alias, canonical in expected.items():
        assert links.get(alias) == canonical, (alias, links.get(alias))
    # distinct places / halls are never merged
    for vid in ("sunset", "seine-musicale-auditorium", "seine-musicale-grande-seine",
                "seine-musicale-pianos", "place-chatelet", "chatelet", "metro-chatelet",
                "berges-chatelet", "cafe-oz", "golden-comedy", "chatelet-tmp", "moretti-marigny"):
        assert vid not in links, vid
    canonicals = set(links.values())
    assert not canonicals & set(links)  # a canonical is never itself an alias


def test_canonical_is_most_events_then_geocoded_then_oldest():
    old = datetime(2025, 1, 1, tzinfo=timezone.utc)
    new = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = [
        {"id": "a", "name": "Le Pan Piper", "zip_code": "75011", "lat": None, "lng": None, "n_events": 5, "created_at": old},
        {"id": "b", "name": "Pan Piper", "zip_code": "75011", "lat": 48.86, "lng": 2.38, "n_events": 5, "created_at": new},
        {"id": "c", "name": "PAN PIPER PARIS", "zip_code": None, "lat": None, "lng": None, "n_events": 5, "created_at": old},
    ]
    assert plan_links(rows) == {"a": "b", "c": "b"}
    rows[0]["n_events"] = 9
    assert plan_links(rows) == {"b": "a", "c": "a"}


def test_never_across_postcodes_nor_far_apart_nor_already_linked():
    rows = [
        {"id": "a", "name": "Le Comptoir", "zip_code": "75011", "lat": None, "lng": None, "n_events": 3},
        {"id": "b", "name": "Le Comptoir", "zip_code": "93100", "lat": None, "lng": None, "n_events": 1},
        {"id": "c", "name": "Le Comptoir", "zip_code": None, "lat": 48.90, "lng": 2.45, "n_events": 1},
        {"id": "d", "name": "Le Comptoir", "zip_code": None, "lat": 48.80, "lng": 2.25, "n_events": 1},
        {"id": "e", "name": "Comptoir", "zip_code": "75011", "lat": None, "lng": None, "n_events": 1,
         "canonical_venue_id": "x"},
    ]
    links = plan_links(rows)

    def group(v):
        return links.get(v, v)

    assert group("a") != group("b")  # 75011 vs 93100
    assert group("c") != group("d")  # 16 km apart
    assert "e" not in links  # already linked (by hand): left alone


def test_generic_names_need_the_same_spot():
    rows = [
        {"id": "a", "name": "Médiathèque", "zip_code": None, "lat": None, "lng": None, "n_events": 1},
        {"id": "b", "name": "Médiathèque", "zip_code": None, "lat": None, "lng": None, "n_events": 2},
        {"id": "c", "name": "Galerie", "zip_code": "75003", "lat": 48.86, "lng": 2.36, "n_events": 1},
        {"id": "d", "name": "Galerie Sato", "zip_code": "75003", "lat": 48.86, "lng": 2.36, "n_events": 1},
    ]
    assert plan_links(rows) == {}


def test_names_compatibility_helpers():
    assert venue_key("38 RIV - Jazz Club & Bar") == venue_key("38Riv") == "38riv"
    assert venue_key("THEATRE MARIGNY - STUDIO MARIGNY") == "marigny"
    assert venue_names_compatible("Théâtre 71", "Malakoff scène nationale – Théâtre 71")
    assert not venue_names_compatible("La Seine Musicale - Grande Seine", "La Seine Musicale - Auditorium")
    assert not venue_names_compatible("La Seine Musicale - Grande Seine", "La Seine Musicale")
    assert not venue_names_compatible("Place du Châtelet", "Théâtre du Châtelet")
    assert not venue_names_compatible("17 Rue des Gravilliers", "19 Rue des Gravilliers")
    assert not venue_names_compatible("Sunset", "Sunside")


class _Cur:
    def __init__(self, rows):
        self.rows, self.sql = rows, []
        self.description = [(c,) for c in ("id", "name", "zip_code", "lat", "lng", "canonical_venue_id",
                                           "created_at", "n_events")]

    def execute(self, sql, params=None):
        self.sql.append((sql, params))

    def fetchall(self):
        return [tuple(r.get(c[0]) for c in self.description) for r in self.rows]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _Conn:
    def __init__(self, rows):
        self.cur = _Cur(rows)
        self.commits = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.commits += 1


def test_link_venues_one_read_then_batched_writes():
    conn = _Conn(_rows())
    n = link_venues(conn)
    assert n == 13
    reads = [s for s, p in conn.cur.sql if p is None]
    writes = [p for s, p in conn.cur.sql if p is not None]
    assert len(reads) == 1 and len(writes) == n
    assert all("canonical_venue_id IS NULL" in s for s, p in conn.cur.sql if p is not None)
    assert conn.commits == 1
