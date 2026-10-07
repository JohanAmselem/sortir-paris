from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.paris_fr import parse_detail, parse_listing, record_id

URL = "https://www.paris.fr/evenements/l-exposition-permanente-du-musee-banksy-sur-le-plus-mysterieux-des-graffeurs-51551"


def test_listing_links_absolute_and_unique():
    urls = parse_listing(load_fixture("paris_fr_listing.html"))
    assert len(urls) == len(set(urls)) >= 20
    assert all(u.startswith("https://www.paris.fr/evenements/") for u in urls)
    assert record_id(urls[0]).isdigit()


def test_detail_jsonld():
    evs = parse_detail(load_fixture("paris_fr_detail.html"), URL)
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["source"] == "paris_fr"
    assert ev["source_id"].startswith("51551#")  # same id as the open-data record
    assert ev["start_date"] == "2019-06-01T10:00:00+00:00"  # 00:00 → date only
    assert ev["end_date"] == "2026-12-31T22:59:00+00:00"
    assert ev["time_known"] is False
    assert ev["price_status"] == "unknown"
    assert ev["venue_zip"] == "75009"
    assert ev["booking_url"] == "https://museebanksy.fr/"
