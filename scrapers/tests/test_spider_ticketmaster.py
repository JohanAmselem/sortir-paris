"""Ticketmaster Discovery API v2.

The fixture ticketmaster_events_synthetic.json is a SYNTHETIC response hand-written from
the official documentation (https://developer.ticketmaster.com/products-and-docs/apis/
discovery-api/v2/) — no API key was available to fetch real data.
"""
import json
from datetime import datetime, timezone

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

import spiders.ticketmaster as tm


def _parse():
    return tm.parse_api(json.loads(load_fixture("ticketmaster_events_synthetic.json")))


def test_parse_api():
    evs, page = _parse()
    assert page["totalPages"] == 1
    assert [e["source_id"] for e in evs] == ["tm-Z698xZ2qZaaaA", "tm-Z698xZ2qZaaaB", "tm-Z698xZ2qZaaaC"]
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "ticketmaster"
    concert, theatre, ballet = evs
    assert concert["start_date"] == "2026-11-20T19:00:00+00:00" and concert["time_known"] is True
    assert (concert["price_min"], concert["price_max"]) == (3550, 7900)
    assert concert["category_slug"] == "concerts"
    assert concert["image_url"].endswith("16_9_2048.jpg")
    assert concert["venue_zip"] == "75019" and concert["venue_lat"] == 48.8944
    # timeTBA → time unknown, cancelled status, no price
    assert theatre["time_known"] is False
    assert theatre["event_status"] == "cancelled"
    assert theatre["category_slug"] == "theatre"
    assert theatre["price_status"] == "unknown"
    # localDate + localTime without dateTime → Paris local (UTC+1 in December)
    assert ballet["start_date"] == "2026-12-10T18:30:00+00:00"
    assert ballet["category_slug"] == "danse"


def test_category_mapping():
    seg = lambda s, g=None: [{"primary": True, "segment": {"name": s}, "genre": {"name": g or "Undefined"}}]
    assert tm.category_for(seg("Sports")) == (None, True)
    assert tm.category_for(seg("Film")) == ("cinema", False)
    assert tm.category_for(seg("Arts & Theatre", "Comedy")) == ("spectacles", False)
    assert tm.category_for(seg("Miscellaneous")) == (None, False)


def test_params_and_skip(monkeypatch, capsys):
    p = tm.build_params("KEY", datetime(2026, 10, 7, 8, 0, tzinfo=timezone.utc),
                        datetime(2026, 10, 14, 8, 0, tzinfo=timezone.utc), 2)
    assert p["startDateTime"] == "2026-10-07T08:00:00Z" and p["page"] == "2"
    assert p["countryCode"] == "FR" and p["radius"] == "18" and p["size"] == "200"
    assert int(p["size"]) * (tm.DEEP_PAGING_LIMIT // tm.PAGE_SIZE - 1) < 1000
    monkeypatch.delenv("TICKETMASTER_API_KEY", raising=False)
    assert list(tm.fetch_events()) == []
    assert "TICKETMASTER_API_KEY not set, skipping" in capsys.readouterr().out
