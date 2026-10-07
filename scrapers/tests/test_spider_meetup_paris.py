"""Meetup: real /find pages fetched 2026-10-07 (categoryId=521 Art & Culture, and 546
Technology), trimmed to __NEXT_DATA__ → __APOLLO_STATE__."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.meetup_paris import event_from_apollo, parse_find_page


def test_art_and_culture_page():
    evs = parse_find_page(load_fixture("meetup_find_art.html"))
    assert len(evs) == 11
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "meetup" and ev["is_online"] is False
    by_id = {e["source_id"]: e for e in evs}
    ev = by_id["meetup-316406003"]
    assert ev["title"] == '"Robert Badinter" au Théâtre Antoine'
    assert ev["category_slug"] == "theatre"
    # no feeSettings → unknown price, never free
    assert ev["price_status"] == "unknown" and ev["is_free"] is False
    fee = by_id["meetup-316675550"]
    # "2026-10-07T19:30:00+02:00"
    assert fee["start_date"] == "2026-10-07T17:30:00+00:00" and fee["time_known"] is True
    assert (fee["price_min"], fee["price_max"], fee["price_status"]) == (1000, 1000, "paid")
    assert fee["venue_name"] == "Poinçon Paris"
    assert fee["image_url"].startswith("https://secure.meetupstatic.com/photos/event/")


def test_online_and_off_topic_dropped():
    # Technology page: online event + tech/business meetups, none should survive a keyword query
    assert parse_find_page(load_fixture("meetup_find_tech.html"), require_category=True) == []
    online = {"id": "1", "title": "Atelier peinture", "dateTime": "2026-10-10T18:00:00+02:00",
              "eventType": "ONLINE", "venue": {"name": "Online event"}}
    assert event_from_apollo(online, {}) is None
    no_venue = dict(online, eventType="PHYSICAL", venue=None)
    assert event_from_apollo(no_venue, {}) is None
