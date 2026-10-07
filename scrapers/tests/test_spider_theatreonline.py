from __future__ import annotations

from datetime import date

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.theatreonline import parse_listing, parse_location

TODAY = date(2026, 10, 7)


def _by_id(evs, sid):
    return next(e for e in evs if e["source_id"] == sid)


def test_listing_cards():
    evs = parse_listing(load_fixture("theatreonline_listing.html"), today=TODAY)
    assert len(evs) == 30
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "theatreonline"
        assert ev["time_known"] is False  # no show times on the listing: never invented
    pere = _by_id(evs, "97022")
    assert pere["title"] == "Le Père"
    assert pere["start_date"] == "2026-09-24T10:00:00+00:00"
    assert pere["end_date"].startswith("2027-01-03")  # "du 24 sept. 2026 au 3 janv. 2027"
    assert pere["venue_name"] == "Théâtre Edouard VII"
    assert pere["venue_zip"] == "75009"
    assert (pere["price_min"], pere["price_max"], pere["price_status"]) == (4500, 11500, "paid")
    assert pere["category_slug"] == "theatre"
    assert pere["source_url"] == "https://www.theatreonline.com/Spectacle/Le-Pere/97022"
    # suburb venue, single date
    lazcar = _by_id(evs, "98428")
    assert lazcar["venue_city"] == "Bagneux"
    assert lazcar["end_date"] is None
    assert lazcar["category_slug"] == "concerts"


def test_date_fallback_month_order_rollover_and_duration():
    """Without the ISO metas, the visible line is parsed: 'du 15 oct. au 10 janv.'
    must end in January of the NEXT year, and '1h40' (duration) is not a time."""
    html = load_fixture("theatreonline_listing.html")
    card_start = html.index('href="/Spectacle/Le-Pere/97022"')
    card_end = html.index('itemprop="endDate"/>', card_start) + len('itemprop="endDate"/>')
    card = html[card_start:card_end]
    patched = card.replace("du 24 sept. 2026 au 3 janv. 2027", "du 15 oct. au 10 janv. 1h40")
    patched = patched.replace('<meta content="2026-09-24" itemprop="startDate"/>', "")
    patched = patched.replace('<meta content="2027-01-03" itemprop="endDate"/>', "")
    ev = _by_id(parse_listing(html.replace(card, patched), today=TODAY), "97022")
    assert ev["start_date"].startswith("2026-10-15")
    assert ev["end_date"].startswith("2027-01-10")
    assert ev["time_known"] is False


def test_parse_location():
    assert parse_location("Théâtre du Palais Royal, Paris 1e") == ("Théâtre du Palais Royal", "Paris", "75001")
    assert parse_location("Avant-Seine, Colombes (92)") == ("Avant-Seine", "Colombes", None)
    assert parse_location("Théâtre des Halles, Avignon (84)") is None
    assert parse_location(None) is None
