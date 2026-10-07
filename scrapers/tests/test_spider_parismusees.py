from datetime import date

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.parismusees import build_event, parse_detail, parse_listing

TODAY = date(2026, 10, 7)


def cards():
    return parse_listing(load_fixture("parismusees_listing.html"))


def test_listing_cards():
    cs = cards()
    assert len(cs) == 13  # promoted duplicate removed
    nadar = cs[0]
    assert nadar["url"] == "https://www.parismusees.paris.fr/fr/exposition/nadar-inventer-paris-des-profondeurs-au-ciel"
    assert nadar["museum"] == "Catacombes de Paris"
    assert nadar["start"] == date(2026, 9, 29) and nadar["end"] == date(2027, 1, 31)
    assert nadar["image_url"].startswith("https://www.parismusees.paris.fr/sites/default/files/")


def test_events_from_listing_only():
    evs = [build_event(c, None, today=TODAY) for c in cards()]
    evs = [e for e in evs if e]
    assert len(evs) == 13
    for ev in evs:
        assert_valid_event(ev)
        assert ev["time_known"] is False  # exhibitions: no hours → unknown, never invented
        assert ev["price_status"] == "unknown"
        assert ev["category_slug"] == "expos"


def test_detail_enriches_event():
    det = parse_detail(load_fixture("parismusees_detail.html"))
    assert det["date_text"] == "du 15 septembre 2026 au 24 janvier 2027"
    assert det["zip"] == "75008"
    card = [c for c in cards() if c["url"].endswith("/eva-gonzales-1847-1883")][0]
    ev = build_event(card, det, today=TODAY)
    assert_valid_event(ev)
    assert ev["start_date"] == "2026-09-15T10:00:00+00:00"
    assert ev["end_date"] == "2027-01-24T22:59:00+00:00"
    assert ev["venue_name"] == "Petit Palais, musée des Beaux-arts de la Ville de Paris"
    assert ev["venue_address"] == "Avenue Winston Churchill"
    assert ev["venue_arrondissement"] == "8e"
    assert ev["source_id"] == "pm-eva-gonzales-1847-1883"
    assert ev["description"].startswith("L’exposition présentée au Petit Palais")


def test_finished_exhibition_skipped():
    card = dict(cards()[0], start=date(2025, 1, 1), end=date(2025, 3, 1))
    assert build_event(card, None, today=TODAY) is None


def test_undated_card_skipped():
    card = dict(cards()[0], start=None, end=None)
    assert build_event(card, None, today=TODAY) is None
