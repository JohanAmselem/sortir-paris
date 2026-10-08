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


def test_concert_cards_use_first_non_empty_start_date_with_time():
    """Concert cards (trimmed /concerts/programme.html?npage=2, 2026-10-09) have an
    empty startDate meta first and the real one with the time at the bottom: before the
    fix every concert card was dropped."""
    evs = parse_listing(load_fixture("offi_listing_concerts.html"), "concerts")
    assert len(evs) == 15
    for ev in evs:
        assert_valid_event(ev)
        assert ev["venue_zip"][:2] in {"75", "92", "93", "94"}
        assert ev["category_slug"] == "concerts"
    trio = next(e for e in evs if e["source_id"] == "3316207")
    assert trio["title"] == "Rémy Decormeille trio"
    assert trio["start_date"] == "2026-10-09T17:45:00+00:00"  # "2026-10-09 19:45:00" Paris
    assert trio["time_known"] is True
    assert trio["price_status"] == "unknown"
    helios = next(e for e in evs if e["source_id"] == "3174107")
    assert (helios["price_min"], helios["price_max"], helios["price_status"]) == (2250, 6600, "paid")


def test_stage_cards_price_tag_and_category_from_tags():
    evs = parse_listing(load_fixture("offi_listing_theatre.html"), "theatre")
    assert len(evs) == 15
    by_id = {e["source_id"]: e for e in evs}
    assert (by_id["86966"]["price_min"], by_id["86966"]["price_max"]) == (4800, 8200)  # "48-82 €"
    assert by_id["86966"]["category_slug"] == "danse"  # Le Lac des cygnes: "Ballet"
    assert by_id["106631"]["category_slug"] == "theatre"
    assert by_id["33928"]["category_slug"] == "spectacles"  # Le Roi Lion: "Comédie musicale"
    assert by_id["106877"]["category_slug"] == "spectacles"  # "Cirque contemporain"
    # discount badges ("-31%") and price tags are not tags
    assert all("%" not in t and "€" not in t for e in evs for t in e["tags_raw"])


def test_pagination_last_page_and_zone():
    from spiders.offi import _zip_ok, last_page

    assert last_page(load_fixture("offi_listing_theatre.html")) == 137
    assert last_page(load_fixture("offi_listing_concerts.html")) == 189
    assert _zip_ok("75011") and _zip_ok("92100") and _zip_ok("93200") and _zip_ok("94300")
    assert not _zip_ok("78000") and not _zip_ok("77420") and not _zip_ok(None)


def test_merge_detail_keeps_listing_time_and_adds_price_geo():
    from spiders.offi import merge_detail

    listing = parse_listing(load_fixture("offi_listing_concerts.html"), "concerts")[0]
    detail = parse_detail(load_fixture("offi_detail_theatre.html"), THEATRE_URL)[0]
    ev = merge_detail(listing, detail)
    assert ev["start_date"] == listing["start_date"] and ev["time_known"] is True
    assert ev["title"] == listing["title"]
    assert (ev["price_min"], ev["price_max"]) == (1650, 4950)
    assert ev["venue_lat"] == detail["venue_lat"]
