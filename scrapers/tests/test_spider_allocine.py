from __future__ import annotations

import copy
import json

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.allocine import PARIS_CINEMAS, parse_showtimes, parse_theater_listing, total_pages

DAY = "2026-10-07"


def _data():
    return json.loads(load_fixture("allocine_theater_C0159_2026-10-07.json"))


def test_parse_showtimes_real_times_only():
    events = parse_showtimes(_data(), "C0159", DAY)
    assert len(events) == 5
    for ev in events:
        assert_valid_event(ev)
        assert ev["source"] == "allocine"
        assert ev["time_known"] is True
        assert ev["category_slug"] == "cinema"
        assert ev["venue_name"] == "UGC Ciné Cité Les Halles"
        assert ev["venue_zip"] == "75001"
        assert ev["price_status"] == "unknown"
        assert ev["description"].startswith("Séances : ")

    bj = next(e for e in events if e["title"] == "Butterfly Jam")
    assert bj["source_id"] == "C0159-313150-2026-10-07"
    # first real showtime 08:55 Paris (CEST, UTC+2) → 06:55 UTC
    assert bj["start_date"] == "2026-10-07T06:55:00+00:00"
    assert "08h55 (VOST)" in bj["description"] and "22h10 (VOST)" in bj["description"]
    assert bj["source_url"] == "https://www.allocine.fr/film/fichefilm_gen_cfilm=313150.html"
    assert bj["booking_url"] == "https://www.allocine.fr/seance/salle_gen_csalle=C0159.html"
    assert bj["image_url"].startswith("https://")

    dora = next(e for e in events if e["title"].startswith("Doraemon"))
    assert "09h00 (VOST)" in dora["description"] and "11h25 (VF)" in dora["description"]


def test_no_showtime_no_event():
    data = _data()
    for r in data["results"]:
        r["showtimes"] = {k: [] for k in r["showtimes"]}
    assert parse_showtimes(data, "C0159", DAY) == []
    # no 20:00 fallback anywhere
    assert parse_showtimes({"results": [], "error": False}, "C0159", DAY) == []


def test_unknown_cinema_code_skipped():
    assert parse_showtimes(_data(), "C9999", DAY) == []


def test_enrich_only_when_missing():
    data = _data()
    data["results"] = copy.deepcopy(data["results"][:1])
    data["results"][0]["movie"]["poster"] = None
    data["results"][0]["movie"]["synopsis"] = None
    calls = []

    def fake_enrich(title, year):
        calls.append((title, year))
        return {"poster_url": "https://image.tmdb.org/t/p/w500/x.jpg", "overview": "Synopsis TMDB.", "genres": []}

    ev = parse_showtimes(data, "C0159", DAY, enrich=fake_enrich)[0]
    assert calls == [("Butterfly Jam", 2026)]
    assert ev["image_url"] == "https://image.tmdb.org/t/p/w500/x.jpg"
    assert "Synopsis TMDB." in ev["description"]

    calls.clear()
    parse_showtimes(_data(), "C0159", DAY, enrich=fake_enrich)
    assert calls == []  # Allociné already has poster + synopsis


def test_total_pages():
    assert total_pages(_data()) == 3
    assert total_pages(None) == 1


def test_theater_listing_matches_table():
    rows = parse_theater_listing(load_fixture("allocine_paris_theaters.html"))
    assert rows[0][:2] == ("C0159", "UGC Ciné Cité Les Halles")
    assert rows[0][3] == "75001"
    for code, name, addr, zip_ in rows:
        assert code in PARIS_CINEMAS, code
        assert PARIS_CINEMAS[code][2] == zip_


def test_table_has_unique_paris_codes():
    assert len(PARIS_CINEMAS) == len(set(PARIS_CINEMAS))
    for code, (name, addr, zip_) in PARIS_CINEMAS.items():
        assert zip_.startswith("75"), code
    assert "Le Desperado" not in [v[0] for v in PARIS_CINEMAS.values()]
