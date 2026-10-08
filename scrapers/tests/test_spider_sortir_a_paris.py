from __future__ import annotations

from datetime import date

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.sortir_a_paris import parse_detail, parse_listing

TODAY = date(2026, 10, 7)
URL = "https://www.sortiraparis.com/scenes/concert-musique/articles/351854-stevie-wonder-en-concert-a-paris-bercy-en-octobre-2026"


def test_listing_keeps_only_category_articles():
    urls = parse_listing(load_fixture("sortiraparis_listing_expos.html"), "/arts-culture/exposition")
    assert urls
    assert all("/arts-culture/exposition/articles/" in u for u in urls)
    assert all(u.startswith("https://www.sortiraparis.com/") for u in urls)
    assert len(urls) == len(set(urls))


def test_concert_detail():
    evs = parse_detail(load_fixture("sortiraparis_detail_concert.html"), URL, "concerts", today=TODAY)
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["source"] == "sortiraparis"
    assert ev["source_id"] == "351854"
    assert ev["title"].startswith("Stevie Wonder")
    # "Le 15 octobre 2026" — no time on the page → date only, time unknown (12:00 Paris)
    assert ev["start_date"] == "2026-10-15T10:00:00+00:00"
    assert ev["time_known"] is False
    assert ev["venue_name"] == "Accor Arena"
    assert ev["venue_zip"] == "75012"
    assert ev["venue_lat"] == 48.838604
    # "78,5€ - 276,5€" scoped to the Tarifs block
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (7850, 27650, "paid")
    assert ev["category_slug"] == "concerts"


def test_expo_range_with_year_rollover():
    url = "https://www.sortiraparis.com/arts-culture/exposition/articles/331890-mary-cassatt"
    ev = parse_detail(load_fixture("sortiraparis_detail_expo.html"), url, "expos", today=TODAY)[0]
    assert_valid_event(ev)
    assert ev["start_date"].startswith("2026-10-06")
    assert ev["end_date"].startswith("2027-01-31")
    assert ev["venue_name"] == "Musée d'Orsay"
    assert ev["venue_arrondissement"] == "7e"
    # "Tarif -18 ans : Gratuit / 12€ / 13€ - 16€" → paid with a free tier, not free
    assert ev["is_free"] is False and ev["price_max"] == 1600


def test_venue_guide_without_real_date_is_skipped():
    # "Prochains jours" + opening hours only: never default to today.
    url = "https://www.sortiraparis.com/arts-culture/exposition/articles/114089-bourse-de-commerce"
    assert parse_detail(load_fixture("sortiraparis_detail_venue_guide.html"), url, "expos", today=TODAY) == []


def test_description_from_article_jsonld():
    ev = parse_detail(load_fixture("sortiraparis_detail_concert.html"), URL, "concerts", today=TODAY)[0]
    assert ev["description"]


def test_guide_links_event_sections_only():
    """'Les belles expositions à voir en ce moment' guide (links only, 2026-10-09):
    article links of event sections are kept, restaurants / trips outside Paris are not."""
    from spiders.sortir_a_paris import category_for_url, parse_links

    articles, guides = parse_links(load_fixture("sortiraparis_guide_expos.html"))
    assert len(articles) >= 15
    assert all("/articles/" in u for u in articles)
    assert not any("/hotel-restaurant/" in u or "/sortir-de-paris/" in u for u in articles)
    assert len(articles) == len(set(articles))
    assert all("/guides/" in g for g in guides)
    expo = next(u for u in articles if "/arts-culture/exposition/articles/" in u)
    assert category_for_url(expo) == "expos"
    assert category_for_url("https://www.sortiraparis.com/scenes/spectacle/articles/1-x") == "spectacles"
    assert category_for_url("https://www.sortiraparis.com/actualites/a-paris/articles/1-x") is None


def test_zone_is_paris_and_petite_couronne():
    from spiders.sortir_a_paris import _in_zone_place

    assert _in_zone_place("75012", None, None)
    assert _in_zone_place("93200", None, None)
    assert not _in_zone_place("78000", 48.80, 2.13)  # Versailles: postcode wins
    assert _in_zone_place(None, 48.85, 2.35)
    assert not _in_zone_place(None, 48.40, 2.70)  # Fontainebleau
    assert not _in_zone_place(None, None, None)


def test_ephemeride_articles_are_not_events():
    from spiders.sortir_a_paris import parse_links

    html = ('<a href="/actualites/a-paris/articles/353001-ephemeride-du-5-octobre-a-paris-le-louxor">x</a>'
            '<a href="/scenes/theatre/articles/353002-une-piece">y</a>')
    articles, _ = parse_links(html)
    assert articles == ["https://www.sortiraparis.com/scenes/theatre/articles/353002-une-piece"]
    detail = load_fixture("sortiraparis_detail_concert.html")
    patched = detail.replace("<h1", "<h1 data-x='1'", 1)
    import re as _re
    patched = _re.sub(r"(<h1[^>]*>)(.*?)(</h1>)", r"\1Éphéméride du 5 octobre à Paris : le Louxor\3", patched,
                      count=1, flags=_re.S)
    assert parse_detail(patched, URL, "concerts", today=TODAY) == []
