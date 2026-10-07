from __future__ import annotations

import json

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.lebonbon import parse_page

ARTICLE_URL = "https://www.lebonbon.fr/paris/loisirs/halloween-musee-curie-organise-murder-party-effrayante/"


def test_real_listing_and_article_yield_nothing():
    # Live pages (2026-10-07): editorial NewsArticle only → never ingested as events.
    assert parse_page(load_fixture("lebonbon_listing_sorties.html")) == []
    assert parse_page(load_fixture("lebonbon_article.html"), ARTICLE_URL) == []


def _page(*objs):
    scripts = "".join(
        f'<script type="application/ld+json">{json.dumps(o)}</script>' for o in objs
    )
    return f"<html><head>{scripts}</head><body></body></html>"


def test_only_events_with_date_and_venue_and_absolute_urls():
    # Structure-only test of the acceptance rule (schema.org shapes, not source data).
    with_venue = {
        "@type": "Event", "name": "Agenda item", "startDate": "2026-10-31T20:00:00+01:00",
        "url": "/paris/agenda/item/",
        "location": {"@type": "Place", "name": "Salle X",
                     "address": {"@type": "PostalAddress", "postalCode": "75011", "addressLocality": "Paris"}},
    }
    no_venue = {"@type": "Event", "name": "No venue", "startDate": "2026-10-31"}
    article = {"@type": "NewsArticle", "headline": "Article", "datePublished": "2026-10-04"}
    evs = parse_page(_page(with_venue, no_venue, article), "https://www.lebonbon.fr/paris/sorties/")
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["source_url"] == "https://www.lebonbon.fr/paris/agenda/item/"
    assert ev["start_date"] == "2026-10-31T19:00:00+00:00"
    assert ev["venue_name"] == "Salle X"
