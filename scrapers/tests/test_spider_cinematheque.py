"""La Cinémathèque française: real pages fetched 2026-10-09 (trimmed): monthly
calendar days, one séance page, the price grid of the practical-information page."""
from __future__ import annotations

from datetime import date

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.cinematheque import (
    build_event,
    parse_calendar,
    parse_seance_page,
    parse_tarifs,
)

TODAY = date(2026, 10, 9)


def _tarifs():
    return parse_tarifs(load_fixture("cinematheque_infos_pratiques.html"))


def _seances(today=TODAY):
    return parse_calendar(load_fixture("cinematheque_calendrier.html"), today)


def _by_id(items, sid):
    return next(s for s in items if s["id"] == sid)


def test_price_grid_public_tiers_only():
    t = _tarifs()
    # Tarif A: plein 7 €, réduit 5,50 €, handicap 3,50 €, 18-25 / -18 : 4 € (cards excluded)
    assert (t["A"]["price_min"], t["A"]["price_max"]) == (350, 700)
    assert (t["B"]["price_min"], t["B"]["price_max"]) == (500, 950)
    assert set(t) == {"A", "B", "C", "D"}


def test_calendar_skips_past_days_and_reads_times():
    all_days = _seances(today=None)
    upcoming = _seances()
    assert len(all_days) > len(upcoming) > 50
    assert all(s["start"].date() >= TODAY for s in upcoming)
    s = _by_id(upcoming, "45681")  # vendredi 9 octobre 2026, 15h00, salle HL
    assert s["start"].isoformat() == "2026-10-09T15:00:00"
    assert s["room"] == "HL"
    assert s["films"] == [{"title": "Elle et lui", "real": "Leo McCarey, 1957"}]


def test_screening_event_tarif_a_by_default():
    ev = build_event(_by_id(_seances(), "45681"), _tarifs())
    assert_valid_event(ev)
    assert ev["source"] == "cinematheque"
    assert ev["source_id"] == "45681"
    assert ev["title"] == "Elle et lui"
    assert ev["start_date"] == "2026-10-09T13:00:00+00:00"  # 15:00 Paris (CEST)
    assert ev["time_known"] is True
    assert ev["category_slug"] == "cinema"
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (350, 700, "paid")
    assert ev["venue_name"] == "La Cinémathèque française"
    assert ev["venue_address"] == "51 rue de Bercy" and ev["venue_zip"] == "75012"
    assert ev["source_url"] == "https://www.cinematheque.fr/seance/45681.html"
    assert "Leo McCarey" in ev["description"]


def test_tarif_b_badges_and_seance_page_enrichment():
    s = _by_id(_seances(), "45797")
    # "CM" (short film) and age badges are not part of the film title
    assert s["films"][0]["title"] == "Le Voyage dans la Lune"
    detail = parse_seance_page(load_fixture("cinematheque_seance_45797.html"))
    assert detail["image"].startswith("https://www.cinematheque.fr/media/")
    assert detail["room"] == "Salle Henri Langlois"
    ev = build_event(s, _tarifs(), detail)
    assert_valid_event(ev)
    assert ev["title"] == "Le Voyage dans la Lune / 2001 : l'Odyssée de l'espace"
    assert (ev["price_min"], ev["price_max"]) == (500, 950)  # "TARIF B"
    assert ev["end_date"] == "2026-10-10T16:15:00+00:00"  # 14h30 → 18h15 Paris
    assert ev["image_url"] == detail["image"]
    assert "Stanley Kubrick" in ev["description"]
    assert "Salle Henri Langlois" in ev["tags_raw"]


def test_non_screening_categories_and_prices():
    t = _tarifs()
    seances = _seances()
    talk = build_event(_by_id(seances, "46046"), t)  # rencontre de la bibliothèque
    assert talk["category_slug"] == "conferences"
    assert talk["price_status"] == "free"  # "Entrée libre sur inscription"
    visit = build_event(_by_id(seances, "46014"), t)
    assert visit["category_slug"] == "visites"
    assert visit["price_status"] == "unknown"  # visits have their own prices: never guessed
    workshop = build_event(_by_id(seances, "45949"), t)
    assert workshop["category_slug"] == "ateliers"
    assert workshop["start_date"] == "2026-10-21T08:00:00+00:00"


def test_private_subscriber_screening_is_skipped():
    s = _by_id(_seances(), "45894")  # "Séance privée réservée aux Libre Pass."
    assert build_event(s, _tarifs()) is None


def test_unknown_price_without_grid():
    ev = build_event(_by_id(_seances(), "45681"), {})
    assert ev["price_status"] == "unknown"
