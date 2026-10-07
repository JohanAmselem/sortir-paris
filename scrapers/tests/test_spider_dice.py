"""DICE: real browse page https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d fetched
2026-10-07, trimmed to __NEXT_DATA__."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.dice import city_from_address, parse_browse, price_from_dice


def test_browse_page():
    evs = parse_browse(load_fixture("dice_browse_paris.html"), "concerts")
    assert len(evs) == 29  # 30 minus one off-topic (speed-dating)
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "dice" and ev["category_slug"] == "concerts"
    by_id = {e["source_id"]: e for e in evs}
    ev = by_id["dice-6ab130fafcbb420001cac2dd"]
    assert ev["title"] == "DOVE ELLIS"
    assert ev["start_date"] == "2026-12-03T19:00:00+00:00" and ev["time_known"] is True
    assert (ev["price_min"], ev["price_max"]) == (2000, 2000)  # DICE amounts are centimes
    assert ev["venue_name"] == "Point Ephémère" and ev["venue_zip"] == "75010"
    assert ev["source_url"] == "https://dice.fm/event/6ab130fafcbb420001cac2dd"
    assert ev["venue_lat"] is None  # city centroid is not a venue position
    assert by_id["dice-6ab3e2e0f47ecf00016c7640"]["venue_city"] == "Saint-Ouen-sur-Seine"


def test_price_rules():
    assert price_from_dice({"currency": "EUR", "amount": None, "amount_from": 2650})["price_min"] == 2650
    assert price_from_dice({"currency": "EUR", "amount": 0}, "on-sale")["price_status"] == "free"
    assert price_from_dice({"currency": "EUR", "amount": 0}, "sold-out")["price_status"] == "unknown"
    assert price_from_dice({"currency": "EUR", "amount": None, "amount_from": 0})["price_status"] == "unknown"
    assert price_from_dice({"currency": "GBP", "amount": 1500})["price_status"] == "unknown"


def test_city_from_address():
    assert city_from_address("16 Place de la Bourse, 75002 Paris-2E-Arrondissement, France") == "Paris"
