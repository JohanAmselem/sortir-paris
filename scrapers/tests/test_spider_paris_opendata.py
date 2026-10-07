import json
from datetime import datetime, timezone

import pytest

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

import spiders.paris_opendata as po
from spiders.paris_opendata import map_category, parse_api, parse_occurrences, price_from_record

NOW = datetime(2026, 10, 7, 10, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def data():
    return json.loads(load_fixture("paris_opendata_records.json"))


@pytest.fixture(scope="module")
def events(data):
    return {ev["source_id"]: ev for ev in parse_api(data, now=NOW)}


def test_all_valid(data, events):
    assert len(events) == len(data["results"])
    for ev in events.values():
        assert_valid_event(ev)
        assert ev["source"] == "paris_opendata"


def test_date_only_range_not_stored_at_midnight_utc(events):
    ev = events["51551"]  # Musée Banksy: 2019-06-01 → 2026-12-31, no time
    assert ev["start_date"] == "2019-06-01T10:00:00+00:00"  # 12:00 Paris, flagged unknown
    assert ev["end_date"] == "2026-12-31T22:59:00+00:00"
    assert ev["time_known"] is False
    assert ev["price_status"] == "unknown"  # "payant" without any amount
    assert ev["category_slug"] == "expos"
    assert ev["venue_zip"] == "75009" and ev["venue_arrondissement"] == "9e"
    assert abs(ev["venue_lat"] - 48.87465) < 1e-4


def test_occurrence_wallclock_and_run_end(events):
    ev = events["32678"]  # two shows 21 & 26 Nov 2026, 20h00–21h30 Paris
    assert ev["start_date"] == "2026-11-21T19:00:00+00:00"
    assert ev["end_date"] == "2026-11-26T20:30:00+00:00"
    assert ev["time_known"] is True
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1500, 3800, "paid")
    assert ev["category_slug"] == "theatre"


def test_scattered_dates_end_with_occurrence(events):
    ev = events["67052"]  # 7 Jan 2027 and 28 Apr 2027 → next show only
    assert ev["start_date"] == "2027-01-07T20:00:00+00:00"
    assert ev["end_date"] == "2027-01-07T21:15:00+00:00"


def test_placeholder_noon_occurrence_is_time_unknown(events):
    ev = events["85783"]  # daily "de 12h00 à 12h00"
    assert ev["time_known"] is False
    assert ev["start_date"] == "2026-10-07T10:00:00+00:00"


def test_conditional_free_with_membership_amounts(events):
    ev = events["49284"]
    assert ev["price_status"] == "paid" and ev["price_min"] == 0 and ev["price_max"] == 4500
    assert ev["category_slug"] == "ateliers"


def test_placeholder_geocode_dropped(events):
    ev = events["99981"]  # "Plusieurs lieux dans Paris"
    assert ev["venue_lat"] is None and ev["venue_lng"] is None
    assert ev["venue_zip"] is None


def test_free(events):
    assert events["41529"]["is_free"] is True


def test_parse_occurrences_past_midnight():
    occ = parse_occurrences("2026-10-09T21:00:00+02:00_2026-10-09T01:00:00+02:00")
    assert occ == [(datetime(2026, 10, 9, 21), datetime(2026, 10, 10, 1))]


def test_price_rules():
    assert price_from_record({"price_type": "gratuit"})["price_status"] == "free"
    assert price_from_record({"price_type": "payant", "price_detail": "<p>Réservation conseillée</p>"})["price_status"] == "unknown"
    assert price_from_record({"price_type": "payant", "price_detail": "<p>Gratuit pour les moins de 7 ans</p>"})["price_status"] == "unknown"
    p = price_from_record({"price_type": "payant", "price_detail": "<p>Tarif plein&nbsp;: 13&nbsp;€</p>"})
    assert (p["price_status"], p["price_max"]) == ("paid", 1300)
    assert price_from_record({"price_type": "gratuit sous condition", "price_detail": "Sur inscription"})["price_status"] == "free"


def test_category_priority():
    assert map_category(["Concert", "Festival"]) == "concerts"
    assert map_category(["Atelier", "Enfants", "Expo"]) == "ateliers"
    assert map_category(["Sport"]) is None


def test_past_record_skipped(data):
    rec = dict(data["results"][0], occurrences=None,
               date_start="2025-01-01T00:00:00+00:00", date_end="2025-02-01T23:59:59+00:00")
    assert po.parse_record(rec, now=NOW) is None


def test_fetch_switches_to_keyset_past_offset_cap(monkeypatch, data):
    calls = []
    recs = [dict(data["results"][0], id=str(i), event_id=i) for i in range(1, 8)]

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def get_json(self, url, params=None):
            calls.append(dict(params))
            floor = 0
            if "event_id >=" in params["where"]:
                floor = int(params["where"].rsplit(">=", 1)[1])
            pool = [r for r in recs if r["event_id"] >= floor]
            off, lim = params["offset"], params["limit"]
            return {"total_count": len(pool), "results": pool[off:off + lim]}

    monkeypatch.setattr(po, "PoliteClient", FakeClient)
    monkeypatch.setattr(po, "API_OFFSET_CAP", 4)
    got = list(po.fetch_events(limit=2))
    assert sorted(e["source_id"] for e in got) == [str(i) for i in range(1, 8)]
    assert all(c["offset"] + c["limit"] <= 4 for c in calls)
    assert any("event_id >=" in c["where"] for c in calls)
