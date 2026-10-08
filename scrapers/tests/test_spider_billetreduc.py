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


def test_pagination_last_page():
    from spiders.billetreduc import last_page

    html = load_fixture("billetreduc_listing_theatre_pagination.html")
    assert last_page(html) == 57
    assert len(parse_listing(html)) == 20
    assert last_page(load_fixture("billetreduc_listing_theatre.html")) == 1


def test_zone_filter_drops_shows_outside_petite_couronne():
    html = load_fixture("billetreduc_detail.html")
    assert parse_detail(html.replace("75018", "69002"), SHOW, "theatre") == []
    assert len(parse_detail(html.replace("75018", "93100"), SHOW, "theatre")) == 1


def test_fetch_reads_listings_proportionally_and_stops_on_budget(monkeypatch):
    """Page 1 of every listing first, then the listing with the smallest share read;
    show pages are opened until the time budget is nearly spent."""
    import spiders.billetreduc as mod

    listing = load_fixture("billetreduc_listing_theatre_pagination.html")  # 20 shows, 57 pages
    detail = load_fixture("billetreduc_detail.html")
    fetched = []
    budget = {"left": 10_000.0}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get_text(self, url):
            fetched.append(url)
            budget["left"] -= 1.0
            return detail if "/spectacle/" in url else listing

    monkeypatch.setattr(mod, "PoliteClient", FakeClient)
    monkeypatch.setattr(mod, "_budget_left", lambda: budget["left"])
    monkeypatch.setattr(mod, "LISTINGS", [("/theatre", "theatre"), ("/humour", "spectacles")])
    budget["left"] = mod.BUDGET_MARGIN + 30  # room for ~30 requests
    evs = list(mod.fetch_events())
    listings = [u for u in fetched if "/spectacle/" not in u]
    assert listings[:2] == ["https://www.billetreduc.com/theatre", "https://www.billetreduc.com/humour"]
    # every listing page carries the same 20 shows here: they are opened once
    assert len(evs) == len([u for u in fetched if "/spectacle/" in u]) <= 20
    assert budget["left"] >= mod.BUDGET_MARGIN - 1
