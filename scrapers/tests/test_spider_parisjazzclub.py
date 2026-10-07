from __future__ import annotations

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.parisjazzclub import parse_listing


def _events():
    return parse_listing(load_fixture("parisjazzclub_agenda.html"))


def test_parse_listing_valid_and_idf_only():
    events = _events()
    assert len(events) == 23  # 24 cards, 1 in Noyon (60400) filtered out
    for ev in events:
        assert_valid_event(ev)
        assert ev["source"] == "parisjazzclub"
        assert ev["category_slug"] == "concerts"
        assert ev["venue_name"], "real club name expected"
        assert ev["venue_zip"][:2] in ("75", "77", "78", "91", "92", "93", "94", "95")
        assert ev["description"] != "Concert de jazz."
    assert not any(e["venue_name"] == "Cinema Paradisio" for e in events)


def test_real_venue_time_price():
    events = {e["source_id"]: e for e in _events()}
    alibo = events["111378"]
    assert alibo["title"] == "Michel Alibo"
    assert alibo["venue_name"] == "New Morning"
    assert alibo["venue_zip"] == "75010"
    assert alibo["venue_arrondissement"]
    # 19:30 Paris (CEST) → 17:30 UTC
    assert alibo["start_date"] == "2026-10-07T17:30:00+00:00"
    assert alibo["time_known"] is True
    assert alibo["price_status"] == "paid" and alibo["price_min"] == 3850
    assert alibo["description"].startswith("Michel Alibo, bassiste")
    assert alibo["image_url"].startswith("https://www.parisjazzclub.net/medias/")

    duc = events["110945"]
    assert duc["venue_name"] == "Duc des Lombards"
    assert duc["price_min"] == 4100

    free = events["110684"]
    assert free["is_free"] is True and free["price_status"] == "free"


def test_title_only_description_dropped():
    ev = {e["source_id"]: e for e in _events()}["111540"]
    assert ev["description"] is None


def test_missing_time_is_unknown():
    html = load_fixture("parisjazzclub_agenda.html").replace(
        'content="2026-10-07 19:30:00" itemprop="startDate"',
        'content="2026-10-07 00:00:00" itemprop="startDate"',
    )
    ev = {e["source_id"]: e for e in parse_listing(html)}["111378"]
    assert ev["time_known"] is False


def test_zero_price_without_free_flag_is_unknown():
    html = load_fixture("parisjazzclub_agenda.html").replace(
        'content="38.50" itemprop="price"', 'content="0" itemprop="price"'
    )
    ev = {e["source_id"]: e for e in parse_listing(html)}["111378"]
    assert ev["price_status"] == "unknown"
