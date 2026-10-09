"""Lot 1 — title clean-up, junk markers, zips, placeholder venues, categories, prices."""

from datetime import datetime, timezone

import pytest

from utils.event import make_event
from utils.normalize import (
    detect_category,
    far_from_zone,
    is_placeholder_venue,
    normalize_zip,
    parse_price_fr,
    title_category_override,
)
from utils.titles import smart_title_case, strip_date_affixes, strip_for_matching, title_flags
from validation import decide_status, validate

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


def ev(**over):
    base = dict(
        source="test", source_id="1", title="Concert de Jazz manouche au Sunside",
        start="2026-10-20T21:00:00",
        description="Une soirée de jazz manouche avec le quartet de Paulo, entre swing et ballades, dans le club.",
        image_url="https://example.org/a.jpg", price_raw="15 €", venue_name="Sunset-Sunside",
        venue_zip="75001", venue_lat=48.8597, venue_lng=2.3477, category_slug="concerts",
    )
    base.update(over)
    return make_event(**base)


# ── titles ──

@pytest.mark.parametrize("raw,expected", [
    ("Jeanne Lee par Äulne – 09/10/2026 - 17:30", "Jeanne Lee par Äulne"),
    ("09.OCT | PARIS | Fakear", "Fakear"),
    ("Concert X - 9 octobre 2026 à 20h", "Concert X"),
    ("Expo Monet (09/10/2026)", "Expo Monet"),
    ("1984", "1984"),
    ("Show 2026", "Show 2026"),
    ("Les Misérables", "Les Misérables"),
])
def test_strip_date_affixes(raw, expected):
    assert strip_date_affixes(raw) == expected


def test_strip_for_matching_editorial_tail():
    assert strip_for_matching("Fakear en concert à Paris au Bataclan le 9 octobre 2026") == "Fakear"
    assert strip_for_matching("Fakear (COMPLET)") == "Fakear"


@pytest.mark.parametrize("raw,title,cancelled,sold_out", [
    ("FAKEAR (COMPLET)", "FAKEAR", False, True),
    ("ANNULÉ - Concert de Paul", "Concert de Paul", True, False),
    # "reporté" is not a cancellation (the event usually has a new date)
    ("Concert de Paul (reporté)", "Concert de Paul (reporté)", False, False),
    ("Fakear - sold out", "Fakear", False, True),
    ("Fakear COMPLET", "Fakear", False, True),
    ("Le mariage annulé", "Le mariage annulé", False, False),  # a play title, not a status
    ("Cancelled: Big Show", "Big Show", True, False),
    # real titles seen in production (9 Oct 2026)
    ("ANNULÉ Apprendre un mouvement d'Hofesh Shechter", "Apprendre un mouvement d'Hofesh Shechter", True, False),
    ("Rencontre annulée : Lilia Hassaine", "Rencontre : Lilia Hassaine", True, False),
    ("Annulé en raison d’un nombre insuffisant de participants. CHAVILLE - Balade nature",
     "CHAVILLE - Balade nature", True, False),
    ("Saez à l'Arena Porte de la Chapelle : son concert reporté à l'automne 2027",
     "Saez à l'Arena Porte de la Chapelle : son concert reporté à l'automne 2027", False, False),
    ("BIGA*RANX - ZENITH - PARIS - COMPLET", "BIGA*RANX - ZENITH - PARIS", False, True),
    ("Jean Zay, l'homme complet", "Jean Zay, l'homme complet", False, False),
    ("JEAN ZAY L'HOMME COMPLET - JEAN ZAY LHOMME COMPLET", "JEAN ZAY L'HOMME COMPLET - JEAN ZAY LHOMME COMPLET",
     False, False),
    ("“Le jeudi c’est impro” : le spectacle est déjà presque complet le 15 octobre",
     "“Le jeudi c’est impro” : le spectacle est déjà presque complet le 15 octobre", False, False),
    ("La Terre parle quand on creuse - Grand Reporterre #6", "La Terre parle quand on creuse - Grand Reporterre #6",
     False, False),
])
def test_title_flags(raw, title, cancelled, sold_out):
    assert title_flags(raw) == (title, cancelled, sold_out)


@pytest.mark.parametrize("raw,expected", [
    ("LES 4 SAISONS DE VIVALDI", "Les 4 Saisons de Vivaldi"),
    ("L’AVARE DE MOLIÈRE", "L’Avare de Molière"),
    ("DJ SNAKE AU STADE DE FRANCE", "DJ Snake au Stade de France"),
    ("UGC CINÉ CITÉ LES HALLES", "UGC Ciné Cité les Halles"),
    ("MK2 BIBLIOTHÈQUE", "MK2 Bibliothèque"),
    ("LOUIS XIV ET LA DANSE", "Louis XIV et la Danse"),
    ("SAINT-GERMAIN-DES-PRÉS", "Saint-Germain-des-Prés"),
    ("TAHITI 80", "Tahiti 80"),
    ("ELI", "ELI"),  # too short to judge
    ("Normal Title", "Normal Title"),
    ("Concert de PNL", "Concert de PNL"),
])
def test_smart_title_case(raw, expected):
    assert smart_title_case(raw) == expected


def test_validation_cleans_titles_and_flags():
    out, hard, soft, score = validate(ev(title="ANNULÉ - Concert de Paul"), now=NOW)
    assert out.title == "Concert de Paul" and "cancelled" in hard
    assert decide_status(hard, score) == "cancelled"

    out, hard, soft, _ = validate(ev(title="FAKEAR (COMPLET)"), now=NOW)
    assert out.title == "Fakear" and hard == []
    assert "sold_out" in soft and "complet" in out.tags_raw

    out, hard, soft, score = validate(ev(title="09.OCT | PARIS | THE GETDOWN"), now=NOW)
    assert out.title == "The Getdown" and score == 100  # sold_out-free, no penalty


