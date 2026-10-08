from __future__ import annotations

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.timeout_paris import parse_detail, parse_listing

URL = "https://www.timeout.fr/paris/art/eva-gonzales-parcours-dune-artiste-libre-au-petit-palais"


def test_listing_urls():
    urls = parse_listing(load_fixture("timeout_listing_expos.html"))
    assert URL in urls
    assert all(u.startswith("https://www.timeout.fr/paris/") for u in urls)
    assert not any("/actualites/" in u or "/restaurants" in u for u in urls)


def test_detail_review_item_reviewed_event():
    evs = parse_detail(load_fixture("timeout_detail_expo.html"), URL)
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["source"] == "timeout"
    assert ev["source_id"] == URL
    # title from <h1>, not the editorial JSON-LD headline
    assert ev["title"] == "Eva Gonzalès, Parcours d’une artiste libre, au Petit Palais"
    assert ev["start_date"] == "2026-10-07T08:00:00+00:00"  # 10:00 Paris (+02:00)
    assert ev["end_date"].startswith("2027-01-24")
    assert ev["venue_name"] == "Petit Palais"
    assert ev["venue_zip"] == "75008"
    # Time Out types it TheaterEvent; the /paris/art/ section wins
    assert ev["category_slug"] == "expos"
    # no price shown on the page → unknown, never free
    assert ev["price_status"] == "unknown" and ev["is_free"] is False


def test_article_page_is_skipped():
    url = "https://www.timeout.fr/paris/que-faire-a-paris/5-choses-a-faire-aujourdhui"
    assert parse_detail(load_fixture("timeout_detail_article.html"), url) == []


def test_occurrence_price_is_scoped_to_tile():
    html = load_fixture("timeout_detail_expo.html").replace(
        '<div class="_price_1uzv8_48"></div>', '<div class="_price_1uzv8_48">15 €</div>', 1
    )
    ev = parse_detail(html, URL)[0]
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1500, 1500, "paid")


def test_sitemap_event_sections_and_lastmod_window():
    """Sitemap (trimmed sitemap_0.xml.gz, 2026-10-09): only event-section detail URLs,
    modified on/after `since`; news, restaurants and hub pages are ignored."""
    from datetime import date

    from spiders.timeout_paris import parse_sitemap

    xml = load_fixture("timeout_sitemap_0.xml")
    every = parse_sitemap(xml)
    assert URL in every
    assert all(u.split("/")[4] in {"art", "musique", "theatre", "danse", "que-faire-a-paris"} for u in every)
    assert not any("/actualites/" in u or "/restaurants/" in u for u in every)
    recent = parse_sitemap(xml, since=date(2026, 9, 20))
    assert URL in recent  # lastmod 2026-09-21
    assert "https://www.timeout.fr/paris/art/leandro-erlich-au-grand-palais" in every
    assert "https://www.timeout.fr/paris/art/leandro-erlich-au-grand-palais" not in recent  # 2026-06-18


def test_venue_outside_petite_couronne_is_skipped():
    html = load_fixture("timeout_detail_expo.html").replace("75008", "78000")
    assert parse_detail(html, URL) == []
