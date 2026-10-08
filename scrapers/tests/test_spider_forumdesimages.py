"""Forum des images: real pages fetched 2026-10-09 (trimmed): /agenda days and one
session page."""
from __future__ import annotations

from datetime import date

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.forumdesimages import build_event, category_for, parse_agenda, parse_session_page

TODAY = date(2026, 10, 9)


def _sessions(today=TODAY):
    return parse_agenda(load_fixture("forumdesimages_agenda.html"), today)


def _by_slug(items, slug):
    return next(s for s in items if s["id"].startswith(slug + "@"))


def test_agenda_days_times_and_past_days():
    all_days = _sessions(today=None)
    upcoming = _sessions()
    assert len(all_days) == 20 and len(upcoming) == 15
    assert all(s["start"].date() >= TODAY for s in upcoming)
    s = _by_slug(upcoming, "annie-colere-1")
    assert s["start"].isoformat() == "2026-10-10T15:00:00"  # day anchor + "15h"
    assert s["booking_id"] == "1131103"
    assert s["directors"] == ["Blandine Lenoir"]
    assert s["type"] == "Film"
    assert s["cycle"] == "Sois belle et tais-toi !"
    assert s["image"].startswith("https://www.forumdesimages.fr/sites/default/files/")


def test_listing_only_event_has_unknown_price():
    ev = build_event(_by_slug(_sessions(), "la-belle-saison-0"))
    assert_valid_event(ev)
    assert ev["source"] == "forumdesimages"
    assert ev["source_id"] == "la-belle-saison-0@2026-10-10T17:30"
    assert ev["start_date"] == "2026-10-10T15:30:00+00:00"  # 17:30 Paris (CEST)
    assert ev["time_known"] is True
    assert ev["price_status"] == "unknown"  # no session page read: never guessed
    assert ev["category_slug"] == "cinema"
    assert ev["venue_name"] == "Forum des images"
    assert ev["venue_zip"] == "75001" and ev["venue_address"] == "2 rue du Cinéma"
    assert ev["booking_url"].startswith("https://billetterie.forumdesimages.fr/")


def test_session_page_price_description_image():
    detail = parse_session_page(load_fixture("forumdesimages_session.html"))
    # "Tarif plein : 7,50€, réduit : 6€"
    assert (detail["price"]["price_min"], detail["price"]["price_max"]) == (600, 750)
    assert detail["image"].endswith("Local-Films-1920.jpg")
    assert "Février 1974" in detail["description"]
    ev = build_event(_by_slug(_sessions(), "annie-colere-1"), detail)
    assert_valid_event(ev)
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (600, 750, "paid")
    assert ev["image_url"] == detail["image"]
    assert "Laure Calamy" in ev["description"]


def test_categories_and_cancelled_flag():
    sessions = _sessions(today=None)
    mc = build_event(_by_slug(sessions, "cine-rencontre-avec-audrey-diwan-et-sa-coscenariste-maria-romano"))
    assert mc["category_slug"] == "conferences"  # "Master class"
    course = build_event(_by_slug(sessions, "delphine-seyrig-de-la-muse-insoumise-licone-queer"))
    assert course["category_slug"] == "conferences"  # "Les cours du vendredi"
    cancelled = build_event(_by_slug(sessions, "rencontre-avec-elodie-hachet-autrice-de-2025-lodyssee-de-lia"
                                               "-representation-et-usages-de-lia-au"))
    assert cancelled["event_status"] == "cancelled"
    assert not cancelled["title"].startswith("[")
    assert category_for("Film + débat") == "cinema"
    assert category_for("Jeu de rôle en public") == "spectacles"


def test_talk_titles_filed_as_film_are_conferences():
    assert category_for("Film", "Rencontre avec Guillaume Massart") == "conferences"
    assert category_for("Film", "Maestraclasse de Mariana Otero") == "conferences"
    assert category_for("Film", "Entre nos mains") == "cinema"
