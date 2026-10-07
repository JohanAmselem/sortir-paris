"""BilletReduc: real pages fetched 2026-10-07 (trimmed): /theatre listing + one show page."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.billetreduc import parse_detail, parse_listing, show_id

SHOW = "https://www.billetreduc.com/spectacle/maitre-mo-379190"


def test_listing_itemlist_urls():
    urls = parse_listing(load_fixture("billetreduc_listing_theatre.html"))
    assert len(urls) == 20
    assert urls[0] == "https://www.billetreduc.com/spectacle/le-temps-de-vivre-410450"
    assert all(show_id(u) for u in urls)


def test_detail_jsonld_event():
    evs = parse_detail(load_fixture("billetreduc_detail.html"), SHOW, "theatre")
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["source"] == "billetreduc"
    assert ev["source_id"] == "billetreduc-379190"
    assert ev["title"] == "Maître Mô"
    # "2026-10-12T21:00:00+02:00" → UTC
    assert ev["start_date"] == "2026-10-12T19:00:00+00:00"
    assert ev["time_known"] is True
    assert ev["end_date"] == "2027-01-05T20:00:00+00:00"
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1095, 3450, "paid")
    assert ev["venue_name"] == "Le Funambule Montmartre"
    assert ev["venue_zip"] == "75018" and ev["venue_arrondissement"] == "18e"
    assert ev["category_slug"] == "theatre"
    assert ev["booking_url"] == SHOW
