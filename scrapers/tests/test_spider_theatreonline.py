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
    # 30 cards; the Montigny-le-Bretonneux (78) one is outside Paris + petite couronne
    assert len(evs) == 29
    assert not any(e["venue_city"] == "Montigny-le-Bretonneux" for e in evs)
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
    assert parse_location("Théâtre de Saint-Quentin-en-Yvelines, Montigny-le-Bretonneux (78)") is None
    assert parse_location("Théâtre Jean Vilar, Suresnes (92)") == ("Théâtre Jean Vilar", "Suresnes", None)
    assert parse_location("MC93, Bobigny (93)")[1] == "Bobigny"
    assert parse_location(None) is None


def test_fetch_paginates_until_no_new_cards(monkeypatch):
    """All listing pages are read (no artificial page cap); past the last page the
    site redirects to page 1, so the loop stops on the first page without new shows."""
    import spiders.theatreonline as mod

    page_html = load_fixture("theatreonline_listing.html")
    calls = []

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get_text(self, url):
            calls.append(url)
            n = int(url.rsplit("=", 1)[1])
            if n == 1:
                return page_html
            if n == 2:  # a page with other shows
                return page_html.replace("/97022", "/1197022")
            return page_html  # past the last page: redirected to page 1 → nothing new

    monkeypatch.setattr(mod, "PoliteClient", FakeClient)
    evs = list(mod.fetch_events(max_venues=0))
    assert len(calls) == 3
    assert len(evs) == 30  # 29 + the renamed show of page 2


def test_venue_page_address_and_lookup(monkeypatch):
    """Show page → /Theatre/ page → Place microdata (street, postcode, geo)."""
    import spiders.theatreonline as mod

    assert mod.parse_theatre_link(load_fixture("theatreonline_detail.html")) == \
        "https://www.theatreonline.com/Theatre/Theatre-Saint-Georges/209"
    info = mod.parse_venue_page(load_fixture("theatreonline_theatre.html"))
    assert info == {"venue_address": "51, rue Saint-Georges", "venue_zip": "75009", "venue_city": "Paris",
                    "venue_lat": 48.8782005, "venue_lng": 2.33744}
    assert mod.parse_venue_page("<html></html>") is None

    evs = parse_listing(load_fixture("theatreonline_listing.html"), today=TODAY)
    pages = {"https://www.theatreonline.com/Spectacle/": load_fixture("theatreonline_detail.html"),
             "https://www.theatreonline.com/Theatre/": load_fixture("theatreonline_theatre.html")}
    calls = []

    class FakeClient:
        def get_text(self, url):
            calls.append(url)
            return next(v for k, v in pages.items() if url.startswith(k))

    # every venue resolves to the same fixture page here; check one venue only
    n = mod.enrich_venues(evs, FakeClient(), max_venues=1)
    assert n == 1 and len(calls) == 2
    # venues without postcode are looked up first (suburbs "(92)" / bare "Paris")
    changed = [e for e in evs if e.get("venue_address") == "51, rue Saint-Georges"]
    assert changed and all(e["venue_zip"] == "75009" and e["venue_lat"] == 48.8782005 for e in changed)
    assert {e["venue_name"] for e in changed} and all(
        not any(o.get("venue_zip") for o in parse_listing(load_fixture("theatreonline_listing.html"), today=TODAY)
                if o["venue_name"] == e["venue_name"]) for e in changed)
