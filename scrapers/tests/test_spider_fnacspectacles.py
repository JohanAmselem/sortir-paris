"""FNAC Spectacles: the site times out for our bot UA (2026-10-07), so the fixture is a
SYNTHETIC hand-written schema.org JSON-LD page (clearly labelled in the file)."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.fnacspectacles import parse_detail_links, parse_listing


def test_listing_jsonld_with_explicit_category():
    evs = parse_listing(load_fixture("fnacspectacles_listing_synthetic.html"), "concerts")
    assert len(evs) == 2
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "fnacspectacles"
        assert ev["category_slug"] == "concerts"
    a, b = evs
    # naive "2026-11-21T20:30:00" is Paris local (UTC+1 in November), never UTC
    assert a["start_date"] == "2026-11-21T19:30:00+00:00" and a["time_known"] is True
    assert (a["price_min"], a["price_max"]) == (3200, 5550)
    assert a["source_url"] == "https://www.fnacspectacles.com/event/concert-synthetique-123456/"
    # date-only → time unknown, no invented hour, price unknown (not free)
    assert b["time_known"] is False
    assert b["price_status"] == "unknown" and b["is_free"] is False


def test_detail_links():
    links = parse_detail_links(load_fixture("fnacspectacles_listing_synthetic.html"))
    assert links == [
        "https://www.fnacspectacles.com/event/concert-synthetique-123456/",
        "https://www.fnacspectacles.com/event/autre-777/",
    ]
