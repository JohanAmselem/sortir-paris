"""OpenAgenda at scale: service-zone helpers, per-agenda filters, split, config integrity."""
import copy
import json

import pytest

from tests.conftest import load_fixture

import spiders.openagenda as oa
import spiders.openagenda_config as cfg
from spiders.openagenda import location_department, location_zip, location_zone, parse_event
from datetime import datetime, timezone

NOW = datetime(2026, 10, 7, 10, 0, tzinfo=timezone.utc)


def base_event():
    data = json.loads(load_fixture("openagenda_events.json"))["agendas"]
    for page in data.values():
        for e in page["events"]:
            if e["uid"] == 2400130:
                return copy.deepcopy(e)
    raise KeyError


# ── zone helpers ──

@pytest.mark.parametrize("loc,zone,dept", [
    ({"postalCode": "75011"}, "in", "75"),
    ({"postalCode": "93100"}, "in", "93"),
    ({"postalCode": "78000"}, "out", "78"),
    # real case: Montreuil library with empty postalCode and 0/0 coordinates
    ({"postalCode": "", "address": "14 Boulevard Rouget de Lisle, 93100 Montreuil",
      "latitude": 0, "longitude": 0}, "in", "93"),
    ({"department": "Val-de-Marne"}, "in", "94"),
    ({"adminLevel2": "Yvelines"}, "out", "other"),
    ({"latitude": 48.85, "longitude": 2.35}, "in", None),
    ({"latitude": 45.76, "longitude": 4.83}, "out", None),
    ({"latitude": 0, "longitude": 0, "postalCode": ""}, "unknown", None),
    ({}, "unknown", None),
])
def test_location_zone(loc, zone, dept):
    assert location_zone(loc) == zone
    assert location_department(loc) == dept


def test_zero_coordinates_and_missing_postcode_are_repaired():
    e = base_event()
    e["location"].update(postalCode="", latitude=0, longitude=0,
                         address="14 Boulevard Rouget de Lisle, 93100 Montreuil")
    ev = parse_event(e, now=NOW)
    assert ev["venue_zip"] == "93100"
    assert ev["venue_lat"] is None and ev["venue_lng"] is None  # not (0, 0) → no out_of_zone
    from validation import validate
    assert "out_of_zone" not in validate(ev, now=NOW)[1]
    assert location_zip({"postalCode": "75004"}) == "75004"


# ── fetch_events with a fake client ──

class FakeClient:
    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = []

    def get_json(self, url, params=None):
        self.calls.append((url, params))
        return self.pages.pop(0) if self.pages else None


def ev_at(uid, postal):
    e = base_event()
    e["uid"] = uid
    e["location"] = dict(e["location"], postalCode=postal)
    return e


def test_out_of_zone_events_dropped_and_params(monkeypatch):
    page = {"total": 3, "events": [ev_at(1, "75001"), ev_at(2, "78000"), ev_at(3, "92100")]}
    client = FakeClient([page])
    st = {}
    got = list(oa.fetch_events("k", 42, client=client, stats=st, departments=("75", "92")))
    assert sorted(e["source_id"] for e in got) == ["1", "3"]
    assert st["out_of_zone"] == 1 and st["requests"] == 1
    params = client.calls[0][1]
    assert ("department[]", "Paris") in params and ("department[]", "Hauts-de-Seine") in params
    assert ("size", "300") in params
    assert ("relative[]", "upcoming") in params and ("relative[]", "current") in params
    assert ("includeFields[]", "location") in params and ("includeFields[]", "timings") in params


def test_agenda_entirely_out_of_zone_is_abandoned_after_first_page():
    page = {"total": 900, "after": ["x"], "events": [ev_at(i, "69001") for i in range(12)]}
    client = FakeClient([page, page, page])
    st = {}
    assert list(oa.fetch_events("k", 42, client=client, stats=st)) == []
    assert len(client.calls) == 1 and st["skipped_out_of_zone"]


def test_pagination_with_after_cursor_and_cap():
    p1 = {"total": 5, "after": ["a1"], "events": [ev_at(1, "75001"), ev_at(2, "75002")]}
    p2 = {"total": 5, "after": ["a2"], "events": [ev_at(3, "75003"), ev_at(4, "75004")]}
    client = FakeClient([p1, p2, {"events": []}])
    got = list(oa.fetch_events("k", 42, client=client, max_events=4))
    assert [e["source_id"] for e in got] == ["1", "2", "3", "4"]
    assert ("after[]", "a1") in client.calls[1][1]
    assert len(client.calls) == 2  # capped at max_events


# ── split + per-agenda department filter ──

def test_parts_partition_all_agendas():
    paris = oa.agendas_for_part("paris")
    couronne = oa.agendas_for_part("couronne")
    assert set(paris) | set(couronne) == set(cfg.AGENDA_IDS)
    assert not set(paris) & set(couronne)
    assert all(cfg.AGENDA_DEPT[u] in ("92", "93", "94") for u in couronne)
    with pytest.raises(ValueError):
        oa.agendas_for_part("lyon")


def test_fetch_all_passes_departments_only_to_regional_agendas(monkeypatch):
    seen = {}

    def fake(api_key, uid, client=None, **kw):
        seen[uid] = kw.get("departments")
        return iter(())

    monkeypatch.setattr(oa, "fetch_events", fake)
    regional = next(iter(cfg.DEPT_FILTER_IDS))
    local = next(u for u in cfg.AGENDA_IDS if u not in cfg.DEPT_FILTER_IDS)
    list(oa.fetch_all(api_key="k", agenda_ids=[regional, local]))
    assert seen[regional] == oa.ZONE_DEPARTMENTS
    assert seen[local] is None


def test_fetch_all_part_kwarg(monkeypatch):
    called = []
    monkeypatch.setattr(oa, "fetch_events", lambda api_key, uid, client=None, **kw: called.append(uid) or iter(()))
    list(oa.fetch_all(api_key="k", part="couronne"))
    assert called == oa.agendas_for_part("couronne")


# ── config integrity ──

def test_config_integrity():
    ids = cfg.AGENDA_IDS
    assert len(ids) == len(set(ids))
    assert not set(ids) & set(cfg.OUT_OF_ZONE_AGENDA_IDS)
    assert not set(ids) & set(cfg.DISABLED_AGENDA_IDS)
    assert set(cfg.CURATED_AGENDA_IDS) <= set(ids)
    assert set(ids) == set(cfg.AGENDA_DEPT)
    for uid, dept, mode in cfg.DISCOVERED_AGENDAS:
        assert isinstance(uid, int) and uid > 0
        assert dept in ("75", "92", "93", "94", "idf")
        assert mode in ("all", "dept")
        assert (mode == "dept") == (dept == "idf")
    assert len({u for u, _, _ in cfg.DISCOVERED_AGENDAS}) == len(cfg.DISCOVERED_AGENDAS)
