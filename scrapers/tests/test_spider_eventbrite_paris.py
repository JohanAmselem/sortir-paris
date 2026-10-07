"""Eventbrite: real listing (/d/france--paris/music--events/) and event page fetched
2026-10-07, trimmed to window.__SERVER_DATA__ / JSON-LD."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.eventbrite_paris import (
    apply_detail,
    event_from_result,
    in_paris_region,
    is_off_topic,
    parse_detail,
    parse_listing,
)


def _listing():
    return parse_listing(load_fixture("eventbrite_listing_music.html"), "concerts")


def test_listing_events():
    evs = _listing()
    assert len(evs) == 8  # duplicated blocks deduplicated by id
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "eventbrite"
        assert ev["source_id"].startswith("eb-")
    by_id = {e["source_id"]: e for e in evs}
    ev = by_id["eb-1999263585202"]
    # start_date 2026-10-09 + start_time 22:00 Europe/Paris → 20:00 UTC (not midnight UTC)
    assert ev["start_date"] == "2026-10-09T20:00:00+00:00" and ev["time_known"] is True
    assert ev["venue_zip"] == "75011" and ev["venue_lat"] == 48.8537411
    assert ev["category_slug"] == "concerts"
    assert ev["price_status"] == "unknown"  # no price in listing → unknown, not free
    # Eventbrite format "Screening" overrides the listing category
    assert by_id["eb-1994892741892"]["category_slug"] == "cinema"
    # suburbs inside IDF are kept
    assert by_id["eb-1997150977335"]["venue_zip"] == "93400"


def test_detail_price_currency_respected():
    info = parse_detail(load_fixture("eventbrite_detail.html"))
    # this organiser sells in CAD → we do not store it as euros
    assert info["price"]["price_status"] == "unknown"
    assert info["start"] == "2026-10-09T22:00:00+02:00"


def test_apply_detail_aggregate_offer_eur():
    html = ('<script type="application/ld+json">{"@type":"Event","name":"X","startDate":"2026-10-09T22:00:00+02:00",'
            '"offers":[{"@type":"AggregateOffer","lowPrice":"12.0","highPrice":"22.0","priceCurrency":"EUR"}]}</script>')
    ev = _listing()[0]
    apply_detail(ev, parse_detail(html))
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1200, 2200, "paid")


def _result(**over):
    r = {
        "id": "1", "name": "Concert jazz", "timezone": "Europe/Paris",
        "start_date": "2026-11-02", "start_time": "20:00", "end_date": "2026-11-02", "end_time": "22:00",
        "url": "https://www.eventbrite.fr/e/x-1",
        "primary_venue": {"name": "Salle", "address": {"city": "Paris", "postal_code": "75011",
                                                        "latitude": "48.85", "longitude": "2.37"}},
    }
    r.update(over)
    return r


def test_geo_filter():
    assert in_paris_region(48.85, 2.35) is True
    assert in_paris_region(49.44, 1.10) is False  # Rouen
    assert in_paris_region(None, None, "92100") is True
    assert in_paris_region(None, None, "76000") is False
    assert in_paris_region(None, None, None) is False
    rouen = _result(primary_venue={"name": "Le 106", "address": {"city": "Rouen", "postal_code": "76100",
                                                                  "latitude": "49.43", "longitude": "1.08"}})
    assert event_from_result(rouen) is None
    assert event_from_result(_result(primary_venue=None)) is None
    assert event_from_result(_result(is_online_event=True)) is None
    no_geo = _result(primary_venue={"name": "Salle", "address": {"postal_code": "93100"}})
    assert event_from_result(no_geo)["venue_zip"] == "93100"


def test_date_only_is_time_unknown():
    ev = event_from_result(_result(start_time=None, end_time=None))
    assert ev["time_known"] is False
    assert ev["start_date"] == "2026-11-02T11:00:00+00:00"  # 12:00 Paris placeholder, flagged unknown


def test_is_off_topic():
    assert is_off_topic("Career Fair Paris 2026")
    assert is_off_topic("Salon de l'emploi IT", "")
    assert is_off_topic("Soirée networking entrepreneurs")
    assert is_off_topic("Masterclass Business : scaler sa startup")
    assert is_off_topic("Crypto trading for beginners")
    assert is_off_topic("Webinar : formation certifiante")
    assert not is_off_topic("Concert de jazz au Duc des Lombards", "Quartet live")
    assert not is_off_topic("Exposition Bourse de Commerce")
    assert event_from_result(_result(name="Investor networking night")) is None