# ── default times ──

@pytest.mark.parametrize("start,known", [
    ("2026-10-20T00:00:00", False),
    ("2026-10-20T23:59:00", False),
    ("2026-10-20T21:00:00", True),
    ("2026-10-20T00:30:00", True),
])
def test_midnight_and_2359_are_unknown_times(start, known):
    out, _, soft, _ = validate(ev(start=start), now=NOW)
    assert out.time_known is known
    assert ("time_unknown" in soft) is (not known)


# ── zips, placeholder venues, out of zone ──

@pytest.mark.parametrize("raw,expected", [
    ("75 018", "75018"), ("75018.", "75018"), ("75002 Paris", "75002"), ("75010 - 75018", "75010"),
    ("750009", "75009"), ("7500", None), ("à", None), ("à venir", None), ("1050", None),
    ("H2G 1N2", None), ("92100", "92100"), (None, None), (75011, "75011"),
])
def test_normalize_zip(raw, expected):
    assert normalize_zip(raw) == expected


def test_make_event_and_validation_normalize_zip():
    assert ev(venue_zip="75 011")["venue_zip"] == "75011"
    raw = ev()
    raw["venue_zip"] = "à"
    out, hard, _, _ = validate(raw, now=NOW)
    assert out.venue_zip is None and hard == []


@pytest.mark.parametrize("name,expected", [
    ("Adresse communiquée à l'inscription", True),
    ("Adresse précisée après inscription", True),
    ("Lieu secret", True),
    ("à venir", True),
    ("Le Bataclan", False),
    ("Lieu-dit", False),
])
def test_placeholder_venue(name, expected):
    assert is_placeholder_venue(name) is expected


def test_placeholder_and_far_venues_rejected():
    _, hard, _, _ = validate(ev(venue_name="Adresse communiquée à l'inscription", venue_zip=None,
                                venue_lat=None, venue_lng=None), now=NOW)
    assert "placeholder_venue" in hard
    _, hard, _, _ = validate(ev(venue_name="Auditorium de la Grotte Cosquer, Marseille", venue_zip=None,
                                venue_lat=None, venue_lng=None), now=NOW)
    assert "out_of_zone" in hard
    _, hard, _, _ = validate(ev(venue_zip="91470", venue_lat=None, venue_lng=None), now=NOW)
    assert "out_of_zone" in hard


def test_far_from_zone_does_not_match_street_names():
    assert far_from_zone("Le Bar", "12 rue de Marseille", "Paris") is False
    assert far_from_zone("La Loge", "86 rue de l’Ermitage, 1050 Bruxelles, Belgique", "Ixelles") is True
    assert far_from_zone("Théâtre de Lyon", None, None) is False  # name only, no ", Lyon" suffix
    assert far_from_zone("Salle", None, "Rouen") is True


# ── prices ──

@pytest.mark.parametrize("raw,status,pmin,pmax", [
    ("Tarif plein, valable jusqu'au 10 mars 2026 - 12 €", "paid", 1200, 1200),
    ("Saison 2026 à 12 €", "paid", 1200, 1200),
    ("2026 €", "unknown", 0, 0),
    ("Stage 1 semaine : 1040 €", "unknown", 0, 0),
    ("De 12 € à 25 €", "paid", 1200, 2500),
])
def test_prices_years_and_cap(raw, status, pmin, pmax):
    p = parse_price_fr(raw)
    assert (p["price_status"], p["price_min"], p["price_max"]) == (status, pmin, pmax)


# ── categories ──

@pytest.mark.parametrize("title,current,expected", [
    ("Blind test spécial années 80", "concerts", "soirees"),
    ("Soirée karaoké", "theatre", "soirees"),
    ("Afterwork au musée", "expos", "soirees"),
    ("Atelier gravure", "expos", "ateliers"),
    ("Conférence : l'art du vitrail", "expos", "conferences"),
    ("Projection : Les Enfants du paradis", "festivals", None),  # festival label kept
    ("DJ set au Rex Club", "festivals", None),
    ("Concert de jazz", "concerts", None),
])
def test_title_category_override(title, current, expected):
    assert title_category_override(title, current) == expected


def test_detect_category_new_slugs():
    assert detect_category(None, "Yoga au parc de la Villette") == "sport"
    assert detect_category("Paris sport proximité", "Gym douce") == "sport"
    assert detect_category(None, "Boum des enfants") == "soirees"
    assert detect_category(None, "Rencontre avec Annie Ernaux") == "conferences"


def test_evening_expo_slot_with_talk_description_is_a_conference():
    raw = ev(title="Gustave Eiffel, un influenceur avant l'heure ?", category_slug="expos",
             start="2026-10-20T19:00:00", end="2026-10-20T21:00:00",
             description="Une conférence illustrée par l'historien de l'art, suivie d'un débat avec le public.")
    out, _, _, _ = validate(raw, now=NOW)
    assert out.category_slug == "conferences"
    # a real exhibition (date range, no time) keeps its category
    raw = ev(title="Monet", category_slug="expos", start="2026-10-01", end="2027-01-10",
             description="Une conférence inaugurale aura lieu le premier jour de l'exposition.")
    assert validate(raw, now=NOW)[0].category_slug == "expos"
