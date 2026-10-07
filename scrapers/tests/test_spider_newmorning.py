from __future__ import annotations

from datetime import time

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.newmorning import build_event, parse_detail, parse_listing


def _items():
    return parse_listing(load_fixture("newmorning_programmation.html"))


def test_listing_without_detail_has_no_invented_time():
    items = _items()
    assert len(items) == 13
    for it in items:
        ev = build_event(it)
        assert_valid_event(ev)
        assert ev["source"] == "newmorning"
        assert ev["venue_name"] == "New Morning"
        assert ev["venue_zip"] == "75010"
        assert ev["time_known"] is False  # JSON-LD startDate is always T00:00:00
        assert ev["category_slug"] == "concerts"
        assert ev["end_date"] is None  # placeholder 23:30 endDate ignored


def test_price_placeholder_and_real_price():
    by_id = {it["source_id"]: build_event(it) for it in _items()}
    assert by_id["7761"]["price_status"] == "unknown"  # "0.00" is not "free"
    assert by_id["7730"]["price_status"] == "paid" and by_id["7730"]["price_min"] == 3100


def test_cancelled_status():
    by_id = {it["source_id"]: build_event(it) for it in _items()}
    assert by_id["7782"]["event_status"] == "cancelled"


def test_detail_gives_real_time_and_description():
    d = parse_detail(load_fixture("newmorning_detail_michel-alibo.html"))
    assert d["show_time"] == time(20, 0)
    assert d["doors_time"] == time(19, 30)
    assert d["styles"] == ["Jazz"]
    assert d["description"].startswith("Michel Alibo, bassiste")

    item = next(i for i in _items() if i["source_id"] == "7761")
    ev = build_event(item, d)
    assert_valid_event(ev)
    assert ev["title"] == "Michel Alibo"
    # 20:00 Paris (CEST) → 18:00 UTC
    assert ev["start_date"] == "2026-10-07T18:00:00+00:00"
    assert ev["time_known"] is True
    assert ev["source_url"] == "https://www.newmorning.com/20261007-7761-michel-alibo.html"
    assert ev["image_url"].startswith("https://www.newmorning.com/photos/")


def test_detail_without_time():
    d = parse_detail("<html><body><div class='ev-infos'><span>Complet</span></div></body></html>")
    assert d["show_time"] is None
    ev = build_event(_items()[0], d)
    assert ev["time_known"] is False


def test_detail_two_sets_uses_first_set():
    d = parse_detail(load_fixture("newmorning_detail_two-sets.html"))
    assert [t for t, _ in d["show_times"]] == [time(19, 0), time(21, 30)]
    item = next(i for i in _items() if i["source_id"] == "7730")
    ev = build_event(item, d)
    assert_valid_event(ev)
    # 19:00 Paris (CEST) → 17:00 UTC
    assert ev["start_date"] == "2026-10-08T17:00:00+00:00"
    assert ev["time_known"] is True
    assert "19h00" in ev["description"] and "21h30" in ev["description"]
