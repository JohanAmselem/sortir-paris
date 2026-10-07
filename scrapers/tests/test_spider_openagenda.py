import copy
import json
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

import spiders.openagenda as oa
from spiders.openagenda import parse_event, parse_events_page, select_occurrence

NOW = datetime(2026, 10, 7, 10, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def data():
    return json.loads(load_fixture("openagenda_events.json"))["agendas"]


@pytest.fixture(scope="module")
def events(data):
    out = {}
    for uid, page in data.items():
        for ev in parse_events_page(page, agenda_uid=uid, now=NOW):
            out[ev["source_id"]] = ev
    return out


def raw_event(data, uid):
    for page in data.values():
        for e in page["events"]:
            if e["uid"] == uid:
                return copy.deepcopy(e)
    raise KeyError(uid)


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


# ── timing selection ──

def test_select_occurrence_run_keeps_end_of_run():
    occ = [(utc(2026, 10, d, 18), utc(2026, 10, d, 20)) for d in (1, 8, 15, 22)]
    assert select_occurrence(occ, now=NOW) == (utc(2026, 10, 8, 18), utc(2026, 10, 22, 20))


def test_select_occurrence_scattered_dates_end_with_occurrence():
    occ = [(utc(2026, 10, 9, 18), utc(2026, 10, 9, 20)), (utc(2027, 3, 1, 18), utc(2027, 3, 1, 20))]
    assert select_occurrence(occ, now=NOW) == (utc(2026, 10, 9, 18), utc(2026, 10, 9, 20))


def test_select_occurrence_long_run_over_400_days():
    occ = [(utc(2026, 10, 8) + timedelta(days=7 * i), utc(2026, 10, 8, 2) + timedelta(days=7 * i)) for i in range(70)]
    start, end = select_occurrence(occ, now=NOW)
    assert start == utc(2026, 10, 8) and end == utc(2026, 10, 8, 2)


def test_select_occurrence_all_past():
    assert select_occurrence([(utc(2026, 1, 1, 18), utc(2026, 1, 1, 20))], now=NOW) is None


def test_ongoing_occurrence_is_selected():
    # began before now but ends after now → still the "next" occurrence
    occ = [(utc(2026, 10, 7, 8), utc(2026, 10, 7, 16))]
    assert select_occurrence(occ, now=NOW)[0] == utc(2026, 10, 7, 8)


# ── parsing real fixture ──

def test_all_events_valid(events):
    assert len(events) >= 25
    for ev in events.values():
        assert_valid_event(ev)
        assert ev["source"] == "openagenda"


def test_free_event_exact_values(events):
    ev = events["2400130"]  # Jardin des Langues (FICEP)
    assert ev["title"] == "Jardin des Langues"
    assert ev["start_date"] == "2026-10-07T09:00:00+00:00"
    assert ev["time_known"] is True
    assert ev["price_status"] == "free" and ev["is_free"]  # "Entrée gratuite sur inscription"
    assert ev["venue_zip"] == "75001" and ev["venue_arrondissement"] == "1er"
    assert ev["venue_lat"] is not None and ev["venue_lng"] is not None


def test_run_end_and_price_from_conditions(events):
    ev = events["50588723"]  # La Cité des bébés, daily sessions until 17 Jan 2027
    assert ev["end_date"] == "2027-01-17T16:30:00+00:00"
    assert ev["price_status"] == "paid" and ev["price_max"] == 450
    assert ev["venue_name"].startswith("Cité des sciences")
    assert ev["image_url"].startswith("https://img.openagenda.com/main/")


def test_registration_types(events):
    assert events["30285768"]["booking_url"] == "https://cwb.fr/agenda/anarkhe-exposition-asile-exodus-fuga"
    assert events["97672168"]["booking_url"] == "mailto:cciran.paris@gmail.com"
    assert events["24490260"]["booking_url"] == "tel:0130978755"


def test_unparseable_conditions_is_unknown(events):
    ev = events["47338345"]  # conditions = a URL only
    assert ev["price_status"] == "unknown" and ev["price_max"] == 0


def test_cancelled_online_postponed(data):
    base = raw_event(data, 2400130)
    c = dict(base, status=6)
    assert parse_event(c, agenda_uid=61665301, now=NOW)["event_status"] == "cancelled"
    o = dict(base, attendanceMode=2)
    assert parse_event(o, agenda_uid=61665301, now=NOW)["is_online"] is True
    assert parse_event(dict(base, status=4), agenda_uid=61665301, now=NOW) is None
    assert parse_event(base, agenda_uid=61665301, now=NOW)["event_status"] == "scheduled"


def test_monolingual_strings_and_missing_fields(data):
    e = raw_event(data, 2400130)
    e["title"] = "Titre simple"
    e["description"] = "Desc"
    e["conditions"] = "Entrée libre"
    e["registration"] = []
    ev = parse_event(e, agenda_uid=61665301, now=NOW)
    assert ev["title"] == "Titre simple" and ev["is_free"]
    assert ev["booking_url"] == ev["source_url"]


def test_past_event_skipped(data):
    e = raw_event(data, 2400130)
    e["timings"] = [{"begin": "2025-01-01T10:00:00+01:00", "end": "2025-01-01T12:00:00+01:00"}]
    assert parse_event(e, now=NOW) is None


# ── network wrappers (no network) ──

def test_fetch_all_without_key_yields_nothing(monkeypatch):
    monkeypatch.delenv("OPENAGENDA_API_KEY", raising=False)
    assert list(oa.fetch_all()) == []


def test_fetch_all_one_agenda_failure_does_not_stop_others(monkeypatch):
    def fake(api_key, uid, client=None, **kw):
        if uid == 1:
            raise RuntimeError("boom")
        yield {"source_id": f"ev-{uid}"}

    monkeypatch.setattr(oa, "fetch_events", fake)
    got = list(oa.fetch_all(api_key="k", agenda_ids=[1, 2, 3]))
    assert [g["source_id"] for g in got] == ["ev-2", "ev-3"]


def test_config_has_no_duplicates_and_avignon_disabled():
    from spiders.openagenda_config import AGENDA_IDS
    assert len(AGENDA_IDS) == len(set(AGENDA_IDS))
    assert 65853096 not in AGENDA_IDS  # Petit Palais d'Avignon
    assert oa.AGENDA_IDS is AGENDA_IDS
