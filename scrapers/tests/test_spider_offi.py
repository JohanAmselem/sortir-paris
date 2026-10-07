from __future__ import annotations

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.offi import parse_detail, parse_listing

THEATRE_URL = "https://www.offi.fr/theatre/theatre-du-gymnase-2434/brassens-lamour-des-mots-100884.html"
EXPO_URL = "https://www.offi.fr/expositions-musees/petit-palais-2991/eva-gonzales-1847-1883-106769.html"


def test_listing_microdata_cards():
    evs = parse_listing(load_fixture("offi_listing_expos.html"), "expos")
    assert len(evs) >= 10
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "offi"
        assert ev["time_known"] is False  # Offi gives date-only ranges: never invent a time
        assert ev["venue_zip"][:2] in {"75", "77", "78", "91", "92", "93", "94", "95"}
        assert ev["price_status"] == "unknown"  # no price on listing cards
    monet = next(e for e in evs if e["title"] == "Monet, peindre le temps")
    assert monet["source_id"] == "105855"
    assert monet["start_date"] == "2026-09-30T10:00:00+00:00"  # date-only → 12:00 Paris
    assert monet["end_date"].startswith("2027-01-25")
    assert monet["venue_name"] == "Musée de l'Orangerie"
    assert monet["venue_arrondissement"] == "1er"


def test_detail_theatre_with_aggregate_offer():
    ev = parse_detail(load_fixture("offi_detail_theatre.html"), THEATRE_URL)[0]
    assert_valid_event(ev)
    assert ev["title"] == "Brassens, l'amour des mots"
    assert ev["source_id"] == "100884"
    assert ev["start_date"].startswith("2026-09-18")
    assert ev["end_date"].startswith("2027-01-17")
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1650, 4950, "paid")
    assert ev["venue_name"] == "Théâtre du Gymnase"
    assert ev["venue_address"] == "38 boulevard de Bonne-Nouvelle"
    assert ev["venue_zip"] == "75010"
    assert abs(ev["venue_lat"] - 48.8705) < 1e-3
    assert ev["category_slug"] == "theatre"
    assert ev["time_known"] is False


def test_detail_expo_price_from_tarifs_text():
    ev = parse_detail(load_fixture("offi_detail_expo.html"), EXPO_URL)[0]
    assert_valid_event(ev)
    # "Tarifs : 14€, tarif réduit 12€."
    assert (ev["price_min"], ev["price_max"], ev["is_free"]) == (1200, 1400, False)
    assert ev["category_slug"] == "expos"
